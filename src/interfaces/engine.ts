import type { Result } from '../core/result.js';
import type { BrowseView, Collection, ExportResult, IDE, Skill, SyncResult } from '../types/index.js';

/**
 * CollectionEngine is ContextKit's deep module: a small interface backed by
 * all business logic (state management, validation, skill install/convert
 * coordination). CLI and GUI layers only ever call these methods.
 */
export interface ICollectionEngine {
  /**
   * Creates a new collection with the given skill IDs.
   * Returns an error Result if a collection with `name` already exists, or
   * if the new collection can't be saved to disk (in which case it is not
   * kept — `create` can be safely retried).
   */
  create(name: string, skillIds: string[], command?: string): Result<Collection>;

  /**
   * Adds a skill to an existing collection. Idempotent: adding a skill
   * already in the collection is a no-op that still returns the current
   * collection. Returns an error Result if the collection doesn't exist, or
   * if the change can't be saved to disk (in which case the collection is
   * left unchanged — `addSkill` can be safely retried).
   */
  addSkill(name: string, skillId: string): Result<Collection>;

  /**
   * Removes a skill from an existing collection. A no-op (not an error) if
   * the skill isn't in the collection. Returns an error Result if the
   * collection doesn't exist, or if the change can't be saved to disk (in
   * which case the collection is left unchanged — `removeSkill` can be
   * safely retried).
   */
  removeSkill(name: string, skillId: string): Result<Collection>;

  /**
   * Returns the command template stored for a collection, for `contextkit
   * run` to execute. Returns an error Result if the collection doesn't
   * exist or has no command defined.
   */
  getCommand(name: string): Result<string>;

  /** Returns all known collections. */
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
   * Installs a skill via the SkillsAdapter and records it in
   * `state.installedSkills`. Returns an error Result if the underlying
   * install command fails, or if the updated state can't be saved to disk
   * (in which case the skill is not recorded — `install` can be safely
   * retried).
   */
  install(skillId: string): Promise<Result<Skill>>;

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
   * Converts every skill in each named collection to `targetIDE`'s format.
   * Never fails the whole call for one bad collection or skill: a
   * non-existent collection, or a skill that fails to convert, is recorded
   * in `failures` and the rest continue. Only returns an error Result for
   * something outside any single collection/skill's control.
   */
  export(collectionNames: string[], targetIDE: IDE): Promise<Result<ExportResult>>;
}
