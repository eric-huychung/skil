export const SKIL_VERSION = '0.3.0';

// Public API surface for consumers embedding skil's engine directly
// (currently: the GUI's Electron main process). CLI commands import from
// specific module paths instead; this barrel exists for external embedders.
export { CollectionEngine, STATE_PATH } from './core/collection-engine.js';
export { createEngine } from './create-engine.js';
export { ok, err, isOk, isErr, type Result, type EngineErrorCode } from './core/result.js';

export { RealFileSystemAdapter } from './adapters/real-fs-adapter.js';
export { SkillsAdapter } from './adapters/skills-adapter.js';

export type { ICollectionEngine } from './interfaces/engine.js';
export type { IFileSystemAdapter, ISkillsAdapter } from './interfaces/adapters.js';

export type {
  BrowseView,
  Collection,
  Command,
  CommandRecord,
  ExportResult,
  IDE,
  OriginCheck,
  RuleRecord,
  ScanResult,
  Skill,
  SkillRecord,
  SkillSource,
  State,
} from './types/index.js';
