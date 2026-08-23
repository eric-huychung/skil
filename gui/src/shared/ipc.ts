import type { Result } from '../../../src/core/result.js';
import type { BrowseView, Collection, ExportResult, IDE, ScanResult, Skill, SkillRecord } from '../../../src/types/index.js';

export type { BrowseView, Collection, ExportResult, IDE, Result, ScanResult, Skill, SkillRecord };

/**
 * IPC channel names shared between the main process (handler registration)
 * and the preload script (invoke calls). Renderer code never sees channel
 * names directly — it only sees the typed `window.contextkit` bridge.
 */
export const IPC_CHANNELS = {
  listCollections: 'contextkit:list-collections',
  createCollection: 'contextkit:create-collection',
  removeSkillFromCollection: 'contextkit:remove-skill-from-collection',
  exportCommand: 'contextkit:export-command',
  searchSkills: 'contextkit:search-skills',
  browseSkills: 'contextkit:browse-skills',
  listInbox: 'contextkit:list-inbox',
  addToInbox: 'contextkit:add-to-inbox',
  addSkill: 'contextkit:add-skill',
  deleteCollection: 'contextkit:delete-collection',
  pickProjectFolder: 'contextkit:pick-project-folder',
  getProjectRoot: 'contextkit:get-project-root',
  scan: 'contextkit:scan',
  install: 'contextkit:install',
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
  removeSkillFromCollection(name: string, skillId: string): Promise<Result<Collection>>;
  /** Push our stamped command file. Does not install skills. */
  exportCommand(name: string, targetIDE: IDE, opts?: { replace?: boolean }): Promise<Result<ExportResult>>;
  searchSkills(query: string): Promise<Result<Skill[]>>;
  browseSkills(view: BrowseView): Promise<Result<Skill[]>>;
  listInbox(): Promise<string[]>;
  addToInbox(skillId: string): Promise<Result<string[]>>;
  addSkill(name: string, skillId: string): Promise<Result<Collection>>;
  deleteCollection(name: string): Promise<Result<void>>;
  /** Opens a directory dialog. Returns the picked path, or `null` if canceled. */
  pickProjectFolder(): Promise<string | null>;
  /** Currently bound project folder, or `null` if none has been picked this session. */
  getProjectRoot(): Promise<string | null>;
  /** Pull: scan SKILL.md folders. New unfiled ids go to Inbox. Does not install. */
  scan(): Promise<Result<ScanResult>>;
  /** Push a known skill into an IDE skills dir. Does not write command files. */
  install(skillId: string, targetIDE: IDE): Promise<Result<SkillRecord>>;
}
