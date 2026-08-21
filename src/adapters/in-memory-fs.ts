import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';

/**
 * In-memory stand-in for the real file system, used as a test double for
 * CollectionEngine and CLI tests. Not for production use.
 */
export class InMemoryFileSystemAdapter implements IFileSystemAdapter {
  private files = new Map<string, unknown>();
  private writeError: Error | null = null;

  readJSON<T>(path: string): Result<T> {
    if (!this.files.has(path)) {
      return err(new Error(`No file exists at '${path}'`));
    }
    return ok(this.files.get(path) as T);
  }

  writeJSON<T>(path: string, data: T): Result<void> {
    if (this.writeError) {
      return err(this.writeError);
    }
    this.files.set(path, data);
    return ok(undefined);
  }

  /** Test helper: makes every writeJSON() call fail with `error` until cleared with `setWriteError(null)`. */
  setWriteError(error: Error | null): void {
    this.writeError = error;
  }

  /** Test helper: clears all in-memory state between tests. */
  reset(): void {
    this.files.clear();
    this.writeError = null;
  }
}
