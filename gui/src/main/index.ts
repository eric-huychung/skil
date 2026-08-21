import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { createEngine } from '../../../src/create-engine.js';
import type { ICollectionEngine } from '../../../src/interfaces/engine.js';
import type { BrowseView, IDE } from '../../../src/types/index.js';
import { IPC_CHANNELS } from '../shared/ipc.js';

// Session-only: rebuilt against the picked folder. Do not chdir and do not
// persist the last path. Handlers close over these lets so pick does not
// re-register IPC.
let engine: ICollectionEngine | null = null;
let projectRoot: string | null = null;

function requireEngine(): ICollectionEngine {
  if (!engine) {
    throw new Error('No project folder selected');
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

ipcMain.handle(IPC_CHANNELS.listCollections, () => requireEngine().list());
ipcMain.handle(IPC_CHANNELS.createCollection, (_event, name: string, skillIds: string[]) =>
  requireEngine().create(name, skillIds)
);
ipcMain.handle(IPC_CHANNELS.addSkillToCollection, (_event, name: string, skillId: string) =>
  requireEngine().addSkill(name, skillId)
);
ipcMain.handle(IPC_CHANNELS.removeSkillFromCollection, (_event, name: string, skillId: string) =>
  requireEngine().removeSkill(name, skillId)
);
ipcMain.handle(IPC_CHANNELS.exportCollections, (_event, names: string[], targetIDE: IDE) =>
  requireEngine().export(names, targetIDE)
);
ipcMain.handle(IPC_CHANNELS.searchSkills, (_event, query: string) => requireEngine().search(query));
ipcMain.handle(IPC_CHANNELS.browseSkills, (_event, view: BrowseView) => requireEngine().browse(view));
ipcMain.handle(IPC_CHANNELS.installSkill, (_event, skillId: string) => requireEngine().install(skillId));

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
