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
  pickProjectFolder: 'contextkit:pick-project-folder',
  getProjectRoot: 'contextkit:get-project-root',
} as const;

/**
 * Shape of the bridge exposed to the renderer via `contextBridge`. Engine
 * methods forward 1:1 over IPC and return the same `Result<T>` the engine
 * returns. `pickProjectFolder` / `getProjectRoot` are GUI session state —
 * project root is adapter config, not an engine method.
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
  /** Opens a directory dialog. Returns the picked path, or `null` if canceled. */
  pickProjectFolder(): Promise<string | null>;
  /** Currently bound project folder, or `null` if none has been picked this session. */
  getProjectRoot(): Promise<string | null>;
}
