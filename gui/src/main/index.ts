import { join } from 'node:path';
import { watch as watchDir, type FSWatcher } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createEngine } from '../../../src/create-engine.js';
import { SkillsAdapter } from '../../../src/adapters/skills-adapter.js';
import { getApiBaseUrl } from '../../../src/config/website.js';
import { DiskWatch } from '../../../src/watch/disk-watch.js';
import type { ICollectionEngine } from '../../../src/interfaces/engine.js';
import type { BrowseView, IDE } from '../../../src/types/index.js';
import { IPC_CHANNELS } from '../shared/ipc.js';

const WATCH_ROOTS = [
  '.cursor/skills',
  '.claude/skills',
  '.windsurf/skills',
  '.agents/skills',
  '.cursor/commands',
  '.claude/commands',
  '.windsurf/workflows',
  '.agents/commands',
] as const;

// Session-only project bind. Discover search/browse never need a folder.
// Until the user connects one in Sync, collections persist under Electron
// userData so people can sketch without a repo. Pick rebuilds against that
// path — no chdir, no last-folder file.
let engine: ICollectionEngine | null = null;
let projectRoot: string | null = null;
let diskWatch: DiskWatch | null = null;
let fsWatchers: FSWatcher[] = [];
const discovery = new SkillsAdapter(getApiBaseUrl());

function currentEngine(): ICollectionEngine {
  if (!engine) {
    engine = createEngine(join(app.getPath('userData'), 'workspace'));
  }
  return engine;
}

function muteOwnWrites(): void {
  diskWatch?.mute(currentEngine().lastWrittenPaths());
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
      bound.scan();
      diskWatch?.mute(bound.lastWrittenPaths());
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
}

async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}

ipcMain.handle(IPC_CHANNELS.getProjectRoot, () => projectRoot);
ipcMain.handle(IPC_CHANNELS.pickProjectFolder, async () => {
  const picked = await pickDirectory();
  if (picked === null) {
    return null;
  }
  try {
    engine = createEngine(picked);
  } catch (error) {
    dialog.showErrorBox('skil', error instanceof Error ? error.message : String(error));
    return null;
  }
  projectRoot = picked;
  startDiskWatch(picked);
  return projectRoot;
});
ipcMain.handle(IPC_CHANNELS.pickDestinationFolder, () => pickDirectory());

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
  IPC_CHANNELS.exportCommand,
  async (_event, name: string, targetIDE: IDE, opts?: { replace?: boolean; dest?: string }) => {
    const result = await currentEngine().exportCommand(name, targetIDE, opts);
    muteOwnWrites();
    return result;
  }
);
ipcMain.handle(
  IPC_CHANNELS.exportAll,
  async (_event, targetIDE: IDE, opts?: { replace?: boolean; dest?: string }) => {
    const result = await currentEngine().exportAll(targetIDE, opts);
    muteOwnWrites();
    return result;
  }
);
ipcMain.handle(
  IPC_CHANNELS.copyTo,
  async (_event, name: string, fromIde: IDE, toIde: IDE, opts?: { replace?: boolean; dest?: string }) => {
    const result = await currentEngine().copyTo(name, fromIde, toIde, opts);
    muteOwnWrites();
    return result;
  }
);
ipcMain.handle(
  IPC_CHANNELS.copyAll,
  async (_event, fromIde: IDE, toIde: IDE, opts?: { replace?: boolean; dest?: string }) => {
    const result = await currentEngine().copyAll(fromIde, toIde, opts);
    muteOwnWrites();
    return result;
  }
);
ipcMain.handle(IPC_CHANNELS.searchSkills, (_event, query: string) => discovery.search(query));
ipcMain.handle(IPC_CHANNELS.browseSkills, (_event, view: BrowseView) => discovery.browse(view));
ipcMain.handle(IPC_CHANNELS.listInbox, () => currentEngine().inbox());
ipcMain.handle(IPC_CHANNELS.listSkills, () => (projectRoot ? currentEngine().skills() : []));
ipcMain.handle(IPC_CHANNELS.addToInbox, (_event, skillId: string) => currentEngine().addToInbox(skillId));
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
  return result;
});
ipcMain.handle(IPC_CHANNELS.install, (_event, skillId: string, targetIDE: IDE, opts?: { dest?: string }) =>
  currentEngine().install(skillId, targetIDE, opts)
);

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'skil',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopDiskWatch();
  if (process.platform !== 'darwin') app.quit();
});
