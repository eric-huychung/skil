import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { createEngine } from '../../../src/create-engine.js';
import type { BrowseView, IDE } from '../../../src/types/index.js';
import { IPC_CHANNELS } from '../shared/ipc.js';

// Same composition root the CLI uses — no reimplementation. The GUI is a
// presentation layer only; every mutation and read goes through this one
// instance via the IPC handlers below.
const engine = createEngine();

ipcMain.handle(IPC_CHANNELS.listCollections, () => engine.list());
ipcMain.handle(IPC_CHANNELS.createCollection, (_event, name: string, skillIds: string[]) =>
  engine.create(name, skillIds)
);
ipcMain.handle(IPC_CHANNELS.addSkillToCollection, (_event, name: string, skillId: string) =>
  engine.addSkill(name, skillId)
);
ipcMain.handle(IPC_CHANNELS.removeSkillFromCollection, (_event, name: string, skillId: string) =>
  engine.removeSkill(name, skillId)
);
ipcMain.handle(IPC_CHANNELS.exportCollections, (_event, names: string[], targetIDE: IDE) =>
  engine.export(names, targetIDE)
);
ipcMain.handle(IPC_CHANNELS.searchSkills, (_event, query: string) => engine.search(query));
ipcMain.handle(IPC_CHANNELS.browseSkills, (_event, view: BrowseView) => engine.browse(view));
ipcMain.handle(IPC_CHANNELS.installSkill, (_event, skillId: string) => engine.install(skillId));

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
