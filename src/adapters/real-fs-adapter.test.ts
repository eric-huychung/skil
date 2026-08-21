import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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

  describe('readJSON', () => {
    it('reads and parses a valid JSON file', () => {
      const path = join(tmpDir, 'data.json');
      writeFileSync(path, JSON.stringify({ name: 'frontend' }));

      const result = adapter.readJSON<{ name: string }>(path);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ name: 'frontend' });
      }
    });

    it('returns an error when the file does not exist', () => {
      const result = adapter.readJSON(join(tmpDir, 'missing.json'));

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('missing.json');
      }
    });

    it('returns an error when the file contains malformed JSON', () => {
      const path = join(tmpDir, 'bad.json');
      writeFileSync(path, '{ not valid json');

      const result = adapter.readJSON(path);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain(path);
      }
    });
  });

  describe('writeJSON', () => {
    it('writes data as JSON to the target path', () => {
      const path = join(tmpDir, 'state.json');

      const result = adapter.writeJSON(path, { collections: [] });

      expect(isOk(result)).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ collections: [] });
    });

    it('creates the parent directory if it does not exist', () => {
      const path = join(tmpDir, '.contextkit', 'state.json');

      const result = adapter.writeJSON(path, { collections: [] });

      expect(isOk(result)).toBe(true);
      expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ collections: [] });
    });

    it('writes atomically, leaving no temp file behind', () => {
      const path = join(tmpDir, 'state.json');

      adapter.writeJSON(path, { collections: [] });

      const entries = readdirSync(tmpDir);
      expect(entries).toEqual(['state.json']);
    });

    it('overwrites an existing file with new content', () => {
      const path = join(tmpDir, 'state.json');
      adapter.writeJSON(path, { collections: [] });

      adapter.writeJSON(path, { collections: ['frontend'] });

      expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ collections: ['frontend'] });
    });
  });

  describe('project root', () => {
    it('resolves relative paths under the given root, not process.cwd()', () => {
      adapter = new RealFileSystemAdapter(tmpDir);

      const result = adapter.writeJSON('.contextkit/state.json', { collections: [] });

      expect(isOk(result)).toBe(true);
      expect(JSON.parse(readFileSync(join(tmpDir, '.contextkit', 'state.json'), 'utf-8'))).toEqual({
        collections: [],
      });
    });

    it('reads a relative path from under the given root', () => {
      adapter = new RealFileSystemAdapter(tmpDir);
      mkdirSync(join(tmpDir, '.contextkit'), { recursive: true });
      writeFileSync(join(tmpDir, '.contextkit', 'state.json'), JSON.stringify({ collections: ['frontend'] }));

      const result = adapter.readJSON<{ collections: string[] }>('.contextkit/state.json');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ collections: ['frontend'] });
      }
    });

    it('does not prefix an absolute path with the root', () => {
      const outside = mkdtempSync(join(tmpdir(), 'contextkit-outside-'));
      try {
        const absolutePath = join(outside, 'state.json');
        adapter = new RealFileSystemAdapter(tmpDir);

        adapter.writeJSON(absolutePath, { collections: [] });

        expect(JSON.parse(readFileSync(absolutePath, 'utf-8'))).toEqual({ collections: [] });
        expect(readdirSync(tmpDir)).toEqual([]);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });
});
