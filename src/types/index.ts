/** Where a skill originated from. */
export type SkillSource = 'skills.sh' | 'github' | 'local';

/** IDEs skil can scan and push to. */
export type IDE = 'cursor' | 'claude' | 'windsurf' | 'agents';

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

/** Persisted command: membership is per IDE. Not returned to callers. */
export interface CommandRecord {
  name: string;
  /** Skill ids filed on this command for each IDE. Missing key = absent on that IDE. */
  membership: Partial<Record<IDE, string[]>>;
  createdAt: string;
  /**
   * Leftover shell template for `contextkit run`. Absent on commands
   * created without it — always check before use.
   */
  command?: string;
}

/** View DTO from `list(ide)` — `skills` is that IDE's membership. Display as `/name`. */
export interface Command {
  name: string;
  /** Catalog ids filed on this command for the requested IDE. */
  skills: string[];
  /** ISO 8601 timestamp of when the command was created. */
  createdAt: string;
  /**
   * Leftover shell template for `contextkit run`. Absent on commands
   * created without it — always check before use.
   */
  command?: string;
}

/** Temporary alias so CLI/GUI keep typechecking while copy catches up. */
export type Collection = Command;

/** One skill we have seen on disk or deployed. We are SoT for this row. */
export interface SkillRecord {
  /** Path relative to that IDE's skills root (`tdd`, `ui/styling`). */
  id: string;
  /** sha256 of SKILL.md (utf-8). */
  hash: string;
  /** Folders we have seen, relative to the project root. */
  paths: string[];
  deployedTo: Array<{ ide: IDE; path: string; installedAt: string }>;
  source: 'local' | 'skills.sh';
}

/** Outcome of `scan()` — pull. */
export interface ScanResult {
  added: string[];
  gone: string[];
  changed: string[];
  /** Stamped command file won for that IDE (disk ≠ map). */
  commandPulls: Array<{ ide: IDE; name: string }>;
}

/**
 * Persisted engine state, stored at `.skil/state.json`.
 * Missing file → empty state. Leftover `.contextkit/state.json` with no
 * `.skil/` file is an error — no fallback.
 *
 * Schema v5: `commands[].membership` by IDE. Load v4 `commands[].skills`
 * as `membership.cursor`. Load v3 `collections` → `commands` first, then
 * the same. Missing `skills` catalog → `[]`. `installedSkills` is leftover
 * (not the catalog). Missing `inbox` → `[]`. v1 `activeCollection` is
 * still ignored. No rewrite on read.
 */
export interface State {
  commands: CommandRecord[];
  skills: SkillRecord[];
  /**
   * Staging pool of skill ids (scanned locals + Discover adds). Filing onto
   * a command does not remove the id. Not a command — reserved name `inbox`
   * cannot be created. Missing on pre-v3 files; treat as `[]`.
   */
  inbox: string[];
  /** Schema version, for future migrations. */
  version: string;
  /**
   * Leftover. Ignored as the catalog — install records `deployedTo` on
   * `skills`. Still loaded/persisted so old files do not break.
   */
  installedSkills: Skill[];
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

/** Outcome of an export. Product `exportCommand` puts the command file and any copied/installed skill paths in `succeeded`. Leftover skillsmith `export` still uses `"command:skillId"` pairs. */
export interface ExportResult {
  /** Written command-file / skill dest paths (`exportCommand`) or leftover convert pairs. */
  succeeded: string[];
  /** Skill deploy failures, or leftover convert failures. The command file may still have been written. */
  failures: string[];
}
