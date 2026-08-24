import type { Result } from '../core/result.js';
import type { BrowseView, Collection, ExportResult, IDE, ScanResult, Skill, SkillRecord, SyncResult } from '../types/index.js';

/**
 * CollectionEngine is ContextKit's deep module: a small interface backed by
 * all business logic (state management, validation, skill install/convert
 * coordination). CLI and GUI layers only ever call these methods.
 */
export interface ICollectionEngine {
  /**
   * Creates a command on `ide` (default `cursor`) with the given skill
   * IDs. A leading `/` is stripped (`/build` → `build`). If `/build`
   * already exists on another IDE, this adds `membership[ide]` — not
   * "already exists". "Already exists" only if that IDE already has the
   * name. Returns an error Result if the change can't be saved (in which
   * case it is not kept — `create` can be safely retried).
   */
  create(name: string, skillIds: string[], command?: string, ide?: IDE): Result<Collection>;

  /**
   * Adds a skill to an existing command on `ide` (default `cursor`).
   * Idempotent: adding a skill already on that IDE's list is a no-op
   * that still returns the current view. Returns an error Result if the
   * command doesn't exist on that IDE, or if the change can't be saved
   * (in which case the command is left unchanged — `addSkill` can be
   * safely retried).
   */
  addSkill(name: string, skillId: string, ide?: IDE): Result<Collection>;

  /**
   * Removes a skill from an existing command on `ide` (default `cursor`).
   * A no-op (not an error) if the skill isn't on that IDE's list. Returns
   * an error Result if the command doesn't exist on that IDE, or if the
   * change can't be saved (in which case the command is left unchanged —
   * `removeSkill` can be safely retried).
   */
  removeSkill(name: string, skillId: string, ide?: IDE): Result<Collection>;

  /**
   * Returns the command template stored for a collection, for `contextkit
   * run` to execute. Returns an error Result if the collection doesn't
   * exist or has no command defined.
   */
  getCommand(name: string): Result<string>;

  /**
   * Returns commands that exist on `ide` (default `cursor`). `skills` is
   * that IDE's membership only.
   */
  list(ide?: IDE): Collection[];

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
   * Leftover skillsmith convert-all. Product export is `exportCommand`
   * (one command) and `exportAll` (whole workspace). CLI still calls
   * `exportCommand`; GUI calls `exportAll`.
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
   * Writes stamped command files for every command in the workspace,
   * then deploys unique filed skills the target IDE is missing.
   * Checks every command file first: if any exists without
   * `generated_by: skil` and `replace` is not true, returns an error
   * and writes nothing. Empty workspace is an error. `dest` writes
   * into that folder without rebinding the workspace.
   */
  exportAll(
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
   * Adds an Inbox ID onto an existing command on `ide` (default `cursor`).
   * Product path: Inbox keeps the id (GUI `addSkill`). This method still
   * drops the id from Inbox — leftover until aligned. One persist;
   * rollback on write failure. Error if the command is missing on that
   * IDE or the ID is not in Inbox. Does not call `install`. Other IDEs'
   * lists are left unchanged.
   */
  file(skillId: string, commandName: string, ide?: IDE): Result<Collection>;

  /**
   * Drops `ide`'s membership for `name` (default `cursor`). Missing name
   * on that IDE is an error. Drops the command row when no IDE still has
   * it. Returns an error Result if the change can't be saved (in which
   * case commands are left unchanged).
   */
  delete(name: string, ide?: IDE): Result<void>;

  /**
   * Copies one command's membership from `fromIde` to `toIde`, writes the
   * dest stamped file, and deploys missing skill folders. Same stamp /
   * replace / skip-existing-skill rules as `exportCommand`. Unstamped dest
   * file needs `replace: true` — membership is not changed in that case.
   */
  copyTo(
    name: string,
    fromIde: IDE,
    toIde: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;

  /**
   * Copies every command that exists on `fromIde` onto `toIde`. Same
   * stamp / replace rules as `copyTo`. Empty source is an error.
   */
  copyAll(
    fromIde: IDE,
    toIde: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;

  /**
   * Paths written by the last membership mutation's write-through (or
   * copy/export). Watcher mutes these so our own writes are not a loop.
   */
  lastWrittenPaths(): string[];

  /**
   * Pull: walk IDE skill trees, hash SKILL.md, reconcile the catalog.
   * New ids go to Inbox if missing. Inbox is a staging pool — filing
   * does not remove ids. Gone folders drop the id from catalog, commands,
   * and inbox. Does not create commands and does not call install.
   */
  scan(): Result<ScanResult>;

  /** Catalog rows we are SoT for. */
  skills(): SkillRecord[];
}
