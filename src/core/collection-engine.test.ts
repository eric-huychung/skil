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

    it('sets a createdAt timestamp', () => {
      const result = engine.create('frontend', []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.createdAt).toBeTruthy();
        expect(new Date(result.value.createdAt).toString()).not.toBe('Invalid Date');
      }
    });

    it('creating a duplicate collection returns an error', () => {
      engine.create('frontend', []);

      const result = engine.create('frontend', ['some-skill']);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'frontend' already exists");
      }
    });

    it('leaves state unchanged after a failed duplicate creation', () => {
      engine.create('frontend', []);

      engine.create('frontend', ['some-skill']);

      expect(engine.list()).toHaveLength(1);
      expect(engine.list()[0]?.skills).toEqual([]);
    });

    it('returns an error and does not keep the collection when persisting fails', () => {
      fs.setWriteError(new Error('Disk full'));

      const result = engine.create('frontend', []);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Disk full');
      }
      fs.setWriteError(null);
      expect(engine.list()).toEqual([]);
    });

    it('stores an optional command template', () => {
      const result = engine.create('frontend', [], 'npm run dev');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.command).toBe('npm run dev');
      }
    });

    it('leaves command undefined when not given', () => {
      const result = engine.create('frontend', []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.command).toBeUndefined();
      }
    });
  });

  describe('getCommand', () => {
    it('returns the command template for a collection that has one', () => {
      engine.create('frontend', [], 'npm run dev');

      const result = engine.getCommand('frontend');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('npm run dev');
      }
    });

    it('returns an error when the collection has no command defined', () => {
      engine.create('frontend', []);

      const result = engine.getCommand('frontend');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'frontend' has no command defined");
      }
    });

    it('returns an error when the collection does not exist', () => {
      const result = engine.getCommand('missing');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'missing' not found");
      }
    });
  });

  describe('addSkill', () => {
    it('adds a skill to an existing collection', () => {
      engine.create('frontend', ['obra/react-patterns']);

      const result = engine.addSkill('frontend', 'addyosmani/performance-review');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.skills).toEqual(['obra/react-patterns', 'addyosmani/performance-review']);
      }
    });

    it('is idempotent: adding the same skill twice keeps only one copy', () => {
      engine.create('frontend', ['obra/react-patterns']);

      engine.addSkill('frontend', 'obra/react-patterns');
      const result = engine.addSkill('frontend', 'obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.skills).toEqual(['obra/react-patterns']);
      }
    });

    it('returns an error when the collection does not exist', () => {
      const result = engine.addSkill('missing', 'obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'missing' not found");
      }
    });

    it('leaves the collection unchanged when persisting fails', () => {
      engine.create('frontend', []);
      fs.setWriteError(new Error('Disk full'));

      const result = engine.addSkill('frontend', 'obra/react-patterns');

      expect(isErr(result)).toBe(true);
      fs.setWriteError(null);
      expect(engine.list()[0]?.skills).toEqual([]);
    });
  });

  describe('removeSkill', () => {
    it('removes a skill from an existing collection', () => {
      engine.create('frontend', ['obra/react-patterns', 'addyosmani/performance-review']);

      const result = engine.removeSkill('frontend', 'obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.skills).toEqual(['addyosmani/performance-review']);
      }
    });

    it('is a no-op when removing a skill not in the collection', () => {
      engine.create('frontend', ['obra/react-patterns']);

      const result = engine.removeSkill('frontend', 'not-in-collection');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.skills).toEqual(['obra/react-patterns']);
      }
    });

    it('returns an error when the collection does not exist', () => {
      const result = engine.removeSkill('missing', 'obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'missing' not found");
      }
    });

    it('leaves the collection unchanged when persisting fails', () => {
      engine.create('frontend', ['obra/react-patterns']);
      fs.setWriteError(new Error('Disk full'));

      const result = engine.removeSkill('frontend', 'obra/react-patterns');

      expect(isErr(result)).toBe(true);
      fs.setWriteError(null);
      expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
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

      const persisted = fs.readJSON<{ commands: Array<{ name: string }> }>(STATE_PATH);

      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.commands.map((c) => c.name)).toEqual(['frontend']);
      }
    });

    it('does not persist state when create fails validation', () => {
      engine.create('frontend', []);

      engine.create('frontend', ['dup']);

      const persisted = fs.readJSON<{ commands: unknown[] }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.commands).toHaveLength(1);
      }
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

      const persisted = fs.readJSON<{ commands: Array<{ name: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.commands.map((c) => c.name)).toContain('frontend');
      }
    });

    it('returns an error when the config file cannot be read', () => {
      const result = engine.sync('.contextkit.yml');

      expect(isErr(result)).toBe(true);
    });

    it('returns an error and restores prior collections when persisting fails', () => {
      engine.create('frontend', ['old-skill']);
      config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['new-skill'], backend: ['skill-b'] } });
      fs.setWriteError(new Error('Disk full'));

      const result = engine.sync('.contextkit.yml');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Disk full');
      }
      fs.setWriteError(null);
      expect(engine.list().map((c) => c.name)).toEqual(['frontend']);
      expect(engine.list()[0]?.skills).toEqual(['old-skill']);
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
        collections: [{ name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z' }],
        installedSkills: [],
        version: '2.0',
      });

      const loadedEngine = new CollectionEngine(fs, config, skills);

      expect(loadedEngine.list()).toEqual([
        { name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z' },
      ]);
    });

    it('a duplicate name check considers collections loaded from the state file', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'frontend', skills: [], createdAt: '2024-01-01T00:00:00.000Z' }],
        installedSkills: [],
        version: '2.0',
      });
      const loadedEngine = new CollectionEngine(fs, config, skills);

      const result = loadedEngine.create('frontend', []);

      expect(isErr(result)).toBe(true);
    });

    it('loads a pre-2.0 state file that still has activeCollection/lastUsedAt, ignoring those fields', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z', lastUsedAt: null }],
        activeCollection: null,
        installedSkills: [],
        version: '1.0',
      });

      const loadedEngine = new CollectionEngine(fs, config, skills);

      expect(loadedEngine.list().map((c) => c.name)).toEqual(['frontend']);
    });
  });

  describe('export', () => {
    it('converts every skill in a collection for the target IDE', async () => {
      engine.create('frontend', ['obra/react-patterns', 'addyosmani/performance-review']);

      const result = await engine.export(['frontend'], 'cursor');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual([
          'frontend:obra/react-patterns',
          'frontend:addyosmani/performance-review',
        ]);
        expect(result.value.failures).toEqual([]);
      }
    });

    it('exports skills from multiple collections', async () => {
      engine.create('frontend', ['obra/react-patterns']);
      engine.create('backend', ['vercel-labs/security-review']);

      const result = await engine.export(['frontend', 'backend'], 'claude');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual([
          'frontend:obra/react-patterns',
          'backend:vercel-labs/security-review',
        ]);
      }
    });

    it('records a failure and continues when a single skill fails to convert', async () => {
      skills.setConvertError(new Error('skillsmith: unsupported format'));
      engine.create('frontend', ['obra/react-patterns']);

      const result = await engine.export(['frontend'], 'windsurf');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual([]);
        expect(result.value.failures).toEqual([
          expect.stringContaining('obra/react-patterns'),
        ]);
      }
    });

    it('records a failure for a non-existent collection and continues with the rest', async () => {
      engine.create('frontend', ['obra/react-patterns']);

      const result = await engine.export(['missing', 'frontend'], 'cursor');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.failures).toEqual([expect.stringContaining("Collection 'missing' not found")]);
        expect(result.value.succeeded).toEqual(['frontend:obra/react-patterns']);
      }
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

    it('returns an error and does not keep the skill recorded when persisting fails', async () => {
      fs.setWriteError(new Error('Disk full'));

      const result = await engine.install('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Disk full');
      }

      fs.setWriteError(null);
      await engine.install('obra/react-patterns');
      const persisted = fs.readJSON<{ installedSkills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.installedSkills).toHaveLength(1);
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

  describe('convert', () => {
    it('converts a skill via the skills adapter', async () => {
      const result = await engine.convert('obra/react-patterns', 'cursor');

      expect(isOk(result)).toBe(true);
    });

    it('returns an error when the skills adapter conversion fails', async () => {
      skills.setConvertError(new Error('skillsmith: unsupported format'));

      const result = await engine.convert('obra/react-patterns', 'cursor');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('unsupported format');
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

  describe('inbox', () => {
    it('starts empty and treats missing inbox on old state as []', () => {
      expect(engine.inbox()).toEqual([]);

      fs.writeJSON(STATE_PATH, {
        collections: [],
        installedSkills: [],
        version: '2.0',
      });
      const loadedEngine = new CollectionEngine(fs, config, skills);

      expect(loadedEngine.inbox()).toEqual([]);
    });

    it('persists a skill ID under state.inbox without calling install', () => {
      const result = engine.addToInbox('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(['obra/react-patterns']);
      }
      expect(engine.inbox()).toEqual(['obra/react-patterns']);

      const persisted = fs.readJSON<{ inbox: string[] }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.inbox).toEqual(['obra/react-patterns']);
      }
      expect(skills.getInstalled()).toEqual([]);
    });

    it('is idempotent: adding the same ID twice keeps one entry', () => {
      engine.addToInbox('obra/react-patterns');
      const result = engine.addToInbox('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(['obra/react-patterns']);
      }
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
    });

    it('leaves inbox unchanged when persisting an add fails', () => {
      fs.setWriteError(new Error('Disk full'));

      const result = engine.addToInbox('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      fs.setWriteError(null);
      expect(engine.inbox()).toEqual([]);
    });

    it('removes an ID from inbox and is a no-op when it is not present', () => {
      engine.addToInbox('obra/react-patterns');
      engine.addToInbox('addyosmani/performance-review');

      const removed = engine.removeFromInbox('obra/react-patterns');
      expect(isOk(removed)).toBe(true);
      if (isOk(removed)) {
        expect(removed.value).toEqual(['addyosmani/performance-review']);
      }

      const missing = engine.removeFromInbox('not-in-inbox');
      expect(isOk(missing)).toBe(true);
      if (isOk(missing)) {
        expect(missing.value).toEqual(['addyosmani/performance-review']);
      }
      expect(engine.inbox()).toEqual(['addyosmani/performance-review']);
    });

    it('rejects creating a collection named inbox', () => {
      const result = engine.create('inbox', []);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/inbox/i);
      }
      expect(engine.list()).toEqual([]);
      expect(engine.inbox()).toEqual([]);
    });
  });

  describe('fileToCollection', () => {
    it('moves an inbox ID into an existing collection without calling install', () => {
      engine.create('frontend', []);
      engine.addToInbox('obra/react-patterns');

      const result = engine.fileToCollection('obra/react-patterns', 'frontend');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.skills).toEqual(['obra/react-patterns']);
      }
      expect(engine.inbox()).toEqual([]);
      expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
      expect(skills.getInstalled()).toEqual([]);
    });

    it('drops the ID from inbox even if the collection already has it', () => {
      engine.create('frontend', ['obra/react-patterns']);
      engine.addToInbox('obra/react-patterns');

      const result = engine.fileToCollection('obra/react-patterns', 'frontend');

      expect(isOk(result)).toBe(true);
      expect(engine.inbox()).toEqual([]);
      expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
    });

    it('returns an error and leaves state unchanged when the collection is missing', () => {
      engine.addToInbox('obra/react-patterns');

      const result = engine.fileToCollection('obra/react-patterns', 'frontend');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'frontend' not found");
      }
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
    });

    it('returns an error and leaves state unchanged when the ID is not in inbox', () => {
      engine.create('frontend', []);

      const result = engine.fileToCollection('obra/react-patterns', 'frontend');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/inbox/i);
      }
      expect(engine.list()[0]?.skills).toEqual([]);
      expect(engine.inbox()).toEqual([]);
    });

    it('rolls inbox and collection back when persisting fails', () => {
      engine.create('frontend', []);
      engine.addToInbox('obra/react-patterns');
      fs.setWriteError(new Error('Disk full'));

      const result = engine.fileToCollection('obra/react-patterns', 'frontend');

      expect(isErr(result)).toBe(true);
      fs.setWriteError(null);
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
      expect(engine.list()[0]?.skills).toEqual([]);
    });
  });

  describe('delete', () => {
    it('removes a collection, including the last one', () => {
      engine.create('frontend', ['obra/react-patterns']);
      engine.create('backend', []);

      const first = engine.delete('frontend');
      expect(isOk(first)).toBe(true);
      expect(engine.list().map((c) => c.name)).toEqual(['backend']);

      const last = engine.delete('backend');
      expect(isOk(last)).toBe(true);
      expect(engine.list()).toEqual([]);
    });

    it('returns an error when the collection does not exist', () => {
      const result = engine.delete('missing');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Collection 'missing' not found");
      }
    });

    it('leaves collections unchanged when persisting fails', () => {
      engine.create('frontend', []);
      fs.setWriteError(new Error('Disk full'));

      const result = engine.delete('frontend');

      expect(isErr(result)).toBe(true);
      fs.setWriteError(null);
      expect(engine.list().map((c) => c.name)).toEqual(['frontend']);
    });
  });

  describe('scan', () => {
    it('adds a scanned skill to the catalog and inbox', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).toEqual(['tdd']);
        expect(result.value.gone).toEqual([]);
        expect(result.value.changed).toEqual([]);
      }
      expect(engine.inbox()).toEqual(['tdd']);
      const record = engine.skills().find((s) => s.id === 'tdd');
      expect(record).toEqual(
        expect.objectContaining({
          id: 'tdd',
          paths: ['.cursor/skills/tdd'],
          source: 'local',
        })
      );
      expect(record?.hash).toBeTruthy();
      expect(skills.getInstalled()).toEqual([]);
    });

    it('uses a nested path relative to the skills root as the catalog id', () => {
      fs.writeFile('.cursor/skills/ui/styling/SKILL.md', '# styling\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).toEqual(['ui/styling']);
      }
      expect(engine.inbox()).toEqual(['ui/styling']);
      expect(engine.skills()[0]?.id).toBe('ui/styling');
    });

    it('merges the same id under two IDE trees into one catalog row', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');

      engine.scan();

      expect(engine.skills()).toEqual([
        expect.objectContaining({
          id: 'tdd',
          paths: ['.cursor/skills/tdd', '.claude/skills/tdd'],
        }),
      ]);
      expect(engine.inbox()).toEqual(['tdd']);
    });

    it('keeps a filed command map on re-scan and reports gone ids', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.fileToCollection('tdd', 'build');

      const persisted = fs.readJSON(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (!isOk(persisted)) {
        return;
      }

      fs.reset();
      fs.writeJSON(STATE_PATH, persisted.value);
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const reloaded = new CollectionEngine(fs, config, skills);
      const result = reloaded.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.gone).toEqual(['design']);
        expect(result.value.added).toEqual([]);
      }
      expect(reloaded.list()[0]?.skills).toEqual(['tdd']);
      expect(reloaded.inbox()).toEqual([]);
      expect(reloaded.skills().map((s) => s.id)).toEqual(['tdd']);
    });

    it('succeeds when skill trees are missing and ignores commands/ files', () => {
      fs.writeFile('.cursor/commands/build.md', '# not a skill');

      const result = engine.scan();

      expect(result).toEqual({ ok: true, value: { added: [], gone: [], changed: [] } });
      expect(engine.skills()).toEqual([]);
      expect(engine.list()).toEqual([]);
      expect(skills.getInstalled()).toEqual([]);
    });

    it('reports a hash change without dropping the catalog row', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd changed\n');
      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.changed).toEqual(['tdd']);
        expect(result.value.added).toEqual([]);
        expect(result.value.gone).toEqual([]);
      }
      expect(engine.skills()).toHaveLength(1);
      expect(engine.inbox()).toEqual(['tdd']);
    });

    it('loads v3 collections as commands and missing skills as []', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' }],
        installedSkills: [],
        version: '3.0',
      });
      const loaded = new CollectionEngine(fs, config, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' },
      ]);
      expect(loaded.skills()).toEqual([]);
    });
  });
});
