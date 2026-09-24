import { createHash } from 'node:crypto';
import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import { err, isOk, ok, type Result } from './result.js';

const SKILL_MD_SUFFIX = '/SKILL.md';

/** Normalizes a skill folder path; strips a trailing `/SKILL.md` when present. */
export function skillFolderPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalized.endsWith(SKILL_MD_SUFFIX)) {
    return normalized.slice(0, -SKILL_MD_SUFFIX.length);
  }
  return normalized;
}

/**
 * Hash of every file under a skill folder (relative path + utf-8 body).
 * Missing `SKILL.md` or an unreadable file → undefined.
 */
export function hashSkillTree(fs: IFileSystemAdapter, folder: string): string | undefined {
  const root = skillFolderPath(folder);
  if (!isOk(fs.readFile(`${root}/SKILL.md`))) {
    return undefined;
  }
  const listed = fs.listAllFiles(root);
  if (!isOk(listed)) {
    return undefined;
  }
  const relative = listed.value
    .map((file) => file.slice(root.length + 1))
    .filter((part) => part.length > 0)
    .sort();

  const hash = createHash('sha256');
  for (const part of relative) {
    const body = fs.readFile(`${root}/${part}`);
    if (!isOk(body)) {
      return undefined;
    }
    hash.update(part);
    hash.update('\0');
    hash.update(body.value);
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * Moves a skill folder: copies the full tree to `to`, then deletes `from`.
 * Clears an existing destination folder first so a prior partial move cannot linger.
 */
export function relocateSkillFolder(fs: IFileSystemAdapter, from: string, to: string): Result<void> {
  const source = skillFolderPath(from);
  const dest = skillFolderPath(to);

  if (isOk(fs.readFile(`${dest}/SKILL.md`))) {
    const cleared = fs.removeDir(dest);
    if (!isOk(cleared)) {
      return err(new Error(`Failed to clear '${dest}': ${cleared.error.message}`));
    }
  }

  const copied = fs.copyDir(source, dest);
  if (!isOk(copied)) {
    return err(new Error(`Failed to copy '${source}' to '${dest}': ${copied.error.message}`));
  }

  const removed = fs.removeDir(source);
  if (!isOk(removed)) {
    return err(new Error(`Failed to remove '${source}': ${removed.error.message}`));
  }

  return ok(undefined);
}
