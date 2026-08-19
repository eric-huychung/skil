/** Where a skill originated from. */
export type SkillSource = 'skills.sh' | 'github' | 'local';

/** IDEs ContextKit can create skill symlinks for. */
export type IDE = 'cursor' | 'claude' | 'windsurf';

/** A single AI skill that has been installed locally. */
export interface Skill {
  /** Unique identifier, e.g. "obra/react-patterns". */
  id: string;
  source: SkillSource;
  /** ISO 8601 timestamp of when the skill was installed. */
  installedAt: string;
}

/** A named group of skills that can be activated together. */
export interface Collection {
  name: string;
  /** Skill IDs belonging to this collection. */
  skills: string[];
  /** ISO 8601 timestamp of when the collection was created. */
  createdAt: string;
  /** ISO 8601 timestamp of the collection's last activation, or null if never activated. */
  lastUsedAt: string | null;
}

/** Persisted engine state, stored at `.contextkit/state.json`. */
export interface State {
  collections: Collection[];
  /** Name of the currently active collection, or null if none is active. */
  activeCollection: string | null;
  installedSkills: Skill[];
  /** Schema version, for future migrations. */
  version: string;
}

/** Snapshot of the engine's current activation state. */
export interface Status {
  activeCollection: string | null;
  /** Skill IDs belonging to the active collection, empty if none is active. */
  skills: string[];
}

/** A detected IDE integration directory (e.g. `.cursor/`, `.claude/`). */
export interface IDEInfo {
  name: IDE;
  /** Absolute path to the IDE's directory. */
  path: string;
}

/** Parsed representation of a team `.contextkit.yml` file. */
export interface Config {
  version: string;
  /** Map of collection name to the list of skill IDs it contains. */
  collections: Record<string, string[]>;
}
