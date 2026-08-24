import type { Result } from '../core/result.js';
import type { BrowseView, Config, IDE, Skill } from '../types/index.js';

/**
 * Wraps project-local I/O: JSON state, SKILL.md discovery, and utf-8 files.
 *
 * This is the primary test seam for isolating CollectionEngine from the
 * real file system. Tests use InMemoryFileSystemAdapter; only
 * RealFileSystemAdapter touches disk.
 *
 * Previously also owned symlink creation/removal and IDE detection for
 * activate/deactivate; those methods were removed along with that feature
 * — see `docs/design/architecture.md`, "Decision Log".
 */
export interface IFileSystemAdapter {
  /**
   * Reads and parses a JSON file.
   * Returns an error Result if the file is missing or contains malformed JSON.
   */
  readJSON<T>(path: string): Result<T>;

  /**
   * Writes `data` as JSON to `path` atomically (write to temp file, then rename).
   * Returns an error Result if the write fails.
   */
  writeJSON<T>(path: string, data: T): Result<void>;

  /**
   * Walks `root` and returns folders that contain a file named `SKILL.md`.
   * Paths are relative to the adapter root. Missing root → ok([]).
   * A file at `root` is an error. A parent is a skill only if it has its own SKILL.md.
   */
  findSkillFolders(root: string): Result<string[]>;

  /**
   * Reads a file as utf-8 text. Relative paths resolve under the adapter root;
   * absolute paths stay absolute.
   */
  readFile(path: string): Result<string>;

  /**
   * Writes utf-8 text to `path`, creating parent directories as needed.
   * Relative paths resolve under the adapter root; absolute paths stay absolute.
   */
  writeFile(path: string, data: string): Result<void>;

  /**
   * Copies every file under `from` into `to`, creating parent dirs.
   * Missing source or a file-as-source is an error. Destination files
   * are overwritten. Engine callers skip when dest already has SKILL.md.
   */
  copyDir(from: string, to: string): Result<void>;

  /**
   * Lists file paths (not directories) directly under `dir`. Paths are
   * relative to the adapter root. Missing dir → ok([]). A file at `dir`
   * is an error.
   */
  listFiles(dir: string): Result<string[]>;

  /**
   * Deletes a file. Missing path is ok (idempotent). Relative paths
   * resolve under the adapter root.
   */
  removeFile(path: string): Result<void>;
}

/**
 * Wraps YAML parsing and validation for `.contextkit.yml`.
 *
 * Isolates CollectionEngine from the config file format, so switching
 * formats (YAML, JSON, TOML) never requires engine changes.
 */
export interface IConfigAdapter {
  /** Reads and parses a config file. Returns an error Result if missing or malformed. */
  read(path: string): Result<Config>;

  /** Validates a parsed Config against the expected schema. */
  validate(config: Config): Result<void>;
}

/**
 * Wraps external skill tooling: skills.sh search API, `npx skills add`, and
 * `skillsmith convert`. Isolates CollectionEngine from network calls and
 * subprocess execution.
 */
export interface ISkillsAdapter {
  /** Searches skills.sh for skills matching `query`. */
  search(query: string): Promise<Result<Skill[]>>;

  /** Fetches the skills.sh leaderboard for `view` (all-time or trending). */
  browse(view: BrowseView): Promise<Result<Skill[]>>;

  /**
   * Installs a skill by ID via `npx skills add`. The agent/IDE flag is
   * chosen inside the adapter from `targetIDE` — callers do not pass flags.
   * `cwd` overrides the adapter's project root for this call only.
   */
  install(skillId: string, targetIDE: IDE, opts?: { cwd?: string }): Promise<Result<void>>;

  /** Converts a skill to a target IDE's format via `skillsmith`. */
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>;

  /** Returns skills already installed, read from local tooling state. */
  getInstalled(): Skill[];
}
