import type { ICollectionEngine } from './interfaces/engine.js';
import { CollectionEngine } from './core/collection-engine.js';
import { RealFileSystemAdapter } from './adapters/real-fs-adapter.js';
import { ConfigAdapter } from './adapters/config-adapter.js';
import { SkillsAdapter } from './adapters/skills-adapter.js';
import { ClaudeUsageCollector } from './adapters/claude-usage-collector.js';
import { getApiBaseUrl } from './config/website.js';

/**
 * Composition root: wires the real adapters into a CollectionEngine for
 * production use. The only place production code touches concrete adapter
 * classes directly. Shared by every entry point (CLI, GUI main process) so
 * adding or changing an adapter only needs one edit.
 *
 * `projectRoot` is adapter config, not an engine method: relative state
 * paths and `npx`/`skillsmith` cwd bind to that folder. CLI omits it and
 * gets `process.cwd()`. GUI rebuilds via `createEngine(pickedPath)`.
 */
export function createEngine(projectRoot: string = process.cwd()): ICollectionEngine {
  return new CollectionEngine(
    new RealFileSystemAdapter(projectRoot),
    new ConfigAdapter(),
    new SkillsAdapter(getApiBaseUrl(), projectRoot),
    new ClaudeUsageCollector(),
    projectRoot
  );
}
