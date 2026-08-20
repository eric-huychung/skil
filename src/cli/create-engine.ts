import type { ICollectionEngine } from '../interfaces/engine.js';
import { CollectionEngine } from '../core/collection-engine.js';
import { RealFileSystemAdapter } from '../adapters/real-fs-adapter.js';
import { ConfigAdapter } from '../adapters/config-adapter.js';
import { SkillsAdapter } from '../adapters/skills-adapter.js';

/**
 * Composition root: wires the real adapters into a CollectionEngine for
 * production CLI use. The only place production code touches concrete
 * adapter classes directly.
 */
export function createEngine(): ICollectionEngine {
  return new CollectionEngine(new RealFileSystemAdapter(), new ConfigAdapter(), new SkillsAdapter());
}
