import type { Result } from '../core/result.js';
import type { BrowseView, Collection, ExportResult, IDE, ScanResult, Skill, SkillRecord, SyncResult } from '../types/index.js';

/**
 * CollectionEngine is ContextKit's deep module: a small interface backed by
 * all business logic (state management, validation, skill install/convert
 * coordination). CLI and GUI layers only ever call these methods.
 */
export interface ICollectionEngine {
  /**
   * Creates a new command with the given skill IDs. A leading `/` is
   * stripped (`/build` → `build`). Returns an error Result if a command
   * with `name` already exists, or if the new command can't be saved to
   * disk (in which case it is not kept — `create` can be safely retried).
   */
  create(name: string, skillIds: string[], command?: string): Result<Collection>;

  /**
   * Adds a skill to an existing command. Idempotent: adding a skill
   * already on the command is a no-op that still returns the current
   * command. Returns an error Result if the command doesn't exist, or
   * if the change can't be saved to disk (in which case the command is
   * left unchanged — `addSkill` can be safely retried).
   */
  addSkill(name: string, skillId: string): Result<Collection>;

  /**
   * Removes a skill from an existing command. A no-op (not an error) if
   * the skill isn't on the command. Returns an error Result if the
   * command doesn't exist, or if the change can't be saved to disk (in
   * which case the command is left unchanged — `removeSkill` can be
   * safely retried).
   */
  removeSkill(name: string, skillId: string): Result<Collection>;

  /**
   * Returns the command template stored for a collection, for `contextkit
   * run` to execute. Returns an error Result if the collection doesn't
   * exist or has no command defined.
   */
  getCommand(name: string): Result<string>;

  /** Returns all known commands. */
  list(): Collection[];

  /**
   * Merges collections from a team config file into local state. Additive:
   * config collections overwrite local collections with the same name, but
   * local-only collections are never deleted.
   * Returns an error Result if the config file is missing or invalid, or if
   * the merged state can't be saved to disk (in which case local state is
   * left unchanged — `sync` can be safely retried).
   */
  sync(configPath: string): Result<SyncResult>;

  /**
   * Installs a skill via the SkillsAdapter into `targetIDE`, then upserts
   * the catalog `SkillRecord` (`source`, `paths`, `deployedTo`). Does not
   * write command files and does not require the id to be filed. `dest`
   * writes into that folder without rebinding the workspace. Returns an
   * error Result if the adapter fails, or if the updated state can't
   * be saved (in which case no deploy is recorded — `install` can be
   * safely retried).
   */
  install(skillId: string, targetIDE: IDE, opts?: { dest?: string }): Promise<Result<SkillRecord>>;

  /**
   * Searches skills.sh for skills matching `query`, via the SkillsAdapter.
   * Returns an error Result if the search fails.
   */
  search(query: string): Promise<Result<Skill[]>>;

  /**
   * Fetches the skills.sh leaderboard for `view` (all-time or trending),
   * via the SkillsAdapter. Ranking, HTTP, and cache stay in the adapter
   * and backend — this is a pass-through so CLI/GUI stay engine-only.
   */
  browse(view: BrowseView): Promise<Result<Skill[]>>;

  /**
   * Converts a skill to `targetIDE`'s format via the SkillsAdapter's
   * `skillsmith` wrapper. Returns an error Result if the conversion fails.
   */
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>;

  /**
   * Leftover skillsmith convert-all. Product export is `exportCommand`.
   * CLI and GUI call `exportCommand`.
   */
  export(collectionNames: string[], targetIDE: IDE): Promise<Result<ExportResult>>;

  /**
   * Writes our stamped command file for `name` into `targetIDE`'s
   * commands dir, then ensures each filed skill exists in that IDE's
   * skills dir. Local folders already on disk are copied (never
   * overwritten if dest has SKILL.md). Discover-only ids go through
   * `install`. Does not scan `commands/` and does not call `convert`.
   * If the target command file exists and lacks `generated_by: skil`,
   * returns an error unless `replace` is true — no skill deploy in
   * that case. Missing command name is an error. Other IDE files are
   * left alone. Skill deploy failures are listed on `failures`; the
   * command file is still written. `dest` writes into that folder
   * without rebinding the workspace.
   */
  exportCommand(
    name: string,
    targetIDE: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;

  /**
   * Returns the Inbox holding list of skill IDs. Never downloads. Missing
   * `inbox` on disk is treated as `[]`.
   */
  inbox(): string[];

  /**
   * Adds a skill ID to Inbox. Idempotent: a duplicate stays one entry.
   * Does not call `install`. Returns an error Result if the change can't
   * be saved (in which case Inbox is left unchanged).
   */
  addToInbox(skillId: string): Result<string[]>;

  /**
   * Removes a skill ID from Inbox. A no-op (not an error) if it isn't
   * there. Returns an error Result if the change can't be saved (in which
   * case Inbox is left unchanged).
   */
  removeFromInbox(skillId: string): Result<string[]>;

  /**
   * Moves one Inbox ID onto an existing command. One persist; rollback
   * on write failure. Error if the command is missing or the ID is not
   * in Inbox — state is left unchanged. If the command already has the
   * ID, it is still dropped from Inbox. Does not call `install`.
   */
  file(skillId: string, commandName: string): Result<Collection>;

  /**
   * Deletes a command by name. Missing name is an error. Deleting the
   * last command is allowed. Returns an error Result if the change
   * can't be saved (in which case commands are left unchanged).
   */
  delete(name: string): Result<void>;

  /**
   * Pull: walk IDE skill trees, hash SKILL.md, reconcile the catalog.
   * New unfiled ids go to Inbox. Filed ids stay filed. Gone folders drop
   * the id from catalog, commands, and inbox. Does not create commands
   * and does not call install.
   */
  scan(): Result<ScanResult>;

  /** Catalog rows we are SoT for. */
  skills(): SkillRecord[];
}
