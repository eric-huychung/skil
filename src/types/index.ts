/** Where a skill originated from. */
export type SkillSource = 'skills.sh' | 'github' | 'local';

/** Docks skil can scan and push to. Product language is dock; `IDE` stays until a rename. */
export type IDE = 'cursor' | 'claude' | 'codex' | 'copilot' | 'agents' | 'windsurf';
export type Dock = IDE;

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

/** Persisted command: one skills list for the project. Not returned to callers. */
export interface CommandRecord {
  name: string;
  /** Catalog ids filed on this command. Project SoT — docks are export targets. */
  skills: string[];
  createdAt: string;
  /**
   * Leftover shell template for `skil run`. Absent on commands
   * created without it — always check before use.
   */
  command?: string;
}

/** View DTO from `list()` — same skills as persist. Display as `/name`. */
export interface Command {
  name: string;
  /** Catalog ids filed on this command. */
  skills: string[];
  /** ISO 8601 timestamp of when the command was created. */
  createdAt: string;
  /**
   * Leftover shell template for `skil run`. Absent on commands
   * created without it — always check before use.
   */
  command?: string;
  /**
   * Computed from disk, not persisted: `true` when both live
   * command-skill folders (`.agents/skills/<name>`, `.claude/skills/<name>`)
   * are present. A partial live copy (mid-toggle, or a disagreement) is
   * `false`, same as fully off.
   */
  enabled: boolean;
}

/** Counts of how often a catalog skill was read. Phase 5 eval. */
export interface UsageRow {
  skillId: string;
  count: number;
}

/** Market origin vs disk vs live skills.sh, for the catalog's Update action. */
export type OriginStatus = 'current' | 'update' | 'edited';

export interface OriginCheck {
  skillId: string;
  status: OriginStatus;
}

/** One observed skill read. Aggregated by `engine.usage()`. */
export interface UsageEvent {
  skillId: string;
  source: 'claude' | 'cursor';
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
  /**
   * sha256 of SKILL.md at the moment we copied from the market. Scan
   * updates `hash` but not this. Missing on local skills and on records
   * installed before origin tracking.
   */
  originHash?: string;
}

/**
 * One rule found on disk. Disk is SoT — we do not persist this.
 * `shared` = one `AGENTS.md` section, togglable via `setSharedRuleEnabled`
 * (park/restore, same model as a skill). `glob` = a path-scoped rule file
 * (`.cursor/rules/*.mdc`, `.claude/rules/**\/*.md`, etc.) left on disk
 * exactly as found — read-only, never folded into `AGENTS.md`.
 */
export interface RuleRecord {
  /** `pair-programming/behavior` for a shared section; a relative path for a glob file. */
  id: string;
  /** Display name (`pair-programming/behavior`, `behavior.mdc`). */
  name: string;
  kind: 'shared' | 'glob';
  /** `AGENTS.md` for a shared section; the `.mdc`/`.md` path for a glob file. */
  path: string;
  /** Shared only. Present (`.skil/parked/rules/<id>`) but not in `AGENTS.md` → `false`. */
  enabled?: boolean;
}

/** A leftover skill, command, or rule path — catalogued, never written to except by `adoptLeftovers`. */
export interface LeftoverRecord {
  kind: 'skill' | 'command' | 'rule';
  id: string;
  /** Relative to the project root, e.g. `.cursor/skills/tdd`. */
  path: string;
}

/** Outcome of `adoptLeftovers()`. */
export interface AdoptResult {
  /** Catalog ids copied into the live pair because they were missing there. */
  adopted: string[];
  /** Old leftover paths moved under `.skil/deprecated/`. */
  deprecated: string[];
}

/** Outcome of `scan()` — pull. */
export interface ScanResult {
  added: string[];
  gone: string[];
  changed: string[];
  /** Leftover always-on rule files that fight `AGENTS.md` (warn only). */
  alwaysOnWarnings: string[];
}

/**
 * Persisted engine state, stored at `.skil/state.json`.
 * Missing file → empty state. Leftover `.contextkit/state.json` with no
 * `.skil/` file is an error — no fallback.
 *
 * Schema v6: `commands[].skills` is the project list. Load v5
 * `commands[].membership` as a union (cursor first, then other keys,
 * unique). Load v4 `commands[].skills` as that array. Load v3
 * `collections` → `commands` first, then the same. Missing `skills`
 * catalog → `[]`. `installedSkills` is leftover (not the catalog). A
 * leftover `inbox` field on an old file is read and dropped — not carried
 * into `State`, never written back. v1 `activeCollection` is still
 * ignored. No rewrite on read.
 */
export interface State {
  commands: CommandRecord[];
  skills: SkillRecord[];
  /** Schema version, for future migrations. */
  version: string;
  /**
   * Leftover. Ignored as the catalog — install records `deployedTo` on
   * `skills`. Still loaded/persisted so old files do not break.
   */
  installedSkills: Skill[];
}

/** Outcome of an export. Product `exportCommand` puts the command file and any copied/installed skill paths in `succeeded`. */
export interface ExportResult {
  /** Written command-file / skill dest paths (`exportCommand`). */
  succeeded: string[];
  /** Skill deploy failures. The command file may still have been written. */
  failures: string[];
}
