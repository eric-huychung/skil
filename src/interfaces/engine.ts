import type { Result } from '../core/result.js';
import type {
  AdoptResult,
  BrowseView,
  Collection,
  LeftoverRecord,
  OriginCheck,
  RuleRecord,
  ScanResult,
  Skill,
  SkillRecord,
  UsageRow,
} from '../types/index.js';

/**
 * CollectionEngine is skil's deep module: a small interface backed by
 * all business logic (state, live/parked/leftover/deprecated path
 * classification, skill install coordination). CLI and GUI layers only
 * ever call these methods. No method takes a dock or dest — a write
 * always means "the live pair" (`.agents` + `.claude`), and toggling
 * off always means "parked." See `docs/design/architecture.md`.
 */
export interface ICollectionEngine {
  /**
   * Creates a command with the given skill IDs. A leading `/` is stripped
   * (`/build` → `build`). "Already exists" if the name is already on the
   * project map. The command starts off (no live or parked folder) until
   * `setCommandEnabled(name, true)`. Returns an error Result if the
   * change can't be saved (in which case it is not kept — `create` can be
   * safely retried).
   */
  create(name: string, skillIds: string[]): Result<Collection>;

  /**
   * Adds a skill to an existing command. Idempotent: adding a skill
   * already on the list is a no-op that still returns the current view.
   * Write-through refreshes the command's live skill folders' `## Skills`
   * only when the command is currently on; an off command is left
   * unwritten until the next `setCommandEnabled(name, true)`. Returns an
   * error Result if the command doesn't exist, or if the change can't be
   * saved (in which case the command is left unchanged).
   */
  addSkill(name: string, skillId: string): Result<Collection>;

  /**
   * Removes a skill from an existing command. A no-op (not an error) if
   * the skill isn't on the list. Same write-through-only-when-on rule as
   * `addSkill`. Returns an error Result if the command doesn't exist, or
   * if the change can't be saved (in which case the command is left
   * unchanged).
   */
  removeSkill(name: string, skillId: string): Result<Collection>;

  /** Returns the project command map. */
  list(): Collection[];

  /**
   * Installs a market skill into the live pair: one `npx skills add`
   * into `.agents/skills/<id>`, then a `copyDir` into
   * `.claude/skills/<id>`. Never writes a leftover root. Upserts the
   * catalog `SkillRecord` (`source: 'skills.sh'`, both live `paths`,
   * `originHash` stamped). Does not write command files and does not
   * require the id to be filed. `dest` writes into that folder without
   * rebinding the workspace. Returns an error Result if the adapter
   * fails, or if the updated state can't be saved (in which case no
   * deploy is recorded — `install` can be safely retried).
   */
  install(skillId: string, opts?: { dest?: string; replace?: boolean }): Promise<Result<SkillRecord>>;

  /**
   * On/off is a path move, not a flag. `false` moves both live folders
   * (`.agents/skills/<id>`, `.claude/skills/<id>`) to
   * `.skil/parked/skills/<id>` — a partial live copy is parked from
   * whichever live paths exist. `true` copies the parked folder back to
   * every missing live path; if some live paths are already present it
   * mirrors from one of those instead (self-heal, parked untouched). If
   * neither a live nor a parked copy exists: a `source: 'skills.sh'`
   * record re-fetches via `install` straight into the pair; a `source:
   * 'local'` record is an error — nothing to restore from. Already
   * on/off is a no-op that still returns the current record. Never
   * writes a leftover root. Unknown `id` (no catalog row) is an error.
   */
  setSkillEnabled(id: string, enabled: boolean): Promise<Result<SkillRecord>>;

  /**
   * On/off for a command, mirroring `setSkillEnabled`. `false` parks
   * both live command-skill folders (`.agents/skills/<name>`,
   * `.claude/skills/<name>`) under `.skil/parked/commands/<name>` — a
   * separate park tree from skills, so `/build` off can never collide
   * with a parked skill literally named `build`. `true` restores from
   * parked (or self-heals from a present live copy), or writes a fresh
   * human-only skill (`disable-model-invocation: true` +
   * `agents/openai.yaml`) if neither exists. Refuses with a
   * `COMMAND_NAME_COLLISION` error (no auto-prefix) if a live path
   * already holds a skill that isn't this command's own folder. Already
   * on/off is a no-op. Unknown `name` is an error.
   */
  setCommandEnabled(name: string, enabled: boolean): Promise<Result<Collection>>;

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
   * Deletes a skill from the project. Catalog rows lose every copy on
   * disk (live + parked; leftover and deprecated copies are untouched).
   * Nested skill folders stay. Empty parents are pruned up to the skills
   * root. Drops the id from the catalog and every command, then
   * write-through on commands that are currently on. Unknown ids are a
   * no-op. Persist failure leaves disk and state unchanged.
   */
  deleteSkill(skillId: string): Result<void>;

  /**
   * Reads the SKILL.md body for a catalog id. Disk owns the text — this
   * does not persist it. First readable copy in `paths` wins (live, then
   * leftover, then parked). Missing catalog row or no SKILL.md on disk is
   * an error.
   */
  readSkillMd(skillId: string): Result<string>;

  /**
   * Drops the command from the project map, and its live/parked command-
   * skill folders, if any. Missing name is an error. Returns an error
   * Result if the change can't be saved (in which case commands are left
   * unchanged).
   */
  delete(name: string): Result<void>;

  /**
   * Paths written by the last mutation (toggle, write-through, adopt).
   * Watcher mutes these so our own writes are not a loop.
   */
  lastWrittenPaths(): string[];

  /**
   * Pull: unions the live pair, every leftover skill root, and the
   * parked skill root into one catalog. Hashes SKILL.md, reconciles
   * gone/changed/new/rename. Never writes a leftover root, and never
   * restores/creates a live or
   * parked copy on its own — that is only `setSkillEnabled` /
   * `setCommandEnabled` / `setSharedRuleEnabled` / `adoptLeftovers`.
   * Does not create commands from skill folders and does not call
   * install.
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
   * Re-installs `skillId` over the live pair, then sets originHash to
   * the new disk hash. Refuses if the copy was edited unless
   * `replaceEdited` is true. Does not auto-run.
   */
  updateFromMarket(skillId: string, opts?: { replaceEdited?: boolean; dest?: string }): Promise<Result<SkillRecord>>;

  /**
   * Counts of how often catalog skills were read. Claude logs first.
   * Missing logs → empty list, not a crash. Collector failure is an error;
   * scan still works.
   */
  usage(): Promise<Result<UsageRow[]>>;

  /**
   * Rule rows on disk: every `AGENTS.md` shared-law section (`kind:
   * 'shared'`, togglable) plus every path-scoped glob rule file (`kind:
   * 'glob'`, read-only). A parked shared rule (off) still shows up, with
   * `enabled: false`. Disk is SoT — not persisted.
   */
  rules(): RuleRecord[];

  /** Reads a rule body by its `id`. Missing rule is an error. */
  readRule(id: string): Result<string>;

  /**
   * On/off for a shared-law rule. `false` removes its `AGENTS.md`
   * section and parks the body under `.skil/parked/rules/<id>`. `true`
   * upserts the section back (restoring from parked, or leaving the
   * current section as-is if it's already there). Refuses on a `glob`
   * rule id (path-scoped rules are never toggled). Unknown id with
   * nothing parked and no section on disk is an error.
   */
  setSharedRuleEnabled(id: string, enabled: boolean): Result<RuleRecord>;

  /**
   * Every catalogued skill/command/rule path that is neither live nor
   * parked (and never deprecated, which isn't scanned).
   */
  leftovers(): Result<LeftoverRecord[]>;

  /**
   * "Use ours and remove leftovers": for each given leftover id (or every
   * leftover if `ids` is omitted), copies it into the live pair if that
   * id is missing there, then moves the old leftover path under
   * `.skil/deprecated/<original-path>` — recoverable, never scanned
   * again. Never touches a parked path.
   */
  adoptLeftovers(ids?: string[]): Promise<Result<AdoptResult>>;
}
