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

    it('creates a symlink for each skill in each detected IDE directory', () => {
      fs.setDetectedIDEs([
        { name: 'cursor', path: '/project/.agents/skills' },
        { name: 'claude', path: '/project/.claude/skills' },
      ]);
      engine.create('frontend', ['obra/react-patterns']);

      engine.activate('frontend');

      const symlinks = fs.getSymlinks();
      expect(symlinks.get('/project/.agents/skills/obra/react-patterns')).toBe(
        '.contextkit/skills/obra/react-patterns'
      );
      expect(symlinks.get('/project/.claude/skills/obra/react-patterns')).toBe(
        '.contextkit/skills/obra/react-patterns'
      );
    });

    it('creates a symlink for every skill in the collection', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);
      engine.create('frontend', ['skill-a', 'skill-b']);

      engine.activate('frontend');

      const symlinks = fs.getSymlinks();
      expect(symlinks.has('/project/.agents/skills/skill-a')).toBe(true);
      expect(symlinks.has('/project/.agents/skills/skill-b')).toBe(true);
    });

    it('removes the previously active collection symlinks when activating another', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);
      engine.create('frontend', ['skill-a']);
      engine.create('backend', ['skill-b']);
      engine.activate('frontend');

      engine.activate('backend');

      const symlinks = fs.getSymlinks();
      expect(symlinks.has('/project/.agents/skills/skill-a')).toBe(false);
      expect(symlinks.has('/project/.agents/skills/skill-b')).toBe(true);
    });

    it('returns an error when a symlink target already exists', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);
      engine.create('frontend', ['skill-a']);
      fs.setConflict('/project/.agents/skills/skill-a');

      const result = engine.activate('frontend');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('/project/.agents/skills/skill-a');
      }
    });

    it('warns and skips a skill whose source directory is missing', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);
      engine.create('frontend', ['skill-a', 'skill-b']);
      fs.setMissing('.contextkit/skills/skill-a');

      const result = engine.activate('frontend');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.warnings).toEqual(
          expect.arrayContaining([expect.stringContaining('skill-a')])
        );
      }
      const symlinks = fs.getSymlinks();
      expect(symlinks.has('/project/.agents/skills/skill-a')).toBe(false);
      expect(symlinks.has('/project/.agents/skills/skill-b')).toBe(true);
    });

    it('does not warn when every skill in the collection is present', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);
      engine.create('frontend', ['skill-a']);

      const result = engine.activate('frontend');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.warnings).toEqual([]);
      }
    });

    it('shows the newly activated collection as active, not the old one', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);
      engine.create('frontend', ['skill-a']);
      engine.create('backend', ['skill-b']);
      engine.activate('frontend');

      engine.activate('backend');

      expect(engine.status().activeCollection).toBe('backend');
    });
  });

  describe('deactivate', () => {
    it('deactivates the active collection', () => {
      engine.create('frontend', []);
      engine.activate('frontend');

      const result = engine.deactivate();

      expect(isOk(result)).toBe(true);
    });

    it('shows no active collection in status after deactivating', () => {
      engine.create('frontend', []);
      engine.activate('frontend');

      engine.deactivate();

      expect(engine.status().activeCollection).toBeNull();
    });

    it('is idempotent: deactivating when nothing is active still succeeds', () => {
      const result = engine.deactivate();

      expect(isOk(result)).toBe(true);
      expect(engine.status().activeCollection).toBeNull();
    });

    it('removes symlinks for every skill in every detected IDE directory', () => {
      fs.setDetectedIDEs([
        { name: 'cursor', path: '/project/.agents/skills' },
        { name: 'claude', path: '/project/.claude/skills' },
      ]);
      engine.create('frontend', ['skill-a', 'skill-b']);
      engine.activate('frontend');

      engine.deactivate();

      const symlinks = fs.getSymlinks();
      expect(symlinks.has('/project/.agents/skills/skill-a')).toBe(false);
      expect(symlinks.has('/project/.agents/skills/skill-b')).toBe(false);
      expect(symlinks.has('/project/.claude/skills/skill-a')).toBe(false);
      expect(symlinks.has('/project/.claude/skills/skill-b')).toBe(false);
    });

    it('does not attempt symlink removal when nothing is active', () => {
      fs.setDetectedIDEs([{ name: 'cursor', path: '/project/.agents/skills' }]);

      const result = engine.deactivate();

      expect(isOk(result)).toBe(true);
    });
  });

  describe('sync', () => {
    it('adds collections from the config file to local state', () => {
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['skill-a'] } });

      const result = engine.sync('.contextkit.yml');

      expect(isOk(result)).toBe(true);
      const frontend = engine.list().find((c) => c.name === 'frontend');
      expect(frontend?.skills).toEqual(['skill-a']);
    });

    it('preserves local collections not present in the config file', () => {
      engine.create('local-only', ['skill-x']);
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['skill-a'] } });

      engine.sync('.contextkit.yml');

      expect(engine.list().map((c) => c.name)).toEqual(expect.arrayContaining(['local-only', 'frontend']));
    });

    it('overwrites an existing local collection with the same name from config', () => {
      engine.create('frontend', ['old-skill']);
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['new-skill'] } });

      engine.sync('.contextkit.yml');

      const frontend = engine.list().find((c) => c.name === 'frontend');
      expect(frontend?.skills).toEqual(['new-skill']);
    });

    it('writes the merged state to the state file', () => {
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['skill-a'] } });

      engine.sync('.contextkit.yml');

      const persisted = fs.readJSON<{ collections: Array<{ name: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.collections.map((c) => c.name)).toContain('frontend');
      }
    });

    it('returns an error when the config file cannot be read', () => {
      const result = engine.sync('.contextkit.yml');

      expect(isErr(result)).toBe(true);
    });

    it('warns about local collections not present in the config file', () => {
      engine.create('local-only', ['skill-x']);
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['skill-a'] } });

      const result = engine.sync('.contextkit.yml');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.warnings).toEqual(
          expect.arrayContaining([expect.stringContaining('local-only')])
        );
      }
    });

    it('does not warn about collections present in both local state and config', () => {
      engine.create('frontend', ['old-skill']);
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['new-skill'] } });

      const result = engine.sync('.contextkit.yml');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.warnings).toEqual([]);
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

  describe('install', () => {
    it('installs a skill via the skills adapter and returns it', async () => {
      const result = await engine.install('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.id).toBe('obra/react-patterns');
        expect(result.value.source).toBe('skills.sh');
        expect(result.value.installedAt).toBeTruthy();
      }
    });

    it('records the installed skill in state', async () => {
      await engine.install('obra/react-patterns');

      const persisted = fs.readJSON<{ installedSkills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.installedSkills.map((s) => s.id)).toContain('obra/react-patterns');
      }
    });

    it('returns an error when the skills adapter fails to install', async () => {
      skills.setInstallError(new Error('npx: command failed'));

      const result = await engine.install('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('command failed');
      }
    });

    it('does not record the skill in state when install fails', async () => {
      engine.create('frontend', []);
      skills.setInstallError(new Error('npx: command failed'));

      await engine.install('obra/react-patterns');

      const persisted = fs.readJSON<{ installedSkills: unknown[] }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.installedSkills).toEqual([]);
      }
    });
  });

  describe('search', () => {
    it('returns skills matching the query from the skills adapter', async () => {
      const result = await engine.search('react');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.map((s) => s.id)).toEqual(
          expect.arrayContaining(['obra/react-patterns'])
        );
      }
    });

    it('returns an error when the skills adapter search fails', async () => {
      skills.setSearchError(new Error('network unreachable'));

      const result = await engine.search('react');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('network unreachable');
      }
    });
  });

  describe('loading installed skills on startup', () => {
    it('merges skills already installed by external tooling into state', async () => {
      skills.seedInstalled([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '2024-01-01T00:00:00.000Z' }]);
      const loadedEngine = new CollectionEngine(fs, config, skills);

      await loadedEngine.install('addyosmani/performance-review');

      const persisted = fs.readJSON<{ installedSkills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.installedSkills.map((s) => s.id)).toEqual(
          expect.arrayContaining(['obra/react-patterns', 'addyosmani/performance-review'])
        );
      }
    });
  });
});
