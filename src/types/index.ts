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
  /** Install count from the skills.sh listing. Absent on installed-skill records. */
  installs?: number;
  /**
   * Listing-only fields from skills.sh search/browse. Never persist these on
   * `state.json` installed-skill records. `repo` is the GitHub owner/repo
   * (skills.sh JSON `source`) — not `Skill.source`.
   */
  name?: string;
  repo?: string;
  installUrl?: string;
  url?: string;
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
 * Schema v3 (current): added `inbox`, a holding list of skill IDs that is
 * not a collection. Schema v2 dropped `activeCollection` and
 * `Collection.lastUsedAt` when symlink-based activation was replaced by
 * IDE export. Older files without `inbox` load as `[]` — no rewrite on
 * read. v1 `activeCollection`/`lastUsedAt` fields are still ignored.
 */
export interface State {
  collections: Collection[];
  installedSkills: Skill[];
  /**
   * Skill IDs waiting to be filed into a named collection. Not a
   * collection — reserved name `inbox` cannot be created. Missing on
   * pre-v3 files; treat as `[]`.
   */
  inbox: string[];
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
