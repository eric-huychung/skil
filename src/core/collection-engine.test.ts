import { beforeEach, describe, expect, it } from 'vitest';
import { isErr, isOk } from './result.js';
import { CollectionEngine, STATE_PATH } from './collection-engine.js';
import { InMemoryConfigAdapter } from '../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../adapters/in-memory-skills.js';

describe('CollectionEngine', () => {
  let fs: InMemoryFileSystemAdapter;
  let config: InMemoryConfigAdapter;
  let skills: InMemorySkillsAdapter;
  let engine: CollectionEngine;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    config = new InMemoryConfigAdapter();
    skills = new InMemorySkillsAdapter();
    engine = new CollectionEngine(fs, config, skills);
  });

  describe('create', () => {
    it('creates a collection with the given name and skills', () => {
      const result = engine.create('frontend', ['obra/react-patterns']);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.name).toBe('frontend');
        expect(result.value.skills).toEqual(['obra/react-patterns']);
      }
    });

    it('sets a createdAt timestamp and null lastUsedAt', () => {
      const result = engine.create('frontend', []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.createdAt).toBeTruthy();
        expect(new Date(result.value.createdAt).toString()).not.toBe('Invalid Date');
        expect(result.value.lastUsedAt).toBeNull();
      }
    });

    it('creating a duplicate collection returns an error', () => {
      engine.create('frontend', []);

      const result = engine.create('frontend', ['some-skill']);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe("Collection 'frontend' already exists");
      }
    });

    it('leaves state unchanged after a failed duplicate creation', () => {
      engine.create('frontend', []);

      engine.create('frontend', ['some-skill']);

      expect(engine.list()).toHaveLength(1);
      expect(engine.list()[0]?.skills).toEqual([]);
    });
  });

  describe('list', () => {
    it('returns an empty array when no collections exist', () => {
      expect(engine.list()).toEqual([]);
    });

    it('returns all created collections', () => {
      engine.create('frontend', ['react-patterns']);
      engine.create('backend', ['api-design']);

      const collections = engine.list();

      expect(collections.map((c) => c.name)).toEqual(['frontend', 'backend']);
    });
  });

  describe('persistence', () => {
    it('writes state to the state file after creating a collection', () => {
      engine.create('frontend', ['react-patterns']);

      const persisted = fs.readJSON<{ collections: Array<{ name: string }> }>(STATE_PATH);

      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.collections.map((c) => c.name)).toEqual(['frontend']);
      }
    });

    it('does not persist state when create fails validation', () => {
      engine.create('frontend', []);

      engine.create('frontend', ['dup']);

      const persisted = fs.readJSON<{ collections: unknown[] }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.collections).toHaveLength(1);
      }
    });
  });

  describe('activate', () => {
    it('activates an existing collection', () => {
      engine.create('frontend', ['obra/react-patterns']);

      const result = engine.activate('frontend');

      expect(isOk(result)).toBe(true);
    });

    it('shows the activated collection as active in status', () => {
      engine.create('frontend', ['obra/react-patterns']);

      engine.activate('frontend');

      expect(engine.status().activeCollection).toBe('frontend');
    });

    it('activating a non-existent collection returns an error', () => {
      const result = engine.activate('missing');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe("Collection 'missing' does not exist");
      }
    });
  });

  describe('loading existing state', () => {
    it('starts with an empty list when no state file exists yet', () => {
      expect(engine.list()).toEqual([]);
    });

    it('loads collections from an existing state file on construction', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z', lastUsedAt: null }],
        activeCollection: null,
        installedSkills: [],
        version: '1.0',
      });

      const loadedEngine = new CollectionEngine(fs, config, skills);

      expect(loadedEngine.list()).toEqual([
        { name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z', lastUsedAt: null },
      ]);
    });

    it('a duplicate name check considers collections loaded from the state file', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'frontend', skills: [], createdAt: '2024-01-01T00:00:00.000Z', lastUsedAt: null }],
        activeCollection: null,
        installedSkills: [],
        version: '1.0',
      });
      const loadedEngine = new CollectionEngine(fs, config, skills);

      const result = loadedEngine.create('frontend', []);

      expect(isErr(result)).toBe(true);
    });
  });
});
