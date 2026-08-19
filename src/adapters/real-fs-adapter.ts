import { existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
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

  readJSON<T>(_path: string): Result<T> {
    return err(new Error('RealFileSystemAdapter.readJSON not yet implemented'));
  }

  writeJSON<T>(_path: string, _data: T): Result<void> {
    return err(new Error('RealFileSystemAdapter.writeJSON not yet implemented'));
  }
}
