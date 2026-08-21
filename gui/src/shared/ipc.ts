import type { Result } from '../../../src/core/result.js';
import type { BrowseView, Collection, ExportResult, IDE, Skill } from '../../../src/types/index.js';

export type { BrowseView, Collection, ExportResult, IDE, Result, Skill };

/**
 * IPC channel names shared between the main process (handler registration)
 * and the preload script (invoke calls). Renderer code never sees channel
 * names directly — it only sees the typed `window.contextkit` bridge.
 */
export const IPC_CHANNELS = {
  listCollections: 'contextkit:list-collections',
  createCollection: 'contextkit:create-collection',
  addSkillToCollection: 'contextkit:add-skill-to-collection',
  removeSkillFromCollection: 'contextkit:remove-skill-from-collection',
  exportCollections: 'contextkit:export-collections',
  searchSkills: 'contextkit:search-skills',
  browseSkills: 'contextkit:browse-skills',
  installSkill: 'contextkit:install-skill',
} as const;

/**
 * Shape of the bridge exposed to the renderer via `contextBridge`. Mirrors
 * `ICollectionEngine` 1:1 — each method forwards to the matching engine
 * method over IPC and returns the same `Result<T>` the engine returns, so
 * components handle bridge errors with the same `isOk`/`isErr` vocabulary
 * used everywhere else in the codebase.
 */
export interface ContextKitBridge {
  listCollections(): Promise<Collection[]>;
  createCollection(name: string, skillIds: string[]): Promise<Result<Collection>>;
  addSkillToCollection(name: string, skillId: string): Promise<Result<Collection>>;
  removeSkillFromCollection(name: string, skillId: string): Promise<Result<Collection>>;
  exportCollections(names: string[], targetIDE: IDE): Promise<Result<ExportResult>>;
  searchSkills(query: string): Promise<Result<Skill[]>>;
  browseSkills(view: BrowseView): Promise<Result<Skill[]>>;
  installSkill(skillId: string): Promise<Result<Skill>>;
}
