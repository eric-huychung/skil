import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';
import type { IDEInfo } from '../types/index.js';

/**
 * In-memory stand-in for the real file system, used as a test double for
 * CollectionEngine and CLI tests. Not for production use.
 */
export class InMemoryFileSystemAdapter implements IFileSystemAdapter {
  private symlinks = new Map<string, string>();
  private files = new Map<string, unknown>();
  private detectedIDEs: IDEInfo[] = [];

  createSymlink(source: string, target: string): Result<void> {
    this.symlinks.set(target, source);
    return ok(undefined);
  }

  removeSymlink(path: string): Result<void> {
    if (!this.symlinks.has(path)) {
      return err(new Error(`No symlink exists at '${path}'`));
    }
    this.symlinks.delete(path);
    return ok(undefined);
  }

  detectIDEs(_projectRoot: string): IDEInfo[] {
    return this.detectedIDEs;
  }

  readJSON<T>(path: string): Result<T> {
    if (!this.files.has(path)) {
      return err(new Error(`No file exists at '${path}'`));
    }
    return ok(this.files.get(path) as T);
  }

  writeJSON<T>(path: string, data: T): Result<void> {
    this.files.set(path, data);
    return ok(undefined);
  }

  /** Test helper: configures what detectIDEs() returns. */
  setDetectedIDEs(ides: IDEInfo[]): void {
    this.detectedIDEs = ides;
  }

  /** Test helper: inspects current symlinks (target -> source). */
  getSymlinks(): Map<string, string> {
    return new Map(this.symlinks);
  }

  /** Test helper: clears all in-memory state between tests. */
  reset(): void {
    this.symlinks.clear();
    this.files.clear();
    this.detectedIDEs = [];
  }
}
