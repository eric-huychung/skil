export const CONTEXTKIT_VERSION = '0.2.1';

// Public API surface for consumers embedding ContextKit's engine directly
// (currently: the GUI's Electron main process). CLI commands import from
// specific module paths instead; this barrel exists for external embedders.
export { CollectionEngine, LEGACY_STATE_PATH, STATE_PATH } from './core/collection-engine.js';
export { createEngine } from './create-engine.js';
export { ok, err, isOk, isErr, type Result } from './core/result.js';

export { RealFileSystemAdapter } from './adapters/real-fs-adapter.js';
export { ConfigAdapter } from './adapters/config-adapter.js';
export { SkillsAdapter } from './adapters/skills-adapter.js';

export type { ICollectionEngine } from './interfaces/engine.js';
export type { IFileSystemAdapter, IConfigAdapter, ISkillsAdapter } from './interfaces/adapters.js';

export type {
  BrowseView,
  Collection,
  Command,
  Config,
  ExportResult,
  IDE,
  ScanResult,
  Skill,
  SkillRecord,
  SkillSource,
  State,
  SyncResult,
} from './types/index.js';
