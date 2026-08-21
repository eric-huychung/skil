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
    await skills.install('obra/react-patterns');

    const installed = skills.getInstalled();
    expect(installed.some((s) => s.id === 'obra/react-patterns')).toBe(true);
  });

  it('getInstalled() starts empty', () => {
    expect(skills.getInstalled()).toEqual([]);
  });

  it('convert() succeeds for a known IDE', async () => {
    const result = await skills.convert('obra/react-patterns', 'cursor');

    expect(isOk(result)).toBe(true);
  });

  it('reset() clears installed skills', async () => {
    await skills.install('obra/react-patterns');

    skills.reset();

    expect(skills.getInstalled()).toEqual([]);
  });
});
