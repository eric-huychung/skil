import type { Result } from '../core/result.js';
import type { BrowseView, Collection, ExportResult, IDE, OriginCheck, ScanResult, Skill, SkillRecord, SyncResult, UsageRow } from '../types/index.js';

/**
 * CollectionEngine is skil's deep module: a small interface backed by
 * all business logic (state management, validation, skill install/convert
 * coordination). CLI and GUI layers only ever call these methods.
 */
export interface ICollectionEngine {
  /**
   * Creates a command with the given skill IDs. A leading `/` is stripped
   * (`/build` → `build`). "Already exists" if the name is already on the
   * project map. `ide` is ignored (one list). Returns an error Result if
   * the change can't be saved (in which case it is not kept — `create`
   * can be safely retried).
   */
  create(name: string, skillIds: string[], command?: string, ide?: IDE): Result<Collection>;

  /**
   * Adds a skill to an existing command. Idempotent: adding a skill
   * already on the list is a no-op that still returns the current view.
   * `ide` is ignored. Returns an error Result if the command doesn't
   * exist, or if the change can't be saved (in which case the command is
   * left unchanged — `addSkill` can be safely retried).
   */
  addSkill(name: string, skillId: string, ide?: IDE): Result<Collection>;

  /**
   * Removes a skill from an existing command. A no-op (not an error) if
   * the skill isn't on the list. `ide` is ignored. Returns an error
   * Result if the command doesn't exist, or if the change can't be saved
   * (in which case the command is left unchanged — `removeSkill` can be
   * safely retried).
   */
  removeSkill(name: string, skillId: string, ide?: IDE): Result<Collection>;

  /**
   * Returns the command template stored for a collection, for `skil
   * run` to execute. Returns an error Result if the collection doesn't
   * exist or has no command defined.
   */
  getCommand(name: string): Result<string>;

  /**
   * Returns the project command map. `ide` is ignored (one list).
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
  install(skillId: string, targetIDE: IDE, opts?: { dest?: string; replace?: boolean }): Promise<Result<SkillRecord>>;

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
   * First write gets Goal/Sequence/Rules as one-line comments plus a
   * `## Skills` list. Later writes refresh frontmatter `skills:` and
   * `## Skills` and keep the user's Goal/Sequence/Rules (and anything
   * else above `## Skills`). Old numbered stubs upgrade to comments.
   * If the target command file exists and lacks `generated_by: skil`,
   * returns an error unless `replace` is true — no skill deploy in
   * that case. `replace` also resets Goal/Sequence/Rules on a stamped
   * file. Missing command name is an error. Other IDE files are left
   * alone. Skill deploy failures are listed on `failures`; the command
   * file is still written. `dest` writes into that folder without
   * rebinding the workspace.
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
   * Deletes a skill from the project. Catalog rows lose every IDE copy
   * on disk (SKILL.md plus related files in that folder). Nested skill
   * folders stay. Empty parents are pruned up to the IDE skills root.
   * Drops the id from the catalog, Inbox, and every command, then
   * write-through. Discover-only Inbox ids only leave Inbox. Unknown
   * ids are a no-op. Persist failure leaves disk and state unchanged.
   */
  deleteSkill(skillId: string): Result<void>;

  /**
   * Reads the SKILL.md body for a catalog id. Disk owns the text — this
   * does not persist it. First readable copy in `paths` wins (scan order,
   * `.cursor` first). Missing catalog row or no SKILL.md on disk is an
   * error. Discover-only Inbox ids are not catalog rows.
   */
  readSkillMd(skillId: string): Result<string>;

  /**
   * Adds an Inbox ID onto an existing command. Inbox stays a staging
   * pool: the id is not removed. One persist; rollback on write failure.
   * Error if the command is missing or the ID is not in Inbox. Does not
   * call `install`. `ide` is ignored.
   */
  file(skillId: string, commandName: string, ide?: IDE): Result<Collection>;

  /**
   * Drops the command from the project map. Missing name is an error.
   * `ide` is ignored. Returns an error Result if the change can't be
   * saved (in which case commands are left unchanged).
   */
  delete(name: string, ide?: IDE): Result<void>;

  /**
   * Writes the project map's command to `toIde` (stamped file + missing
   * skill folders). Same stamp / replace / skip-existing-skill rules as
   * `exportCommand`. `fromIde` is ignored. Unstamped dest file needs
   * `replace: true`.
   */
  copyTo(
    name: string,
    fromIde: IDE,
    toIde: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;

  /**
   * Writes every command on the map onto `toIde`. Same stamp / replace
   * rules as `copyTo`. Empty map is an error. `fromIde` is ignored.
   */
  copyAll(
    fromIde: IDE,
    toIde: IDE,
    opts?: { replace?: boolean; dest?: string }
  ): Promise<Result<ExportResult>>;

  /**
   * Copies one IDE's skill folders and stamped command files from
   * `sourceRoot` into this project. New ids are added (folders + Inbox).
   * Command names union into the project map. Existing dest `SKILL.md`
   * with a different hash or an unstamped dest command file is an error
   * unless `replace` is true — then dest bodies and that command's list
   * are overwritten. Same-hash skills and matching command lists are left
   * alone. Unstamped source command files, other IDEs, and source Inbox /
   * `state.json` are ignored. Empty source is an error. Does not bind
   * `sourceRoot`.
   */
  importFrom(
    sourceRoot: string,
    ide: IDE,
    opts?: { replace?: boolean }
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
   * and inbox. Stamped command files do not fork the map. Does not create
   * commands and does not call install.
   */
  scan(): Result<ScanResult>;

  /** Catalog rows we are SoT for. */
  skills(): SkillRecord[];

  /**
   * For each catalog skill with a market originHash: current (in sync),
   * update (market moved, disk still the template), or edited (disk
   * diverged). Missing market snapshot is current. Fetch failures skip
   * that id. Does not write disk.
   */
  originChecks(): Promise<Result<OriginCheck[]>>;

  /**
   * Re-installs `skillId` over the dock copies we deployed, then sets
   * originHash to the new disk hash. Refuses if the copy was edited
   * unless `replaceEdited` is true. Does not auto-run.
   */
  updateFromMarket(skillId: string, opts?: { replaceEdited?: boolean; dest?: string }): Promise<Result<SkillRecord>>;

  /**
   * Counts of how often catalog skills were read. Claude logs first.
   * Missing logs → empty list, not a crash. Collector failure is an error;
   * scan still works.
   */
  usage(): Promise<Result<UsageRow[]>>;
}
