import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { IDE, IDEInfo } from '../types/index.js';

/** Maps each supported IDE to its integration directory name, relative to the project root. */
const IDE_DIRS: Record<IDE, string> = {
  cursor: '.agents',
  claude: '.claude',
  windsurf: '.windsurf',
};

/**
 * Real file system implementation of IFileSystemAdapter, backed by Node's
 * `fs` module. Used in production; tests use InMemoryFileSystemAdapter
 * instead so CollectionEngine tests never touch disk.
 */
export class RealFileSystemAdapter implements IFileSystemAdapter {
  createSymlink(source: string, target: string): Result<void> {
    try {
      symlinkSync(source, target);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to create symlink at '${target}': ${(error as Error).message}`));
    }
  }

  removeSymlink(path: string): Result<void> {
    try {
      unlinkSync(path);
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to remove symlink at '${path}': ${(error as Error).message}`));
    }
  }

  exists(path: string): boolean {
    return existsSync(path);
  }

  detectIDEs(projectRoot: string): IDEInfo[] {
    const ides: IDEInfo[] = [];
    for (const [name, dirName] of Object.entries(IDE_DIRS) as [IDE, string][]) {
      const dirPath = join(projectRoot, dirName);
      if (existsSync(dirPath)) {
        ides.push({ name, path: join(dirPath, 'skills') });
      }
    }
    return ides;
  }

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
