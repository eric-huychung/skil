import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { CollectionEngine } from '../../../../src/core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../../../src/adapters/in-memory-fs.js';
import { InMemoryConfigAdapter } from '../../../../src/adapters/in-memory-config.js';
import { InMemorySkillsAdapter } from '../../../../src/adapters/in-memory-skills.js';
import { InMemoryUsageCollector } from '../../../../src/adapters/in-memory-usage.js';
import type { ICollectionEngine } from '../../../../src/interfaces/engine.js';
import { ok, type Result } from '../../../../src/core/result.js';
import type { MarketPreviewData, MarketSearchRow, ShelfRole, SkilBridge, ScanResult } from '../../shared/ipc.js';
import { forgetFolder, rememberFolder } from '../../shared/recent-folders.js';
import { marketInboxIds, mergeMarketInbox, rememberMarketSkill } from '../../shared/market-inbox.js';
import { ThemeProvider } from './theme';
import { BridgeProvider } from './bridge-context';

/**
 * Builds a CollectionEngine backed by the same in-memory adapters the
 * CLI/engine tests use, rather than hand-rolled component mocks. Component
 * tests exercise the real business logic; only the file system, config, and
 * skills.sh boundaries are faked. Return `fs` when a test needs to seed
 * SKILL.md files for scan.
 */
export function createInMemoryWorkspace(usage?: InMemoryUsageCollector): {
  engine: ICollectionEngine;
  fs: InMemoryFileSystemAdapter;
} {
  const fs = new InMemoryFileSystemAdapter();
  return {
    fs,
    engine: new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter(), usage),
  };
}

export function createInMemoryEngine(): ICollectionEngine {
  return createInMemoryWorkspace().engine;
}

/** Default path a test Pick/Change click binds when `nextPick` is omitted. */
export const DEFAULT_TEST_PROJECT_ROOT = '/tmp/test-project';

export type TestBridgeOptions = {
  /** Bound folder at start. `null` (default) means none picked yet. */
  projectRoot?: string | null;
  /**
   * What the next Pick/Change click returns.
   * Omitted → bind `DEFAULT_TEST_PROJECT_ROOT`. `null` → user canceled.
   */
  nextPick?: string | null;
  /**
   * What the next dest-only folder pick returns (install/export without a bind).
   * Omitted → `/tmp/test-project`. `null` → user canceled.
   */
  nextDestination?: string | null;
  /** Recents at start. Bound `projectRoot` is remembered on top if set. */
  recentFolders?: string[];
  /**
   * If set, bind/pick swaps to that engine for the path — same as GUI main
   * calling `createEngine(path)`. Market inbox ids are copied onto the new
   * engine. Omitted → keep the original engine (most tests).
   */
  enginesByPath?: Record<string, ICollectionEngine>;
};

export type TestBridge = SkilBridge & {
  /** Simulate a watcher (or main-process) scan push. */
  emitScan: (result?: ScanResult) => void;
};

const EMPTY_SCAN: ScanResult = { added: [], gone: [], changed: [], commandPulls: [] };

/**
 * Wraps an engine as the `window.skil` bridge shape components call.
 * In production this wrapping happens in the Electron main process over
 * IPC (see `gui/src/main/index.ts`); tests skip IPC and call the engine
 * in-process instead. Folder pick is session state on the bridge — tests
 * do not rebuild adapters (that wiring is `createEngine(projectRoot)`).
 */
export function createTestBridge(engine: ICollectionEngine, options: TestBridgeOptions = {}): TestBridge {
  let activeEngine = engine;
  let projectRoot: string | null = options.projectRoot ?? null;
  let recentFolders = options.recentFolders ?? [];
  if (projectRoot) recentFolders = rememberFolder(projectRoot, recentFolders);
  let marketInbox = mergeMarketInbox([], marketInboxIds(activeEngine.inbox(), activeEngine.skills()));
  const scanListeners = new Set<(result: ScanResult) => void>();

  function notifyScan(result: ScanResult): void {
    for (const listener of scanListeners) {
      listener(result);
    }
  }

  function bind(path: string): string {
    marketInbox = mergeMarketInbox(marketInbox, marketInboxIds(activeEngine.inbox(), activeEngine.skills()));
    const next = options.enginesByPath?.[path];
    if (next) activeEngine = next;
    for (const id of marketInbox) activeEngine.addToInbox(id);
    projectRoot = path;
    recentFolders = rememberFolder(path, recentFolders);
    return projectRoot;
  }

  return {
    listCollections: async (ide) => activeEngine.list(ide),
    createCollection: async (name, skillIds, ide) => activeEngine.create(name, skillIds, undefined, ide),
    removeSkillFromCollection: async (name, skillId, ide) => activeEngine.removeSkill(name, skillId, ide),
    exportAll: async (targetIDE, opts) => activeEngine.exportAll(targetIDE, opts),
    importFrom: async (sourceRoot, ide, opts) => {
      const result = await activeEngine.importFrom(sourceRoot, ide, opts);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    searchSkills: async (query) => activeEngine.search(query),
    browseSkills: async (view) => activeEngine.browse(view),
    listInbox: async () => activeEngine.inbox(),
    listSkills: async () => activeEngine.skills(),
    addToInbox: async (skillId) => {
      const result = activeEngine.addToInbox(skillId);
      if (result.ok) marketInbox = rememberMarketSkill(skillId, marketInbox);
      return result;
    },
    addSkill: async (name, skillId, ide) => activeEngine.addSkill(name, skillId, ide),
    deleteCollection: async (name, ide) => activeEngine.delete(name, ide),
    getProjectRoot: async () => projectRoot,
    pickProjectFolder: async () => {
      if (options.nextPick === null) return null;
      return bind(options.nextPick ?? DEFAULT_TEST_PROJECT_ROOT);
    },
    pickDestinationFolder: async () => {
      if (options.nextDestination === null) return null;
      return options.nextDestination ?? DEFAULT_TEST_PROJECT_ROOT;
    },
    bindProjectFolder: async (path: string) => bind(path),
    listRecentFolders: async () => recentFolders,
    removeRecentFolder: async (path: string) => {
      recentFolders = forgetFolder(path, recentFolders);
      if (path === projectRoot) projectRoot = null;
      return recentFolders;
    },
    scan: async () => {
      const result = activeEngine.scan();
      if (result.ok) {
        notifyScan(result.value);
      }
      return result;
    },
    onScan: (listener) => {
      scanListeners.add(listener);
      return () => {
        scanListeners.delete(listener);
      };
    },
    emitScan: (result = EMPTY_SCAN) => {
      notifyScan(result);
    },
    deleteSkill: async (skillId) => activeEngine.deleteSkill(skillId),
    usage: async () => activeEngine.usage(),
    // Market index reads are HTTP, not engine-backed — default to an empty
    // index so existing tests keep exercising today's SkillSearch fallback.
    // Tests that need shelves override these on the returned bridge.
    marketShelves: async (): Promise<Result<ShelfRole[]>> => ok([]),
    marketSearch: async (): Promise<Result<MarketSearchRow[]>> => ok([]),
    marketPreview: async (id: string): Promise<Result<MarketPreviewData>> =>
      ok({
        id,
        name: id,
        installs: 0,
        url: '',
        installUrl: null,
        installCommand: `npx skills add ${id}`,
        skillMd: null,
        audit: { status: 'none' },
      }),
  };
}

/** Installs a test bridge on `window.skil` for a test. Returns the engine so tests can drive it directly. */
export function installTestBridge(
  engine: ICollectionEngine = createInMemoryEngine(),
  options?: TestBridgeOptions
): ICollectionEngine {
  window.skil = createTestBridge(engine, options);
  return engine;
}

/**
 * Renders a component wrapped in the same providers the real app tree uses.
 * Defaults the bridge to `window.skil`, so tests that already called
 * `installTestBridge()` (the `App.test.tsx` pattern) need no extra wiring;
 * pass `bridge` explicitly to test a component in isolation without touching
 * the global.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions & { bridge?: SkilBridge }) {
  const { bridge = window.skil, ...renderOptions } = options ?? {};
  return render(
    <ThemeProvider>
      <BridgeProvider bridge={bridge}>{ui}</BridgeProvider>
    </ThemeProvider>,
    renderOptions
  );
}
