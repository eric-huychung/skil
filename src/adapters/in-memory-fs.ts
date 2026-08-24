import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, ok, type Result } from '../core/result.js';

/**
 * In-memory stand-in for the real file system, used as a test double for
 * CollectionEngine and CLI tests. Not for production use.
 *
 * JSON state and utf-8 files are separate stores so engine tests can seed
 * `.cursor/skills/tdd/SKILL.md` without going through JSON parse.
 */
export class InMemoryFileSystemAdapter implements IFileSystemAdapter {
  private files = new Map<string, unknown>();
  private textFiles = new Map<string, string>();
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

  findSkillFolders(root: string): Result<string[]> {
    const normalized = normalizePath(root);
    if (this.textFiles.has(normalized)) {
      return err(new Error(`Failed to scan '${root}': not a directory`));
    }

    const folders = new Set<string>();
    for (const filePath of this.textFiles.keys()) {
      const skillDir = skillFolderOf(filePath);
      if (skillDir !== null && isUnderRoot(skillDir, normalized)) {
        folders.add(skillDir);
      }
    }
    return ok([...folders].sort());
  }

  readFile(path: string): Result<string> {
    const normalized = normalizePath(path);
    if (!this.textFiles.has(normalized)) {
      return err(new Error(`No file exists at '${path}'`));
    }
    return ok(this.textFiles.get(normalized) as string);
  }

  writeFile(path: string, data: string): Result<void> {
    this.textFiles.set(normalizePath(path), data);
    return ok(undefined);
  }

  copyDir(from: string, to: string): Result<void> {
    const src = normalizePath(from);
    const dest = normalizePath(to);
    if (this.textFiles.has(src)) {
      return err(new Error(`Failed to copy '${from}': not a directory`));
    }

    const prefix = `${src}/`;
    let copied = 0;
    for (const [path, data] of this.textFiles) {
      if (path !== src && !path.startsWith(prefix)) {
        continue;
      }
      const relative = path === src ? '' : path.slice(prefix.length);
      const destPath = relative === '' ? dest : `${dest}/${relative}`;
      this.textFiles.set(destPath, data);
      copied += 1;
    }

    if (copied === 0) {
      return err(new Error(`Failed to copy '${from}': not found`));
    }
    return ok(undefined);
  }

  listFiles(dir: string): Result<string[]> {
    const normalized = normalizePath(dir);
    if (this.textFiles.has(normalized)) {
      return err(new Error(`Failed to list '${dir}': not a directory`));
    }

    const prefix = `${normalized}/`;
    const files: string[] = [];
    for (const path of this.textFiles.keys()) {
      if (!path.startsWith(prefix)) {
        continue;
      }
      const rest = path.slice(prefix.length);
      if (!rest.includes('/')) {
        files.push(path);
      }
    }
    return ok(files.sort());
  }

  removeFile(path: string): Result<void> {
    this.textFiles.delete(normalizePath(path));
    return ok(undefined);
  }

  /** Test helper: makes every writeJSON() call fail with `error` until cleared with `setWriteError(null)`. */
  setWriteError(error: Error | null): void {
    this.writeError = error;
  }

  /** Test helper: clears all in-memory state between tests. */
  reset(): void {
    this.files.clear();
    this.textFiles.clear();
    this.writeError = null;
  }
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return trimmed === '' ? '.' : trimmed;
}

function skillFolderOf(filePath: string): string | null {
  if (filePath === 'SKILL.md' || filePath === './SKILL.md') {
    return '.';
  }
  if (!filePath.endsWith('/SKILL.md')) {
    return null;
  }
  return filePath.slice(0, -'/SKILL.md'.length);
}

function isUnderRoot(dir: string, root: string): boolean {
  if (root === '.' || root === '') {
    return true;
  }
  return dir === root || dir.startsWith(`${root}/`);
}
