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

  describe('findSkillFolders', () => {
    beforeEach(() => {
      adapter = new RealFileSystemAdapter(tmpDir);
    });

    it('finds a nested skill folder and does not treat the parent as a skill', () => {
      mkdirSync(join(tmpDir, 'a', 'b'), { recursive: true });
      writeFileSync(join(tmpDir, 'a', 'b', 'SKILL.md'), '# nested');

      const result = adapter.findSkillFolders('.');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(['a/b']);
      }
    });

    it('treats a parent as a skill only when it has its own SKILL.md', () => {
      mkdirSync(join(tmpDir, 'a', 'b'), { recursive: true });
      writeFileSync(join(tmpDir, 'a', 'SKILL.md'), '# parent');
      writeFileSync(join(tmpDir, 'a', 'b', 'SKILL.md'), '# nested');

      const result = adapter.findSkillFolders('.');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(['a', 'a/b']);
      }
    });

    it('returns an empty list when the root is missing', () => {
      const result = adapter.findSkillFolders('.cursor/skills');

      expect(result).toEqual({ ok: true, value: [] });
    });

    it('returns an error when the root is a file', () => {
      const filePath = join(tmpDir, 'not-a-dir');
      writeFileSync(filePath, 'nope');

      const result = adapter.findSkillFolders('not-a-dir');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('not-a-dir');
      }
    });

    it('returns paths relative to the adapter root when walking an IDE skills dir', () => {
      mkdirSync(join(tmpDir, '.cursor', 'skills', 'tdd'), { recursive: true });
      writeFileSync(join(tmpDir, '.cursor', 'skills', 'tdd', 'SKILL.md'), '# tdd');

      const result = adapter.findSkillFolders('.cursor/skills');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(['.cursor/skills/tdd']);
      }
    });

    it('walks .claude, .windsurf, and .agents skill trees the same way as .cursor', () => {
      for (const tree of ['.claude', '.windsurf', '.agents'] as const) {
        mkdirSync(join(tmpDir, tree, 'skills', 'ui'), { recursive: true });
        writeFileSync(join(tmpDir, tree, 'skills', 'ui', 'SKILL.md'), `# ${tree}`);
      }

      adapter = new RealFileSystemAdapter(tmpDir);

      expect(adapter.findSkillFolders('.claude/skills')).toEqual({
        ok: true,
        value: ['.claude/skills/ui'],
      });
      expect(adapter.findSkillFolders('.windsurf/skills')).toEqual({
        ok: true,
        value: ['.windsurf/skills/ui'],
      });
      expect(adapter.findSkillFolders('.agents/skills')).toEqual({
        ok: true,
        value: ['.agents/skills/ui'],
      });
    });
  });

  describe('readFile / writeFile', () => {
    beforeEach(() => {
      adapter = new RealFileSystemAdapter(tmpDir);
    });

    it('writes and reads a relative path under the adapter root', () => {
      const writeResult = adapter.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      const readResult = adapter.readFile('.cursor/skills/tdd/SKILL.md');

      expect(isOk(writeResult)).toBe(true);
      expect(readResult).toEqual({ ok: true, value: '# tdd\n' });
      expect(readFileSync(join(tmpDir, '.cursor', 'skills', 'tdd', 'SKILL.md'), 'utf-8')).toBe('# tdd\n');
    });

    it('does not prefix an absolute path with the root', () => {
      const outside = mkdtempSync(join(tmpdir(), 'contextkit-outside-'));
      try {
        const absolutePath = join(outside, 'SKILL.md');
        adapter.writeFile(absolutePath, '# outside\n');

        expect(adapter.readFile(absolutePath)).toEqual({ ok: true, value: '# outside\n' });
        expect(readdirSync(tmpDir)).toEqual([]);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('returns an error when the file does not exist', () => {
      const result = adapter.readFile('.cursor/skills/tdd/SKILL.md');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('SKILL.md');
      }
    });
  });

  describe('copyDir', () => {
    beforeEach(() => {
      adapter = new RealFileSystemAdapter(tmpDir);
    });

    it('copies the folder tree under the adapter root', () => {
      mkdirSync(join(tmpDir, '.cursor', 'skills', 'tdd', 'references'), { recursive: true });
      writeFileSync(join(tmpDir, '.cursor', 'skills', 'tdd', 'SKILL.md'), '# tdd\n');
      writeFileSync(join(tmpDir, '.cursor', 'skills', 'tdd', 'references', 'notes.md'), '# notes\n');

      const result = adapter.copyDir('.cursor/skills/tdd', '.claude/skills/tdd');

      expect(isOk(result)).toBe(true);
      expect(readFileSync(join(tmpDir, '.claude', 'skills', 'tdd', 'SKILL.md'), 'utf-8')).toBe('# tdd\n');
      expect(readFileSync(join(tmpDir, '.claude', 'skills', 'tdd', 'references', 'notes.md'), 'utf-8')).toBe(
        '# notes\n'
      );
      expect(readFileSync(join(tmpDir, '.cursor', 'skills', 'tdd', 'SKILL.md'), 'utf-8')).toBe('# tdd\n');
    });
  });

  describe('listFiles', () => {
    beforeEach(() => {
      adapter = new RealFileSystemAdapter(tmpDir);
    });

    it('lists files directly under a rooted directory', () => {
      mkdirSync(join(tmpDir, '.cursor', 'commands'), { recursive: true });
      writeFileSync(join(tmpDir, '.cursor', 'commands', 'build.md'), '# build\n');
      mkdirSync(join(tmpDir, '.cursor', 'commands', 'nested'), { recursive: true });
      writeFileSync(join(tmpDir, '.cursor', 'commands', 'nested', 'skip.md'), '# skip\n');

      expect(adapter.listFiles('.cursor/commands')).toEqual({
        ok: true,
        value: ['.cursor/commands/build.md'],
      });
    });

    it('returns an empty list when the directory is missing', () => {
      expect(adapter.listFiles('.claude/commands')).toEqual({ ok: true, value: [] });
    });
  });
});
