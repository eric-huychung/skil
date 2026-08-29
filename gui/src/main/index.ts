import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, watch as watchDir, type FSWatcher } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createEngine } from '../../../src/create-engine.js';
import { SkillsAdapter } from '../../../src/adapters/skills-adapter.js';
import { getApiBaseUrl } from '../../../src/config/website.js';
import { RULE_DIR_BY_IDE, ROOT_RULE_FILES } from '../../../src/core/project-rules.js';
import { watchRoots } from '../../../src/core/dock-layout.js';
import { createDiscover } from '../../../src/backend/discover.js';
import { DiskWatch, watchFilesByParent } from '../../../src/watch/disk-watch.js';
import type { ICollectionEngine } from '../../../src/interfaces/engine.js';
import type { IDE, ScanResult } from '../../../src/types/index.js';
import { isOk } from '../../../src/core/result.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { forgetFolder, parseRecentFolders, rememberFolder } from '../shared/recent-folders.js';
import { marketInboxIds, mergeMarketInbox, rememberMarketSkill } from '../shared/market-inbox.js';

const WATCH_ROOTS = watchRoots(Object.values(RULE_DIR_BY_IDE));

// Project bind persists the last folder plus up to four more recents under
// Electron userData. Until the user connects one, collections live under
// userData so people can sketch without a repo. Pick rebuilds against that
// path — no chdir.
let engine: ICollectionEngine | null = null;
let projectRoot: string | null = null;
let recentFolders: string[] = [];
let marketInbox: string[] = [];
let diskWatch: DiskWatch | null = null;
let fsWatchers: FSWatcher[] = [];
const liveSkills = new SkillsAdapter(getApiBaseUrl());
const discover = createDiscover({
  apiBaseUrl: getApiBaseUrl(),
  browse: (view) => liveSkills.browse(view),
});

function currentEngine(): ICollectionEngine {
  if (!engine) {
    engine = createEngine(join(app.getPath('userData'), 'workspace'));
  }
  return engine;
}

function muteOwnWrites(): void {
  diskWatch?.mute(currentEngine().lastWrittenPaths());
}

function notifyScan(result: ScanResult): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.scanDidRun, result);
  }
}

function stopDiskWatch(): void {
  diskWatch?.stop();
  diskWatch = null;
  for (const watcher of fsWatchers) {
    watcher.close();
  }
  fsWatchers = [];
}

function startDiskWatch(root: string): void {
  stopDiskWatch();
  const bound = currentEngine();
  diskWatch = new DiskWatch({
    onFlush: () => {
      const result = bound.scan();
      diskWatch?.mute(bound.lastWrittenPaths());
      if (isOk(result)) {
        notifyScan(result.value);
      }
    },
  });
  for (const rel of WATCH_ROOTS) {
    try {
      const watcher = watchDir(join(root, rel), { recursive: true }, (_event, filename) => {
        if (filename) {
          diskWatch?.handleEvent(join(rel, String(filename)));
        }
      });
      fsWatchers.push(watcher);
    } catch {
      // Missing dir is fine — scan does not require every IDE tree.
    }
  }
  for (const { dir, names } of watchFilesByParent(ROOT_RULE_FILES.map((file) => file.path))) {
    try {
      const abs = dir ? join(root, dir) : root;
      const watcher = watchDir(abs, (_event, filename) => {
        if (!filename) return;
        const name = String(filename);
        if (!names.includes(name)) return;
        diskWatch?.handleEvent(dir ? `${dir}/${name}` : name);
      });
      fsWatchers.push(watcher);
    } catch {
      // Missing parent (.github) is fine — same as a missing rules dir.
    }
  }
}

async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

function recentsFilePath(): string {
  return join(app.getPath('userData'), 'recent-folders.json');
}

function loadRecentFolders(): string[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(recentsFilePath(), 'utf8'));
    return parseRecentFolders(raw).filter((path) => existsSync(path));
  } catch {
    return [];
  }
}

function saveRecentFolders(next: string[]): void {
  recentFolders = next;
  try {
    writeFileSync(recentsFilePath(), JSON.stringify(next));
  } catch {
    // Persist is best-effort — a full disk should not block bind.
  }
}

function captureMarketInbox(): void {
  if (!engine) return;
  marketInbox = mergeMarketInbox(marketInbox, marketInboxIds(engine.inbox(), engine.skills()));
}

function seedMarketInbox(target: ICollectionEngine): void {
  for (const id of marketInbox) {
    target.addToInbox(id);
  }
}

function bindProject(path: string): string | null {
  captureMarketInbox();
  try {
    engine = createEngine(path);
  } catch (error) {
    dialog.showErrorBox('skil', 'Could not open this folder.');
    return null;
  }
  seedMarketInbox(engine);
  projectRoot = path;
  startDiskWatch(path);
  saveRecentFolders(rememberFolder(path, recentFolders));
  return projectRoot;
}

function unbindProject(): void {
  captureMarketInbox();
  stopDiskWatch();
  engine = null;
  projectRoot = null;
  seedMarketInbox(currentEngine());
}

function restoreLastProject(): void {
  recentFolders = loadRecentFolders();
  saveRecentFolders(recentFolders);
  const last = recentFolders[0];
  if (last) {
    bindProject(last);
    return;
  }
  seedMarketInbox(currentEngine());
}

ipcMain.handle(IPC_CHANNELS.getProjectRoot, () => projectRoot);
ipcMain.handle(IPC_CHANNELS.listRecentFolders, () => recentFolders);
ipcMain.handle(IPC_CHANNELS.removeRecentFolder, (_event, path: string) => {
  saveRecentFolders(forgetFolder(path, recentFolders));
  if (path === projectRoot) unbindProject();
  return recentFolders;
});
ipcMain.handle(IPC_CHANNELS.pickProjectFolder, async () => {
  const picked = await pickDirectory();
  if (picked === null) {
    return null;
  }
  return bindProject(picked);
});
ipcMain.handle(IPC_CHANNELS.pickDestinationFolder, () => pickDirectory());
ipcMain.handle(IPC_CHANNELS.bindProjectFolder, (_event, path: string) => bindProject(path));

ipcMain.handle(IPC_CHANNELS.listCollections, (_event, ide?: IDE) => currentEngine().list(ide));
ipcMain.handle(IPC_CHANNELS.createCollection, (_event, name: string, skillIds: string[], ide?: IDE) => {
  const result = currentEngine().create(name, skillIds, undefined, ide);
  muteOwnWrites();
  return result;
});
ipcMain.handle(IPC_CHANNELS.removeSkillFromCollection, (_event, name: string, skillId: string, ide?: IDE) => {
  const result = currentEngine().removeSkill(name, skillId, ide);
  muteOwnWrites();
  return result;
});
ipcMain.handle(
  IPC_CHANNELS.exportAll,
  async (_event, targetIDE: IDE, opts?: { replace?: boolean; dest?: string }) => {
    const result = await currentEngine().exportAll(targetIDE, opts);
    muteOwnWrites();
    return result;
  }
);
ipcMain.handle(
  IPC_CHANNELS.importFrom,
  async (_event, sourceRoot: string, ide: IDE, opts?: { replace?: boolean }) => {
    const result = await currentEngine().importFrom(sourceRoot, ide, opts);
    muteOwnWrites();
    if (isOk(result)) {
      notifyScan({ added: [], gone: [], changed: [], commandPulls: [] });
    }
    return result;
  }
);
ipcMain.handle(IPC_CHANNELS.browseSkills, (_event, view) => discover.browse(view));
ipcMain.handle(IPC_CHANNELS.listInbox, () => currentEngine().inbox());
ipcMain.handle(IPC_CHANNELS.listSkills, () => (projectRoot ? currentEngine().skills() : []));
ipcMain.handle(IPC_CHANNELS.addToInbox, (_event, skillId: string) => {
  const result = currentEngine().addToInbox(skillId);
  if (isOk(result)) {
    marketInbox = rememberMarketSkill(skillId, marketInbox);
  }
  return result;
});
ipcMain.handle(IPC_CHANNELS.addSkill, (_event, name: string, skillId: string, ide?: IDE) => {
  const result = currentEngine().addSkill(name, skillId, ide);
  muteOwnWrites();
  return result;
});
ipcMain.handle(IPC_CHANNELS.deleteCollection, (_event, name: string, ide?: IDE) => {
  const result = currentEngine().delete(name, ide);
  muteOwnWrites();
  return result;
});
ipcMain.handle(IPC_CHANNELS.scan, () => {
  const result = currentEngine().scan();
  muteOwnWrites();
  if (isOk(result)) {
    notifyScan(result.value);
  }
  return result;
});
ipcMain.handle(IPC_CHANNELS.deleteSkill, (_event, skillId: string) => {
  const result = currentEngine().deleteSkill(skillId);
  muteOwnWrites();
  return result;
});
ipcMain.handle(IPC_CHANNELS.usage, () => currentEngine().usage());
ipcMain.handle(IPC_CHANNELS.marketShelves, () => discover.shelves());
ipcMain.handle(IPC_CHANNELS.marketSearch, (_event, query: string) => discover.search(query));
ipcMain.handle(IPC_CHANNELS.marketPreview, (_event, id: string) => discover.preview(id));
ipcMain.handle(IPC_CHANNELS.readSkillMd, (_event, skillId: string) => currentEngine().readSkillMd(skillId));
ipcMain.handle(IPC_CHANNELS.originChecks, () => currentEngine().originChecks());
ipcMain.handle(IPC_CHANNELS.updateFromMarket, async (_event, skillId: string, opts?: { replaceEdited?: boolean }) => {
  const result = await currentEngine().updateFromMarket(skillId, opts);
  muteOwnWrites();
  return result;
});
ipcMain.handle(IPC_CHANNELS.listRules, () => currentEngine().rules());
ipcMain.handle(IPC_CHANNELS.readRule, (_event, id: string) => currentEngine().readRule(id));
ipcMain.handle(IPC_CHANNELS.setAlwaysApply, (_event, id: string, alwaysApply: boolean) => {
  const result = currentEngine().setAlwaysApply(id, alwaysApply);
  muteOwnWrites();
  return result;
});
ipcMain.handle(
  IPC_CHANNELS.exportRules,
  async (_event, targetIDE: IDE, opts?: { replace?: boolean; dest?: string }) => {
    const result = await currentEngine().exportRules(targetIDE, opts);
    muteOwnWrites();
    return result;
  }
);

// Brand icon (regenerate via scripts/generate-icons.mjs). out/main -> gui/resources.
const APP_ICON = join(import.meta.dirname, '../../resources/icon.png');

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'skil',
    icon: APP_ICON,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      // ESM preload + sandbox:true can fail to expose window.skil → blank window.
      sandbox: false,
    },
  });

  window.on('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // BrowserWindow.icon only covers Windows/Linux; the macOS dock icon
  // (otherwise the default Electron logo in dev) is set on app.dock.
  if (process.platform === 'darwin') {
    app.dock?.setIcon(APP_ICON);
  }
  restoreLastProject();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopDiskWatch();
  if (process.platform !== 'darwin') app.quit();
});
