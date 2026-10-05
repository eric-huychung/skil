import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { CollectionEngine } from '../../../../src/core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../../../src/adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../../../src/adapters/in-memory-skills.js';
import { InMemoryUsageCollector } from '../../../../src/adapters/in-memory-usage.js';
import type { ICollectionEngine } from '../../../../src/interfaces/engine.js';
import { err, isOk, ok, type Result } from '../../../../src/core/result.js';
import type { CreatorCard, CreatorDetail, LlmProvider, MarketPreviewData, MarketSearchRow, MarketSuggestedData, ShelfRole, SkilBridge, ScanResult, SuggestResult } from '../../shared/ipc.js';
import { llmKeyHint, toLlmStatus } from '../../shared/llm-settings.js';
import { forgetFolder, rememberFolder } from '../../shared/recent-folders.js';
import { ThemeProvider } from './theme';
import { BridgeProvider } from './bridge-context';

/**
 * Builds a CollectionEngine backed by the same in-memory adapters the
 * CLI/engine tests use, rather than hand-rolled component mocks. Component
 * tests exercise the real business logic; only the file system and
 * skills.sh boundaries are faked. Return `fs` when a test needs to seed
 * SKILL.md files for scan.
 */
export function createInMemoryWorkspace(usage?: InMemoryUsageCollector): {
  engine: ICollectionEngine;
  fs: InMemoryFileSystemAdapter;
  skills: InMemorySkillsAdapter;
} {
  const fs = new InMemoryFileSystemAdapter();
  const skills = new InMemorySkillsAdapter();
  return {
    fs,
    skills,
    engine: new CollectionEngine(fs, skills, usage),
  };
}

export function createInMemoryEngine(): ICollectionEngine {
  return createInMemoryWorkspace().engine;
}

/**
 * Same as createInMemoryWorkspace, except install() writes the vercel npx
 * dump (`.agents/skills/<short-name>/SKILL.md`) so engine relocate + Reset
 * can actually replace an on-disk copy.
 */
export class NpxLayoutSkillsAdapter extends InMemorySkillsAdapter {
  skillBody = '';

  constructor(private readonly disk: InMemoryFileSystemAdapter) {
    super();
  }

  override async install(skillId: string, opts?: { cwd?: string }) {
    const result = await super.install(skillId, opts);
    if (!isOk(result)) return result;
    const shortName = skillId.split('/').filter(Boolean).at(-1) ?? skillId;
    const prefix = opts?.cwd ? `${opts.cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/` : '';
    this.disk.writeFile(`${prefix}.agents/skills/${shortName}/SKILL.md`, this.skillBody || `# ${shortName}\n`);
    return result;
  }
}

export function createNpxWorkspace(): {
  engine: ICollectionEngine;
  fs: InMemoryFileSystemAdapter;
  skills: NpxLayoutSkillsAdapter;
} {
  const fs = new InMemoryFileSystemAdapter();
  const skills = new NpxLayoutSkillsAdapter(fs);
  return {
    fs,
    skills,
    engine: new CollectionEngine(fs, skills),
  };
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
  /** Recents at start. Bound `projectRoot` is remembered on top if set. */
  recentFolders?: string[];
  /**
   * If set, bind/pick swaps to that engine for the path — same as GUI main
   * calling `createEngine(path)`. Omitted → keep the original engine (most
   * tests).
   */
  enginesByPath?: Record<string, ICollectionEngine>;
  /** Whether an LLM key is saved at start. Default `false` (Settings' "no key" state). */
  hasLlmKey?: boolean;
  /** Toggle state when a key is saved. Default `true`. */
  llmEnabled?: boolean;
  /** Last-4 hint shown in Settings when a key is already saved. */
  llmKeyHint?: string;
  /** What save-key ping returns. Default success. */
  pingResult?: Result<void>;
};

export type TestBridge = SkilBridge & {
  /** Simulate a watcher (or main-process) scan push. */
  emitScan: (result?: ScanResult) => void;
};

const EMPTY_SCAN: ScanResult = { added: [], gone: [], changed: [], alwaysOnWarnings: [] };

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
  let llmKeys: Array<{ id: string; provider: LlmProvider; apiKey: string; keyHint?: string }> = [];
  let llmActiveId: string | null = null;
  if (options.hasLlmKey) {
    llmKeys = [
      {
        id: 'k1',
        provider: 'anthropic',
        apiKey: 'sk-seed',
        ...(options.llmKeyHint ? { keyHint: options.llmKeyHint } : {}),
      },
    ];
    llmActiveId = options.llmEnabled === false ? null : 'k1';
  }

  function llmStoreStatus() {
    return toLlmStatus({
      keys: llmKeys.map((key) => ({
        id: key.id,
        provider: key.provider,
        encryptedKey: 'x',
        ...(key.keyHint ? { keyHint: key.keyHint } : {}),
      })),
      activeId: llmActiveId,
    });
  }
  if (projectRoot) recentFolders = rememberFolder(projectRoot, recentFolders);
  const scanListeners = new Set<(result: ScanResult) => void>();

  function notifyScan(result: ScanResult): void {
    for (const listener of scanListeners) {
      listener(result);
    }
  }

  function bind(path: string): string {
    const next = options.enginesByPath?.[path];
    if (next) activeEngine = next;
    projectRoot = path;
    recentFolders = rememberFolder(path, recentFolders);
    return projectRoot;
  }

  return {
    listCollections: async () => activeEngine.list(),
    createCollection: async (name, skillIds) => activeEngine.create(name, skillIds),
    removeSkillFromCollection: async (name, skillId) => activeEngine.removeSkill(name, skillId),
    setCommandEnabled: async (name, enabled) => {
      const result = await activeEngine.setCommandEnabled(name, enabled);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    browseSkills: async (view) => activeEngine.browse(view),
    listSkills: async () => activeEngine.skills(),
    install: async (skillId) => {
      const result = await activeEngine.install(skillId);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    addSkill: async (name, skillId) => activeEngine.addSkill(name, skillId),
    deleteCollection: async (name) => activeEngine.delete(name),
    getProjectRoot: async () => projectRoot,
    pickProjectFolder: async () => {
      if (options.nextPick === null) return null;
      return bind(options.nextPick ?? DEFAULT_TEST_PROJECT_ROOT);
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
    deleteSkill: async (skillId) => {
      const result = activeEngine.deleteSkill(skillId);
      if (result.ok) notifyScan({ ...EMPTY_SCAN, gone: [skillId] });
      return result;
    },
    usage: async () => activeEngine.usage(),
    // Market index reads are HTTP, not engine-backed — default to an empty
    // index so Discover stays on live Top / Trending.
    // Tests that need shelves override these on the returned bridge.
    marketShelves: async (): Promise<Result<ShelfRole[]>> => ok([]),
    marketSuggested: async (): Promise<Result<MarketSuggestedData>> => ok({ updatedAt: '', roles: [] }),
    marketCreators: async (): Promise<Result<CreatorCard[]>> => ok([]),
    marketCreator: async (): Promise<Result<CreatorDetail>> => err(new Error('not_found')),
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
    readSkillMd: async (skillId: string) => activeEngine.readSkillMd(skillId),
    originChecks: async () => activeEngine.originChecks(),
    updateFromMarket: async (skillId, opts) => activeEngine.updateFromMarket(skillId, opts),
    setSkillEnabled: async (skillId, enabled) => activeEngine.setSkillEnabled(skillId, enabled),
    listRules: async () => activeEngine.rules(),
    readRule: async (id) => activeEngine.readRule(id),
    setSharedRuleEnabled: async (id, enabled) => {
      const result = activeEngine.setSharedRuleEnabled(id, enabled);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    auditSync: async () => activeEngine.auditSync(),
    previewSync: async (path) => activeEngine.previewSync(path),
    importToCanonical: async (ids) => {
      const result = await activeEngine.importToCanonical(ids);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    removeLeftovers: async (paths) => {
      const result = await activeEngine.removeLeftovers(paths);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    resolveDrift: async (id, action, path) => {
      const result = await activeEngine.resolveDrift(id, action, path);
      if (result.ok) notifyScan(EMPTY_SCAN);
      return result;
    },
    health: async () => activeEngine.health(),
    llmStatus: async () => llmStoreStatus(),
    saveLlmSettings: async (provider: LlmProvider, apiKey: string) => {
      if (options.pingResult && !options.pingResult.ok) return options.pingResult;
      const id = `key-${llmKeys.length + 1}`;
      const hint = llmKeyHint(apiKey);
      llmKeys = [...llmKeys, { id, provider, apiKey, ...(hint ? { keyHint: hint } : {}) }];
      llmActiveId = id;
      return ok(undefined);
    },
    setActiveLlmKey: async (id: string) => {
      if (!llmKeys.some((key) => key.id === id)) return err(new Error('No LLM key saved yet.'));
      llmActiveId = llmActiveId === id ? null : id;
      return ok(undefined);
    },
    revealLlmKey: async (id: string) => {
      const key = llmKeys.find((row) => row.id === id);
      if (!key) return err(new Error('No LLM key saved yet.'));
      return ok(key.apiKey);
    },
    removeLlmKey: async (id: string) => {
      const next = llmKeys.filter((key) => key.id !== id);
      if (next.length === llmKeys.length) return err(new Error('No LLM key saved yet.'));
      llmKeys = next;
      if (llmActiveId === id) llmActiveId = null;
      return ok(undefined);
    },
    suggest: async (shelves, role): Promise<Result<SuggestResult>> => activeEngine.suggest(shelves, { role }),
    checkAppUpdate: async () =>
      ok({
        current: '0.6.0',
        latest: '0.6.0',
        newer: false,
        url: 'https://github.com/eric-huychung/skil/releases',
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
