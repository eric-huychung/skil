import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';

/**
 * Real file system implementation of IFileSystemAdapter, backed by Node's
 * `fs` module. Used in production; tests use InMemoryFileSystemAdapter
 * instead so CollectionEngine tests never touch disk.
 */
export class RealFileSystemAdapter implements IFileSystemAdapter {
  readJSON<T>(path: string): Result<T> {
    let contents: string;
    try {
      contents = readFileSync(path, 'utf-8');
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
    const tempPath = `${path}.${process.pid}.tmp`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(tempPath, JSON.stringify(data, null, 2));
      renameSync(tempPath, path);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to write '${path}': ${(error as Error).message}`));
    }
  }
}
