import type { Result } from '../core/result.js';
import type { BrowseView, Config, IDE, Skill } from '../types/index.js';

/**
 * Wraps state-file I/O (read/write JSON atomically).
 *
 * This is the primary test seam for isolating CollectionEngine from the
 * real file system. Tests mock this interface; only the real implementation
 * (RealFileSystemAdapter) touches disk.
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

  /** Installs a skill by ID via `npx skills add`. */
  install(skillId: string): Promise<Result<void>>;

  /** Converts a skill to a target IDE's format via `skillsmith`. */
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>;

  /** Returns skills already installed, read from local tooling state. */
  getInstalled(): Skill[];
}
