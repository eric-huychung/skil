import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, watch as watchDir, type FSWatcher } from 'node:fs';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import axios from 'axios';
import { createEngine } from '../../../src/create-engine.js';
import { SkillsAdapter } from '../../../src/adapters/skills-adapter.js';
import { getApiBaseUrl } from '../../../src/config/website.js';
import { DiskWatch } from '../../../src/watch/disk-watch.js';
import type { ICollectionEngine } from '../../../src/interfaces/engine.js';
import type { BrowseView, IDE, ScanResult } from '../../../src/types/index.js';
import type { MarketSearchRow, ShelfRole } from '../../../src/backend/market-types.js';
import { err, isOk, ok, type Result } from '../../../src/core/result.js';
import { IPC_CHANNELS, type MarketPreviewData } from '../shared/ipc.js';
import { forgetFolder, parseRecentFolders, rememberFolder } from '../shared/recent-folders.js';
import { marketInboxIds, mergeMarketInbox, parseMarketInbox, rememberMarketSkill } from '../shared/market-inbox.js';

/**
 * Market index reads (`api/market/*`) go through the main process like
 * `SkillsAdapter.search`/`.browse`, rather than `fetch` in the renderer —
 * Electron's renderer origin isn't the Vercel deployment's, so a direct
 * cross-origin `fetch` risks CORS. These are public, unauthenticated reads
 * (anon SELECT via the store), so plain `axios.get` is enough — no OIDC.
 */
async function fetchMarketShelves(): Promise<Result<ShelfRole[]>> {
  try {
    const response = await axios.get<{ data: ShelfRole[] }>(`${getApiBaseUrl()}/api/market/shelves`);
    return ok(response.data.data);
  } catch (error) {
    return err(new Error(`Failed to load market shelves: ${(error as Error).message}`));
  }
}

async function fetchMarketSearch(query: string): Promise<Result<MarketSearchRow[]>> {
  try {
    const response = await axios.get<{ data: MarketSearchRow[] }>(`${getApiBaseUrl()}/api/market/search`, {
      params: { q: query },
    });
    return ok(response.data.data);
  } catch (error) {
    return err(new Error(`Failed to search market index for '${query}': ${(error as Error).message}`));
  }
}

async function fetchMarketPreview(id: string): Promise<Result<MarketPreviewData>> {
  try {
    const response = await axios.get<{ data: MarketPreviewData }>(`${getApiBaseUrl()}/api/market/preview`, {
      params: { id },
    });
    return ok(response.data.data);
  } catch (error) {
    return err(new Error(`Failed to load market preview for '${id}': ${(error as Error).message}`));
  }
}

const WATCH_ROOTS = [
  '.cursor/skills',
  '.claude/skills',
  '.codex/skills',
  '.github/skills',
  '.windsurf/skills',
  '.agents/skills',
  '.cursor/commands',
  '.claude/commands',
  '.windsurf/workflows',
  '.agents/commands',
  '.github/prompts',
] as const;

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

function marketInboxFilePath(): string {
  return join(app.getPath('userData'), 'market-inbox.json');
}

function loadMarketInbox(): string[] {
  try {
    const raw: unknown = JSON.parse(readFileSync(marketInboxFilePath(), 'utf8'));
    return parseMarketInbox(raw);
  } catch {
    return [];
  }
}

function saveMarketInbox(next: string[]): void {
  marketInbox = next;
  try {
    writeFileSync(marketInboxFilePath(), JSON.stringify(next));
  } catch {
    // Persist is best-effort — a full disk should not block Discover adds.
  }
}

function captureMarketInbox(): void {
  if (!engine) return;
  saveMarketInbox(mergeMarketInbox(marketInbox, marketInboxIds(engine.inbox(), engine.skills())));
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
    dialog.showErrorBox('skil', error instanceof Error ? error.message : String(error));
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
  marketInbox = loadMarketInbox();
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
ipcMain.handle(IPC_CHANNELS.searchSkills, (_event, query: string) => discovery.search(query));
ipcMain.handle(IPC_CHANNELS.browseSkills, (_event, view: BrowseView) => discovery.browse(view));
ipcMain.handle(IPC_CHANNELS.listInbox, () => currentEngine().inbox());
ipcMain.handle(IPC_CHANNELS.listSkills, () => (projectRoot ? currentEngine().skills() : []));
ipcMain.handle(IPC_CHANNELS.addToInbox, (_event, skillId: string) => {
  const result = currentEngine().addToInbox(skillId);
  if (isOk(result)) {
    saveMarketInbox(rememberMarketSkill(skillId, marketInbox));
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
ipcMain.handle(IPC_CHANNELS.marketShelves, () => fetchMarketShelves());
ipcMain.handle(IPC_CHANNELS.marketSearch, (_event, query: string) => fetchMarketSearch(query));
ipcMain.handle(IPC_CHANNELS.marketPreview, (_event, id: string) => fetchMarketPreview(id));

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
