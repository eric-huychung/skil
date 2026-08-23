import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createEngine } from '../../../src/create-engine.js';
import { SkillsAdapter } from '../../../src/adapters/skills-adapter.js';
import { getApiBaseUrl } from '../../../src/config/website.js';
import type { ICollectionEngine } from '../../../src/interfaces/engine.js';
import type { BrowseView, IDE } from '../../../src/types/index.js';
import { IPC_CHANNELS } from '../shared/ipc.js';

// Session-only project bind. Discover search/browse never need a folder.
// Until the user connects one in Sync, collections persist under Electron
// userData so people can sketch without a repo. Pick rebuilds against that
// path — no chdir, no last-folder file.
let engine: ICollectionEngine | null = null;
let projectRoot: string | null = null;
const discovery = new SkillsAdapter(getApiBaseUrl());

function currentEngine(): ICollectionEngine {
  if (!engine) {
    engine = createEngine(join(app.getPath('userData'), 'workspace'));
  }
  return engine;
}

ipcMain.handle(IPC_CHANNELS.getProjectRoot, () => projectRoot);
ipcMain.handle(IPC_CHANNELS.pickProjectFolder, async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  projectRoot = result.filePaths[0];
  engine = createEngine(projectRoot);
  return projectRoot;
});

ipcMain.handle(IPC_CHANNELS.listCollections, () => currentEngine().list());
ipcMain.handle(IPC_CHANNELS.createCollection, (_event, name: string, skillIds: string[]) =>
  currentEngine().create(name, skillIds)
);
ipcMain.handle(IPC_CHANNELS.removeSkillFromCollection, (_event, name: string, skillId: string) =>
  currentEngine().removeSkill(name, skillId)
);
ipcMain.handle(IPC_CHANNELS.exportCollections, (_event, names: string[], targetIDE: IDE) =>
  currentEngine().export(names, targetIDE)
);
ipcMain.handle(IPC_CHANNELS.searchSkills, (_event, query: string) => discovery.search(query));
ipcMain.handle(IPC_CHANNELS.browseSkills, (_event, view: BrowseView) => discovery.browse(view));
ipcMain.handle(IPC_CHANNELS.listInbox, () => currentEngine().inbox());
ipcMain.handle(IPC_CHANNELS.addToInbox, (_event, skillId: string) => currentEngine().addToInbox(skillId));
ipcMain.handle(IPC_CHANNELS.addSkill, (_event, name: string, skillId: string) =>
  currentEngine().addSkill(name, skillId)
);
ipcMain.handle(IPC_CHANNELS.deleteCollection, (_event, name: string) => currentEngine().delete(name));
ipcMain.handle(IPC_CHANNELS.scan, () => currentEngine().scan());

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
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
  if (process.platform !== 'darwin') app.quit();
});
