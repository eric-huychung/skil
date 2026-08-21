/** Where a skill originated from. */
export type SkillSource = 'skills.sh' | 'github' | 'local';

/** IDEs ContextKit can convert skills for via `contextkit convert`/`export`. */
export type IDE = 'cursor' | 'claude' | 'windsurf';

/** Leaderboard views proxied from skills.sh. */
export type BrowseView = 'all-time' | 'trending';

/** A single AI skill that has been installed locally. */
export interface Skill {
  /** Unique identifier, e.g. "obra/react-patterns". */
  id: string;
  source: SkillSource;
  /** ISO 8601 timestamp of when the skill was installed. */
  installedAt: string;
  /** Install count from the skills.sh leaderboard. Absent on search hits and installed-skill records. */
  installs?: number;
}

/** A named group of skills. */
export interface Collection {
  name: string;
  /** Skill IDs belonging to this collection. */
  skills: string[];
  /** ISO 8601 timestamp of when the collection was created. */
  createdAt: string;
  /**
   * Optional shell command template associated with this collection, run
   * via `contextkit run <name>`. Absent on collections created before this
   * field existed — always check before use.
   */
  command?: string;
}

/**
 * Persisted engine state, stored at `.contextkit/state.json`.
 *
 * Schema v2 (current): dropped `activeCollection` and `Collection.lastUsedAt`
 * when symlink-based activation was replaced by IDE export (see
 * `docs/design/architecture.md`, "Decision Log"). Older v1 state files
 * still have both fields on disk; they're simply ignored on load — no
 * explicit migration step is needed since `readJSON<State>` only reads the
 * fields this type declares.
 */
export interface State {
  collections: Collection[];
  installedSkills: Skill[];
  /** Schema version, for future migrations. */
  version: string;
}

/** Parsed representation of a team `.contextkit.yml` file. */
export interface Config {
  version: string;
  /** Map of collection name to the list of skill IDs it contains. */
  collections: Record<string, string[]>;
}

/** Outcome of a sync operation, merging a team config into local state. */
export interface SyncResult {
  /** Names of collections added or updated from the config file. */
  synced: string[];
  /** Actionable messages about local collections not present in the config. */
  warnings: string[];
}

/** Outcome of a bulk export operation. */
export interface ExportResult {
  /** `"collection/skillId"` pairs successfully converted for the target IDE. */
  succeeded: string[];
  /** Actionable messages about skills or collections that failed to export. */
  failures: string[];
}
