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
 * skills.sh boundaries are faked.
 */
export function createInMemoryEngine(projectRoot = '/test-project'): ICollectionEngine {
  return new CollectionEngine(
    new InMemoryFileSystemAdapter(),
    new InMemoryConfigAdapter(),
    new InMemorySkillsAdapter(),
    projectRoot
  );
}

/**
 * Wraps an engine as the `window.contextkit` bridge shape components call.
 * In production this wrapping happens in the Electron main process over
 * IPC (see `gui/src/main/index.ts`); tests skip IPC and call the engine
 * in-process instead.
 */
export function createTestBridge(engine: ICollectionEngine): ContextKitBridge {
  return {
    listCollections: async () => engine.list(),
    getStatus: async () => engine.status(),
    activateCollection: async (name) => engine.activate(name),
    deactivateCollection: async () => engine.deactivate(),
    createCollection: async (name, skillIds) => engine.create(name, skillIds),
    searchSkills: async (query) => engine.search(query),
    installSkill: async (skillId) => engine.install(skillId),
  };
}

/** Installs a test bridge on `window.contextkit` for a test. Returns the engine so tests can drive it directly. */
export function installTestBridge(engine: ICollectionEngine = createInMemoryEngine()): ICollectionEngine {
  window.contextkit = createTestBridge(engine);
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
