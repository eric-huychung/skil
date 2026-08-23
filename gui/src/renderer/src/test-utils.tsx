import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { CollectionEngine } from '../../../../src/core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../../../src/adapters/in-memory-fs.js';
import { InMemoryConfigAdapter } from '../../../../src/adapters/in-memory-config.js';
import { InMemorySkillsAdapter } from '../../../../src/adapters/in-memory-skills.js';
import type { ICollectionEngine } from '../../../../src/interfaces/engine.js';
import type { ContextKitBridge } from '../../shared/ipc.js';
import { ThemeProvider } from './theme';
import { BridgeProvider } from './bridge-context';

/**
 * Builds a CollectionEngine backed by the same in-memory adapters the
 * CLI/engine tests use, rather than hand-rolled component mocks. Component
 * tests exercise the real business logic; only the file system, config, and
 * skills.sh boundaries are faked. Return `fs` when a test needs to seed
 * SKILL.md files for scan.
 */
export function createInMemoryWorkspace(): {
  engine: ICollectionEngine;
  fs: InMemoryFileSystemAdapter;
} {
  const fs = new InMemoryFileSystemAdapter();
  return {
    fs,
    engine: new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter()),
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
};

/**
 * Wraps an engine as the `window.contextkit` bridge shape components call.
 * In production this wrapping happens in the Electron main process over
 * IPC (see `gui/src/main/index.ts`); tests skip IPC and call the engine
 * in-process instead. Folder pick is session state on the bridge — tests
 * do not rebuild adapters (that wiring is `createEngine(projectRoot)`).
 */
export function createTestBridge(engine: ICollectionEngine, options: TestBridgeOptions = {}): ContextKitBridge {
  let projectRoot: string | null = options.projectRoot ?? null;
  return {
    listCollections: async () => engine.list(),
    createCollection: async (name, skillIds) => engine.create(name, skillIds),
    removeSkillFromCollection: async (name, skillId) => engine.removeSkill(name, skillId),
    exportCollections: async (names, targetIDE) => engine.export(names, targetIDE),
    searchSkills: async (query) => engine.search(query),
    browseSkills: async (view) => engine.browse(view),
    listInbox: async () => engine.inbox(),
    addToInbox: async (skillId) => engine.addToInbox(skillId),
    addSkill: async (name, skillId) => engine.addSkill(name, skillId),
    deleteCollection: async (name) => engine.delete(name),
    getProjectRoot: async () => projectRoot,
    pickProjectFolder: async () => {
      if (options.nextPick === null) return null;
      projectRoot = options.nextPick ?? DEFAULT_TEST_PROJECT_ROOT;
      return projectRoot;
    },
    scan: async () => engine.scan(),
    install: async (skillId, targetIDE) => engine.install(skillId, targetIDE),
  };
}

/** Installs a test bridge on `window.contextkit` for a test. Returns the engine so tests can drive it directly. */
export function installTestBridge(
  engine: ICollectionEngine = createInMemoryEngine(),
  options?: TestBridgeOptions
): ICollectionEngine {
  window.contextkit = createTestBridge(engine, options);
  return engine;
}

/**
 * Renders a component wrapped in the same providers the real app tree uses.
 * Defaults the bridge to `window.contextkit`, so tests that already called
 * `installTestBridge()` (the `App.test.tsx` pattern) need no extra wiring;
 * pass `bridge` explicitly to test a component in isolation without touching
 * the global.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions & { bridge?: ContextKitBridge }) {
  const { bridge = window.contextkit, ...renderOptions } = options ?? {};
  return render(
    <ThemeProvider>
      <BridgeProvider bridge={bridge}>{ui}</BridgeProvider>
    </ThemeProvider>,
    renderOptions
  );
}
