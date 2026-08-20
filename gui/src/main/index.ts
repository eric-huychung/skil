import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { CollectionEngine } from '../../../src/core/collection-engine.js';
import { RealFileSystemAdapter } from '../../../src/adapters/real-fs-adapter.js';
import { ConfigAdapter } from '../../../src/adapters/config-adapter.js';
import { SkillsAdapter } from '../../../src/adapters/skills-adapter.js';
import { IPC_CHANNELS } from '../shared/ipc.js';

// Same engine and adapters the CLI uses — no reimplementation. The GUI is a
// presentation layer only; every mutation and read goes through this one
// instance via the IPC handlers below.
const engine = new CollectionEngine(new RealFileSystemAdapter(), new ConfigAdapter(), new SkillsAdapter());

ipcMain.handle(IPC_CHANNELS.listCollections, () => engine.list());
ipcMain.handle(IPC_CHANNELS.getStatus, () => engine.status());
ipcMain.handle(IPC_CHANNELS.activateCollection, (_event, name: string) => engine.activate(name));
ipcMain.handle(IPC_CHANNELS.deactivateCollection, () => engine.deactivate());
ipcMain.handle(IPC_CHANNELS.createCollection, (_event, name: string, skillIds: string[]) =>
  engine.create(name, skillIds)
);
ipcMain.handle(IPC_CHANNELS.searchSkills, (_event, query: string) => engine.search(query));
ipcMain.handle(IPC_CHANNELS.installSkill, (_event, skillId: string) => engine.install(skillId));

function createWindow(): void {
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
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
