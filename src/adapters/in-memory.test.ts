import { beforeEach, describe, expect, it } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { InMemoryConfigAdapter } from './in-memory-config.js';
import { InMemoryFileSystemAdapter } from './in-memory-fs.js';
import { InMemorySkillsAdapter } from './in-memory-skills.js';

describe('InMemoryFileSystemAdapter', () => {
  let fs: InMemoryFileSystemAdapter;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
  });

  it('writes and reads back JSON at a path', () => {
    const data = { collections: [] };

    const writeResult = fs.writeJSON('/state.json', data);
    const readResult = fs.readJSON('/state.json');

    expect(isOk(writeResult)).toBe(true);
    expect(readResult).toEqual({ ok: true, value: data });
  });

  it('errors when reading JSON at a path that was never written', () => {
    const result = fs.readJSON('/missing.json');

    expect(isErr(result)).toBe(true);
  });

  it('reset() clears files', () => {
    fs.writeJSON('/state.json', { foo: 'bar' });

    fs.reset();

    expect(isErr(fs.readJSON('/state.json'))).toBe(true);
  });

  it('lists files directly under a directory', () => {
    fs.writeFile('.cursor/commands/build.md', '# build');
    fs.writeFile('.cursor/commands/nested/skip.md', '# skip');

    expect(fs.listFiles('.cursor/commands')).toEqual({ ok: true, value: ['.cursor/commands/build.md'] });
  });

  it('listFiles returns an empty list when the directory is missing', () => {
    expect(fs.listFiles('.claude/commands')).toEqual({ ok: true, value: [] });
  });

  it('listFiles errors when the path is a file', () => {
    fs.writeFile('not-a-dir', 'nope');

    const result = fs.listFiles('not-a-dir');

    expect(isErr(result)).toBe(true);
  });

  it('seeds a skill file that findSkillFolders can discover', () => {
    const writeResult = fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    const found = fs.findSkillFolders('.cursor/skills');
    const readResult = fs.readFile('.cursor/skills/tdd/SKILL.md');

    expect(isOk(writeResult)).toBe(true);
    expect(found).toEqual({ ok: true, value: ['.cursor/skills/tdd'] });
    expect(readResult).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('finds a nested skill folder and does not treat the parent as a skill', () => {
    fs.writeFile('a/b/SKILL.md', '# nested');

    expect(fs.findSkillFolders('.')).toEqual({ ok: true, value: ['a/b'] });
  });

  it('returns an empty list when the root is missing', () => {
    expect(fs.findSkillFolders('.cursor/skills')).toEqual({ ok: true, value: [] });
  });

  it('returns an error when the root is a file', () => {
    fs.writeFile('not-a-dir', 'nope');

    const result = fs.findSkillFolders('not-a-dir');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('not-a-dir');
    }
  });

  it('reset() clears seeded skill files', () => {
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd');

    fs.reset();

    expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(fs.findSkillFolders('.cursor/skills')).toEqual({ ok: true, value: [] });
  });

  it('copyDir copies the folder tree and leaves the source files in place', () => {
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/references/notes.md', '# notes\n');

    const result = fs.copyDir('.cursor/skills/tdd', '.claude/skills/tdd');

    expect(isOk(result)).toBe(true);
    expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
    expect(fs.readFile('.claude/skills/tdd/references/notes.md')).toEqual({
      ok: true,
      value: '# notes\n',
    });
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('copyDir errors when the source folder is missing', () => {
    const result = fs.copyDir('.cursor/skills/tdd', '.claude/skills/tdd');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/not found/);
    }
  });

  it('lists every file under a folder, including nested ones', () => {
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo hi\n');
    fs.writeFile('.cursor/skills/ui/SKILL.md', '# ui\n');

    expect(fs.listAllFiles('.cursor/skills/tdd')).toEqual({
      ok: true,
      value: ['.cursor/skills/tdd/SKILL.md', '.cursor/skills/tdd/scripts/run.sh'],
    });
  });

  it('listAllFiles returns an empty list when the folder is missing', () => {
    expect(fs.listAllFiles('.cursor/skills/tdd')).toEqual({ ok: true, value: [] });
  });

  it('listAllFiles errors when the path is a file', () => {
    fs.writeFile('not-a-dir', 'nope');

    const result = fs.listAllFiles('not-a-dir');

    expect(isErr(result)).toBe(true);
  });

  it('removeDir deletes the folder tree and is ok when it is missing', () => {
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo hi\n');
    fs.writeFile('.cursor/skills/ui/SKILL.md', '# ui\n');

    expect(isOk(fs.removeDir('.cursor/skills/tdd'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/tdd/scripts/run.sh'))).toBe(true);
    expect(fs.readFile('.cursor/skills/ui/SKILL.md')).toEqual({ ok: true, value: '# ui\n' });
    expect(isOk(fs.removeDir('.cursor/skills/missing'))).toBe(true);
  });
});

describe('InMemoryConfigAdapter', () => {
  let config: InMemoryConfigAdapter;

  beforeEach(() => {
    config = new InMemoryConfigAdapter();
  });

  it('writes and reads back a config at a path', () => {
    const value = { version: '1.0', collections: { frontend: ['react-patterns'] } };

    config.write('/.contextkit.yml', value);
    const result = config.read('/.contextkit.yml');

    expect(result).toEqual({ ok: true, value });
  });

  it('errors when reading a config that was never written', () => {
    const result = config.read('/missing.yml');

    expect(isErr(result)).toBe(true);
  });

  it('validate() accepts a well-formed config', () => {
    const result = config.validate({ version: '1.0', collections: { frontend: [] } });

    expect(isOk(result)).toBe(true);
  });

  it('reset() clears stored configs', () => {
    config.write('/.contextkit.yml', { version: '1.0', collections: {} });

    config.reset();

    expect(isErr(config.read('/.contextkit.yml'))).toBe(true);
  });
});

describe('InMemorySkillsAdapter', () => {
  let skills: InMemorySkillsAdapter;

  beforeEach(() => {
    skills = new InMemorySkillsAdapter();
  });

  it('search() returns the hardcoded skill list', async () => {
    const result = await skills.search('react');

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it('browse() returns distinct all-time and trending lists', async () => {
    const allTime = await skills.browse('all-time');
    const trending = await skills.browse('trending');

    expect(isOk(allTime)).toBe(true);
    expect(isOk(trending)).toBe(true);
    if (isOk(allTime) && isOk(trending)) {
      expect(allTime.value).not.toEqual(trending.value);
      expect(allTime.value[0]?.installs).toEqual(expect.any(Number));
    }
  });

  it('install() records the skill as installed', async () => {
    await skills.install('obra/react-patterns', 'cursor');

    const installed = skills.getInstalled();
    expect(installed.some((s) => s.id === 'obra/react-patterns')).toBe(true);
  });

  it('install() records the skillId and target IDE', async () => {
    await skills.install('obra/x', 'cursor');
    await skills.install('obra/x', 'claude');

    expect(skills.getInstalls()).toEqual([
      { skillId: 'obra/x', ide: 'cursor' },
      { skillId: 'obra/x', ide: 'claude' },
    ]);
  });

  it('getInstalled() starts empty', () => {
    expect(skills.getInstalled()).toEqual([]);
  });

  it('convert() succeeds for a known IDE', async () => {
    const result = await skills.convert('obra/react-patterns', 'cursor');

    expect(isOk(result)).toBe(true);
  });

  it('reset() clears installed skills', async () => {
    await skills.install('obra/react-patterns', 'cursor');

    skills.reset();

    expect(skills.getInstalled()).toEqual([]);
    expect(skills.getInstalls()).toEqual([]);
  });
});
