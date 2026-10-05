import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, watch as watchDir, type FSWatcher } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createEngine } from '../../../src/create-engine.js';
import { LlmCallCache } from '../../../src/llm/llm-call-cache.js';
import { SkillsAdapter } from '../../../src/adapters/skills-adapter.js';
import { getApiBaseUrl } from '../../../src/config/website.js';
import { GLOB_RULE_DIRS, ROOT_RULE_FILES } from '../../../src/core/project-rules.js';
import { watchRoots } from '../../../src/core/dock-layout.js';
import { createDiscover } from '../../../src/backend/discover.js';
import type { ShelfRole } from '../../../src/backend/market-types.js';
import { DiskWatch, watchFilesByParent } from '../../../src/watch/disk-watch.js';
import type { ICollectionEngine } from '../../../src/interfaces/engine.js';
import type { BrowseView, DriftAction, ScanResult } from '../../../src/types/index.js';
import { isOk } from '../../../src/core/result.js';
import type { LlmProvider } from '../../../src/llm/llm-chat.js';
import { IPC_CHANNELS } from '../shared/ipc.js';
import { checkAppUpdate, GITHUB_LATEST_RELEASE } from '../shared/app-update.js';
import { isAppNavigationUrl, isSafeExternalUrl } from '../shared/window-policy.js';
import { forgetFolder, parseRecentFolders, rememberFolder } from '../shared/recent-folders.js';
import { llmStatus, loadLlmChat, removeLlmKey, revealLlmKey, saveLlmSettings, setActiveLlmKey } from './llm-settings.js';

const WATCH_ROOTS = watchRoots(Object.keys(GLOB_RULE_DIRS));

// Project bind persists the last folder plus up to four more recents under
// Electron userData. Until the user connects one, collections live under
// userData so people can sketch without a repo. Pick rebuilds against that
// path — no chdir.
let engine: ICollectionEngine | null = null;
let projectRoot: string | null = null;
let recentFolders: string[] = [];
let diskWatch: DiskWatch | null = null;
let fsWatchers: FSWatcher[] = [];
/** Survives LLM key rebind. New project → new cache. */
let sessionLlmCache = new LlmCallCache();
const liveSkills = new SkillsAdapter(getApiBaseUrl());
const discover = createDiscover({
  apiBaseUrl: getApiBaseUrl(),
  browse: (view) => liveSkills.browse(view),
});

function currentEngine(): ICollectionEngine {
  if (!engine) {
    engine = createEngine(join(app.getPath('userData'), 'workspace'), loadLlmChat(), sessionLlmCache);
  }
  return engine;
}

/** Rebuilds the current session's engine against the same root with the latest saved LLM settings. */
function rebindLlmChat(): void {
  const root = projectRoot ?? join(app.getPath('userData'), 'workspace');
  engine = createEngine(root, loadLlmChat(), sessionLlmCache);
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
  for (const { dir, names } of watchFilesByParent(ROOT_RULE_FILES)) {
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

function bindProject(path: string): string | null {
  try {
    sessionLlmCache = new LlmCallCache();
    engine = createEngine(path, loadLlmChat(), sessionLlmCache);
  } catch (error) {
    dialog.showErrorBox('skil', 'Could not open this folder.');
    return null;
  }
  projectRoot = path;
  startDiskWatch(path);
  saveRecentFolders(rememberFolder(path, recentFolders));
  return projectRoot;
}

function unbindProject(): void {
  stopDiskWatch();
  engine = null;
  projectRoot = null;
  sessionLlmCache = new LlmCallCache();
}

function restoreLastProject(): void {
  recentFolders = loadRecentFolders();
  saveRecentFolders(recentFolders);
  const last = recentFolders[0];
  if (last) {
    bindProject(last);
  }
}

function safeHandle<T extends unknown[]>(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: T) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args: T) => {
    try {
      return await listener(event, ...args);
    } catch (error) {
      console.error(`ipc ${channel}`, error);
      throw new Error('Request failed.');
    }
  });
}

safeHandle(IPC_CHANNELS.getProjectRoot, () => projectRoot);
safeHandle(IPC_CHANNELS.listRecentFolders, () => recentFolders);
safeHandle(IPC_CHANNELS.removeRecentFolder, (_event, path: string) => {
  saveRecentFolders(forgetFolder(path, recentFolders));
  if (path === projectRoot) unbindProject();
  return recentFolders;
});
safeHandle(IPC_CHANNELS.pickProjectFolder, async () => {
  const picked = await pickDirectory();
  if (picked === null) {
    return null;
  }
  return bindProject(picked);
});
safeHandle(IPC_CHANNELS.bindProjectFolder, (_event, path: unknown) => {
  if (typeof path !== 'string' || path.trim() === '') return null;
  return bindProject(path);
});

safeHandle(IPC_CHANNELS.listCollections, () => currentEngine().list());
safeHandle(IPC_CHANNELS.createCollection, (_event, name: string, skillIds: string[]) => {
  const result = currentEngine().create(name, skillIds);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.removeSkillFromCollection, (_event, name: string, skillId: string) => {
  const result = currentEngine().removeSkill(name, skillId);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.setCommandEnabled, async (_event, name: string, enabled: boolean) => {
  const result = await currentEngine().setCommandEnabled(name, enabled);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.browseSkills, (_event, view: BrowseView) => discover.browse(view));
safeHandle(IPC_CHANNELS.listSkills, () => (projectRoot ? currentEngine().skills() : []));
safeHandle(IPC_CHANNELS.install, async (_event, skillId: string) => {
  const result = await currentEngine().install(skillId);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.addSkill, (_event, name: string, skillId: string) => {
  const result = currentEngine().addSkill(name, skillId);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.deleteCollection, (_event, name: string) => {
  const result = currentEngine().delete(name);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.scan, () => {
  const result = currentEngine().scan();
  muteOwnWrites();
  if (isOk(result)) {
    notifyScan(result.value);
  }
  return result;
});
safeHandle(IPC_CHANNELS.deleteSkill, (_event, skillId: string) => {
  const result = currentEngine().deleteSkill(skillId);
  muteOwnWrites();
  if (isOk(result)) {
    notifyScan({ added: [], gone: [skillId], changed: [], alwaysOnWarnings: [] });
  }
  return result;
});
safeHandle(IPC_CHANNELS.usage, () => currentEngine().usage());
safeHandle(IPC_CHANNELS.marketShelves, () => discover.shelves());
safeHandle(IPC_CHANNELS.marketSuggested, (_event, role?: string) => discover.suggested(role));
safeHandle(IPC_CHANNELS.marketCreators, () => discover.creators());
safeHandle(IPC_CHANNELS.marketCreator, (_event, slug: string) => discover.creator(slug));
safeHandle(IPC_CHANNELS.marketSearch, (_event, query: string) => discover.search(query));
safeHandle(IPC_CHANNELS.marketPreview, (_event, id: string) => discover.preview(id));
safeHandle(IPC_CHANNELS.readSkillMd, (_event, skillId: string) => currentEngine().readSkillMd(skillId));
safeHandle(IPC_CHANNELS.originChecks, () => currentEngine().originChecks());
safeHandle(IPC_CHANNELS.updateFromMarket, async (_event, skillId: string, opts?: { replaceEdited?: boolean }) => {
  const result = await currentEngine().updateFromMarket(skillId, opts);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.setSkillEnabled, async (_event, skillId: string, enabled: boolean) => {
  const result = await currentEngine().setSkillEnabled(skillId, enabled);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.listRules, () => currentEngine().rules());
safeHandle(IPC_CHANNELS.readRule, (_event, id: string) => currentEngine().readRule(id));
safeHandle(IPC_CHANNELS.setSharedRuleEnabled, (_event, id: string, enabled: boolean) => {
  const result = currentEngine().setSharedRuleEnabled(id, enabled);
  muteOwnWrites();
  return result;
});
safeHandle(IPC_CHANNELS.auditSync, () => currentEngine().auditSync());
safeHandle(IPC_CHANNELS.previewSync, (_event, path: string) => currentEngine().previewSync(path));
safeHandle(IPC_CHANNELS.importToCanonical, async (_event, ids: string[]) => {
  const result = await currentEngine().importToCanonical(ids);
  muteOwnWrites();
  if (isOk(result)) {
    notifyScan({ added: result.value.adopted, gone: [], changed: [], alwaysOnWarnings: [] });
  }
  return result;
});
safeHandle(IPC_CHANNELS.removeLeftovers, async (_event, paths: string[]) => {
  const result = await currentEngine().removeLeftovers(paths);
  muteOwnWrites();
  if (isOk(result)) {
    notifyScan({ added: [], gone: [], changed: [], alwaysOnWarnings: [] });
  }
  return result;
});
safeHandle(IPC_CHANNELS.resolveDrift, async (_event, id: string, action: DriftAction, path?: string) => {
  const result = await currentEngine().resolveDrift(id, action, path);
  muteOwnWrites();
  if (isOk(result)) {
    notifyScan({ added: result.value.adopted, gone: [], changed: [], alwaysOnWarnings: [] });
  }
  return result;
});
safeHandle(IPC_CHANNELS.health, () => currentEngine().health());
safeHandle(IPC_CHANNELS.llmStatus, () => llmStatus());
safeHandle(IPC_CHANNELS.saveLlmSettings, async (_event, provider: LlmProvider, apiKey: string) => {
  const result = await saveLlmSettings(provider, apiKey);
  if (isOk(result)) {
    rebindLlmChat();
  }
  return result;
});
safeHandle(IPC_CHANNELS.setActiveLlmKey, (_event, id: string) => {
  const result = setActiveLlmKey(id);
  if (isOk(result)) {
    rebindLlmChat();
  }
  return result;
});
safeHandle(IPC_CHANNELS.revealLlmKey, (_event, id: string) => revealLlmKey(id));
safeHandle(IPC_CHANNELS.removeLlmKey, (_event, id: string) => {
  const result = removeLlmKey(id);
  if (isOk(result)) {
    rebindLlmChat();
  }
  return result;
});
safeHandle(IPC_CHANNELS.suggest, (_event, shelves: ShelfRole[], role?: string) =>
  currentEngine().suggest(shelves, { role }),
);
safeHandle(IPC_CHANNELS.checkAppUpdate, () =>
  checkAppUpdate(app.getVersion(), async () => {
    const response = await fetch(GITHUB_LATEST_RELEASE, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'skil' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`github ${response.status}`);
    return response.json();
  }),
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
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload + sandbox:true can fail to expose window.skil → blank window.
      sandbox: false,
    },
  });

  const rendererDir = join(import.meta.dirname, '../renderer');
  const rendererFilePrefix = pathToFileURL(rendererDir.endsWith('/') ? rendererDir : `${rendererDir}/`).href;
  const openExternalIfSafe = (url: string): void => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  };
  const stayInApp = (event: { preventDefault: () => void }, url: string): void => {
    if (isAppNavigationUrl(url, { devServerUrl: process.env['ELECTRON_RENDERER_URL'], rendererFilePrefix })) return;
    event.preventDefault();
    openExternalIfSafe(url);
  };

  window.on('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', stayInApp);
  window.webContents.on('will-redirect', stayInApp);

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
