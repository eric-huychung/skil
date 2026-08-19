import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isErr, isOk } from '../core/result.js';
import { RealFileSystemAdapter } from './real-fs-adapter.js';

describe('RealFileSystemAdapter', () => {
  let tmpDir: string;
  let adapter: RealFileSystemAdapter;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'contextkit-'));
    adapter = new RealFileSystemAdapter();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createSymlink', () => {
    it('creates a real symlink pointing at the source', () => {
      const source = join(tmpDir, 'source.md');
      const target = join(tmpDir, 'target.md');
      writeFileSync(source, 'skill content');

      const result = adapter.createSymlink(source, target);

      expect(isOk(result)).toBe(true);
      expect(lstatSync(target).isSymbolicLink()).toBe(true);
      expect(readlinkSync(target)).toBe(source);
    });

    it('returns an error when the target already exists', () => {
      const source = join(tmpDir, 'source.md');
      const target = join(tmpDir, 'target.md');
      writeFileSync(source, 'skill content');
      writeFileSync(target, 'already here');

      const result = adapter.createSymlink(source, target);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain(target);
      }
    });

    it('returns an error when the target directory does not exist', () => {
      const source = join(tmpDir, 'source.md');
      const target = join(tmpDir, 'missing-dir', 'target.md');
      writeFileSync(source, 'skill content');

      const result = adapter.createSymlink(source, target);

      expect(isErr(result)).toBe(true);
    });
  });

  describe('removeSymlink', () => {
    it('removes an existing symlink', () => {
      const source = join(tmpDir, 'source.md');
      const target = join(tmpDir, 'target.md');
      writeFileSync(source, 'skill content');
      adapter.createSymlink(source, target);

      const result = adapter.removeSymlink(target);

      expect(isOk(result)).toBe(true);
      expect(() => lstatSync(target)).toThrow();
    });

    it('returns an error when the path does not exist', () => {
      const result = adapter.removeSymlink(join(tmpDir, 'missing.md'));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing.md');
      }
    });
  });
});
