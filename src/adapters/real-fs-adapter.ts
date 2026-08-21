import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';

/**
 * Real file system implementation of IFileSystemAdapter, backed by Node's
 * `fs` module. Used in production; tests use InMemoryFileSystemAdapter
 * instead so CollectionEngine tests never touch disk.
 *
 * Relative paths resolve under `root` (the project directory). Absolute
 * paths are used as-is so callers can still point at a specific file.
 */
export class RealFileSystemAdapter implements IFileSystemAdapter {
  constructor(private readonly root: string = process.cwd()) {}

  readJSON<T>(path: string): Result<T> {
    const resolved = this.resolvePath(path);
    let contents: string;
    try {
      contents = readFileSync(resolved, 'utf-8');
    } catch (error) {
      return err(new Error(`Failed to read '${path}': ${(error as Error).message}`));
    }

    try {
      return ok(JSON.parse(contents) as T);
    } catch (error) {
      return err(new Error(`Failed to parse JSON in '${path}': ${(error as Error).message}`));
    }
  }

  writeJSON<T>(path: string, data: T): Result<void> {
    const resolved = this.resolvePath(path);
    const tempPath = `${resolved}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(tempPath, JSON.stringify(data, null, 2));
      renameSync(tempPath, resolved);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to write '${path}': ${(error as Error).message}`));
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(this.root, path);
  }
}
