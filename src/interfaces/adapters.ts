import type { Result } from '../core/result.js';
import type { Config, IDE, IDEInfo, Skill } from '../types/index.js';

/**
 * Wraps all file system operations: symlinks, IDE detection, and JSON I/O.
 *
 * This is the primary test seam for isolating CollectionEngine from the
 * real file system. Tests mock this interface; only the real implementation
 * (RealFileSystemAdapter) touches disk.
 */
export interface IFileSystemAdapter {
  /**
   * Creates a symlink at `target` pointing to `source`.
   * Returns an error Result if `target` already exists or permissions are denied.
   */
  createSymlink(source: string, target: string): Result<void>;

  /**
   * Removes the symlink at `path`.
   * Returns an error Result if the path doesn't exist or isn't a symlink.
   */
  removeSymlink(path: string): Result<void>;

  /** Scans `projectRoot` for known IDE directories and returns those found. */
  detectIDEs(projectRoot: string): IDEInfo[];

  /** Returns whether a file or directory exists at `path`. */
  exists(path: string): boolean;

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
 * Wraps YAML parsing, validation, and writing for `.contextkit.yml`.
 *
 * Isolates CollectionEngine from the config file format, so switching
 * formats (YAML, JSON, TOML) never requires engine changes.
 */
export interface IConfigAdapter {
  /** Reads and parses a config file. Returns an error Result if missing or malformed. */
  read(path: string): Result<Config>;

  /** Writes a Config object to `path` in the adapter's file format. */
  write(path: string, config: Config): Result<void>;

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

  /** Installs a skill by ID via `npx skills add`. */
  install(skillId: string): Promise<Result<void>>;

  /** Converts a skill to a target IDE's format via `skillsmith`. */
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>;

  /** Returns skills already installed, read from local tooling state. */
  getInstalled(): Skill[];
}
