import { cpSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';

/**
 * Real file system implementation of IFileSystemAdapter, backed by Node's
 * `fs` module. Used in production; tests use InMemoryFileSystemAdapter
 * instead so CollectionEngine tests never touch disk.
 *
 * Relative paths resolve under `root` (the project directory). Absolute
 * paths are used as-is so callers can still point at a specific file.
 * Walks skill trees and reads/writes utf-8 files in addition to JSON state.
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

  findSkillFolders(root: string): Result<string[]> {
    const resolved = this.resolvePath(root);
    let stats;
    try {
      stats = statSync(resolved);
    } catch {
      return ok([]);
    }
    if (!stats.isDirectory()) {
      return err(new Error(`Failed to scan '${root}': not a directory`));
    }

    const found: string[] = [];
    const visit = (dir: string): void => {
      const entries = readdirSync(dir, { withFileTypes: true });
      if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
        found.push(this.toAdapterRelative(dir));
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          visit(join(dir, entry.name));
        }
      }
    };
    visit(resolved);
    return ok(found);
  }

  readFile(path: string): Result<string> {
    const resolved = this.resolvePath(path);
    try {
      return ok(readFileSync(resolved, 'utf-8'));
    } catch (error) {
      return err(new Error(`Failed to read '${path}': ${(error as Error).message}`));
    }
  }

  writeFile(path: string, data: string): Result<void> {
    const resolved = this.resolvePath(path);
    try {
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, data, 'utf-8');
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to write '${path}': ${(error as Error).message}`));
    }
  }

  copyDir(from: string, to: string): Result<void> {
    const src = this.resolvePath(from);
    const dest = this.resolvePath(to);
    try {
      const stats = statSync(src);
      if (!stats.isDirectory()) {
        return err(new Error(`Failed to copy '${from}': not a directory`));
      }
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true });
      return ok(undefined);
    } catch (error) {
      return err(new Error(`Failed to copy '${from}' to '${to}': ${(error as Error).message}`));
    }
  }

  private resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(this.root, path);
  }

  private toAdapterRelative(absoluteDir: string): string {
    const rel = relative(this.root, absoluteDir);
    return rel === '' ? '.' : rel.split(sep).join('/');
  }
}
