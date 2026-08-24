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
  exportAll: 'contextkit:export-all',
  copyTo: 'contextkit:copy-to',
  copyAll: 'contextkit:copy-all',
  searchSkills: 'contextkit:search-skills',
  browseSkills: 'contextkit:browse-skills',
  listInbox: 'contextkit:list-inbox',
  listSkills: 'contextkit:list-skills',
  addToInbox: 'contextkit:add-to-inbox',
  addSkill: 'contextkit:add-skill',
  deleteCollection: 'contextkit:delete-collection',
  pickProjectFolder: 'contextkit:pick-project-folder',
  pickDestinationFolder: 'contextkit:pick-destination-folder',
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
  listCollections(ide?: IDE): Promise<Collection[]>;
  createCollection(name: string, skillIds: string[], ide?: IDE): Promise<Result<Collection>>;
  removeSkillFromCollection(name: string, skillId: string, ide?: IDE): Promise<Result<Collection>>;
  /** Push our stamped command file and deploy filed skills the target IDE is missing. `dest` writes there without binding the session. */
  exportCommand(
    name: string,
    targetIDE: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;
  /** Push stamped files for every command. Same dest/replace rules as `exportCommand`. */
  exportAll(targetIDE: IDE, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>;
  copyTo(
    name: string,
    fromIde: IDE,
    toIde: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;
  copyAll(
    fromIde: IDE,
    toIde: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;
  searchSkills(query: string): Promise<Result<Skill[]>>;
  browseSkills(view: BrowseView): Promise<Result<Skill[]>>;
  listInbox(): Promise<string[]>;
  /** Catalog rows from the last scan. Used by Sync for counts and source bars. */
  listSkills(): Promise<SkillRecord[]>;
  addToInbox(skillId: string): Promise<Result<string[]>>;
  addSkill(name: string, skillId: string, ide?: IDE): Promise<Result<Collection>>;
  deleteCollection(name: string, ide?: IDE): Promise<Result<void>>;
  /** Opens a directory dialog and binds the session. Returns the picked path, or `null` if canceled. */
  pickProjectFolder(): Promise<string | null>;
  /** Opens a directory dialog for install/export dest. Does not bind the session. */
  pickDestinationFolder(): Promise<string | null>;
  /** Currently bound project folder, or `null` if none has been picked this session. */
  getProjectRoot(): Promise<string | null>;
  /** Pull: scan SKILL.md folders. New ids go to Inbox if missing. Does not install. */
  scan(): Promise<Result<ScanResult>>;
  /** Push a known skill into an IDE skills dir. `dest` writes there without binding the session. */
  install(skillId: string, targetIDE: IDE, opts?: { dest?: string }): Promise<Result<SkillRecord>>;
}
