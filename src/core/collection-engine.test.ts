import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { isErr, isOk } from './result.js';
import { CollectionEngine, STATE_PATH } from './collection-engine.js';
import { InMemoryFileSystemAdapter } from '../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../adapters/in-memory-skills.js';
import { InMemoryUsageCollector } from '../adapters/in-memory-usage.js';
import { RealFileSystemAdapter } from '../adapters/real-fs-adapter.js';
import type { IDE } from '../types/index.js';

/**
 * Mimics `npx skills add --agent universal` (vercel-labs/skills): dumps
 * into `.agents/skills/<short-name>`, where the folder name is the last
 * id segment. The engine relocates and mirrors from there.
 */
class NpxLayoutSkillsAdapter extends InMemorySkillsAdapter {
  skillBody = '';

  constructor(private readonly disk: InMemoryFileSystemAdapter) {
    super();
  }

  override async install(skillId: string, opts?: { cwd?: string }) {
    const result = await super.install(skillId, opts);
    if (!isOk(result)) {
      return result;
    }
    const shortName = skillId.split('/').filter(Boolean).at(-1) ?? skillId;
    const prefix = opts?.cwd ? `${opts.cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/` : '';
    this.disk.writeFile(
      `${prefix}.agents/skills/${shortName}/SKILL.md`,
      this.skillBody || `# ${shortName}\n`
    );
    return result;
  }
}

describe('CollectionEngine', () => {
  let fs: InMemoryFileSystemAdapter;
  let skills: InMemorySkillsAdapter;
  let engine: CollectionEngine;

  beforeEach(() => {
    fs = new InMemoryFileSystemAdapter();
    skills = new InMemorySkillsAdapter();
    engine = new CollectionEngine(fs, skills);
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

    it('strips a leading slash so /build is stored as build', () => {
      const result = engine.create('/build', []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.name).toBe('build');
      }
      expect(engine.list().map((c) => c.name)).toEqual(['build']);
    });

    it('creating a duplicate collection returns an error', () => {
      engine.create('frontend', []);

      const result = engine.create('frontend', ['some-skill']);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Command 'frontend' already exists");
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

    it('leaves command undefined when not given', () => {
      const result = engine.create('frontend', []);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.command).toBeUndefined();
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
        expect(result.error.message).toContain("Command 'missing' not found");
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
        expect(result.error.message).toContain("Command 'missing' not found");
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
    it('writes a new project to .skil/state.json', () => {
      engine.create('frontend', ['react-patterns']);

      const persisted = fs.readJSON<{ commands: Array<{ name: string }> }>('.skil/state.json');

      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.commands.map((c) => c.name)).toEqual(['frontend']);
      }
    });

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

    it('persists v6 skills[] with no membership', () => {
      engine.create('build', ['tdd', 'design']);

      const persisted = fs.readJSON<{
        version: string;
        commands: Array<{ name: string; skills?: string[]; membership?: unknown }>;
      }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.version).toBe('6.0');
        expect(persisted.value.commands).toEqual([
          expect.objectContaining({ name: 'build', skills: ['tdd', 'design'] }),
        ]);
        expect(persisted.value.commands[0]?.membership).toBeUndefined();
      }
      expect(engine.list()).toEqual([expect.objectContaining({ name: 'build', skills: ['tdd', 'design'] })]);
    });

    it('loads v5 membership as a union with cursor first', () => {
      fs.writeJSON(STATE_PATH, {
        commands: [
          {
            name: 'build',
            membership: { cursor: ['tdd'], claude: ['tdd', 'design'], agents: ['ui'] },
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        skills: [],
        version: '5.0',
      });
      const loaded = new CollectionEngine(fs, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd', 'design', 'ui'], createdAt: '2024-01-01T00:00:00.000Z', enabled: false },
      ]);
      const persisted = fs.readJSON<{ version: string; commands: Array<{ membership?: unknown }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.version).toBe('5.0');
        expect(persisted.value.commands[0]?.membership).toEqual({
          cursor: ['tdd'],
          claude: ['tdd', 'design'],
          agents: ['ui'],
        });
      }
    });
  });

  describe('loading existing state', () => {
    it('starts with an empty list when no state file exists yet', () => {
      expect(engine.list()).toEqual([]);
    });

    it('throws when only leftover .contextkit/state.json exists', () => {
      fs.writeJSON('.contextkit/state.json', {
        commands: [{ name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z' }],
        skills: [],
        version: '4.0',
      });

      expect(() => new CollectionEngine(fs, skills)).toThrow(
        'Found leftover .contextkit/state.json. Move it to .skil/state.json and retry.'
      );
    });

    it('loads .skil/state.json and ignores leftover .contextkit/state.json', () => {
      fs.writeJSON(STATE_PATH, {
        commands: [{ name: 'new-map', skills: [], createdAt: '2024-01-02T00:00:00.000Z' }],
        version: '4.0',
      });
      fs.writeJSON('.contextkit/state.json', {
        commands: [{ name: 'old-map', skills: [], createdAt: '2024-01-01T00:00:00.000Z' }],
        version: '4.0',
      });

      const loadedEngine = new CollectionEngine(fs, skills);

      expect(loadedEngine.list().map((c) => c.name)).toEqual(['new-map']);
    });

    it('loads collections from an existing state file on construction', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z' }],
        installedSkills: [],
        version: '2.0',
      });

      const loadedEngine = new CollectionEngine(fs, skills);

      expect(loadedEngine.list()).toEqual([
        { name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z', enabled: false },
      ]);
    });

    it('a duplicate name check considers collections loaded from the state file', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'frontend', skills: [], createdAt: '2024-01-01T00:00:00.000Z' }],
        installedSkills: [],
        version: '2.0',
      });
      const loadedEngine = new CollectionEngine(fs, skills);

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

      const loadedEngine = new CollectionEngine(fs, skills);

      expect(loadedEngine.list().map((c) => c.name)).toEqual(['frontend']);
    });
  });

  describe('install', () => {
    it('installs via the skills adapter and records both live paths on the catalog', async () => {
      const result = await engine.install('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.id).toBe('obra/react-patterns');
        expect(result.value.source).toBe('skills.sh');
        expect(result.value.paths).toEqual([
          '.agents/skills/obra/react-patterns',
          '.claude/skills/obra/react-patterns',
        ]);
        expect(engine.skills()).toEqual([result.value]);
      }
      expect(engine.list()).toEqual([]);
    });

    it('writes both live folders with one npx run and removes the short-name dump', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      const result = await engine.install('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      expect(isOk(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md'))).toBe(true);
      expect(isOk(fs.readFile('.claude/skills/obra/react-patterns/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.agents/skills/react-patterns/SKILL.md'))).toBe(true);
      expect(npx.getInstalls()).toEqual([{ skillId: 'obra/react-patterns' }]);
    });

    it('never creates a leftover skill root', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      await engine.install('obra/react-patterns');

      for (const root of ['.cursor', '.codex', '.github', '.windsurf']) {
        expect(isErr(fs.readFile(`${root}/skills/obra/react-patterns/SKILL.md`))).toBe(true);
      }
    });

    it('stamps originHash from the copied SKILL.md and keeps it after the file is edited', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      const result = await engine.install('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.originHash).toBe(result.value.hash);
      expect(result.value.originHash).toMatch(/^[a-f0-9]{64}$/);

      fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();

      const row = engine.skills()[0];
      expect(row?.originHash).toBe(result.value.originHash);
      expect(row?.hash).not.toBe(row?.originHash);
    });

    it('persists the catalog deploy and does not require the id to be filed', async () => {
      await engine.install('obra/react-patterns');

      expect(engine.skills().map((s) => s.id)).toEqual(['obra/react-patterns']);
      const persisted = fs.readJSON<{ skills: Array<{ id: string; paths: string[] }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toEqual([
          expect.objectContaining({
            id: 'obra/react-patterns',
            source: 'skills.sh',
            paths: ['.agents/skills/obra/react-patterns', '.claude/skills/obra/react-patterns'],
          }),
        ]);
      }
    });

    it('keeps source local when installing an already-scanned skill', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      const result = await engine.install('tdd');

      expect(isOk(result)).toBe(true);
      const record = engine.skills().find((s) => s.id === 'tdd');
      expect(record?.source).toBe('local');
      expect(record?.paths).toEqual(['.cursor/skills/tdd', '.agents/skills/tdd', '.claude/skills/tdd']);
    });

    it('installing twice keeps one catalog row and one live pair', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      await engine.install('obra/x');
      await engine.install('obra/x');

      expect(engine.skills()).toHaveLength(1);
      expect(engine.skills()[0]?.paths).toEqual([
        '.agents/skills/obra/x',
        '.claude/skills/obra/x',
      ]);
    });

    it('returns an error when the skills adapter fails to install', async () => {
      skills.setInstallError(new Error('npx: command failed'));

      const result = await engine.install('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('command failed');
      }
    });

    it('does not persist a deploy when the adapter fails', async () => {
      engine.create('frontend', []);
      skills.setInstallError(new Error('npx: command failed'));

      await engine.install('obra/react-patterns');

      expect(engine.skills()).toEqual([]);
      const persisted = fs.readJSON<{ skills: unknown[] }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toEqual([]);
      }
      expect(skills.getInstalls()).toEqual([]);
    });

    it('returns an error and does not keep the deploy when persisting fails', async () => {
      fs.setWriteError(new Error('Disk full'));

      const result = await engine.install('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Disk full');
      }
      expect(engine.skills()).toEqual([]);

      fs.setWriteError(null);
      await engine.install('obra/react-patterns');
      const persisted = fs.readJSON<{ skills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toHaveLength(1);
        expect(persisted.value.skills[0]?.id).toBe('obra/react-patterns');
      }
    });

    it('installs into dest and keeps catalog state on the current workspace', async () => {
      const result = await engine.install('obra/react-patterns', { dest: '/tmp/other-project' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paths).toEqual([
          '/tmp/other-project/.agents/skills/obra/react-patterns',
          '/tmp/other-project/.claude/skills/obra/react-patterns',
        ]);
      }
      expect(skills.getInstalls()).toEqual([
        { skillId: 'obra/react-patterns', cwd: '/tmp/other-project' },
      ]);
      const persisted = fs.readJSON<{ skills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toHaveLength(1);
      }
    });
  });

  describe('setSkillEnabled', () => {
    it('errors for an id that is not in the catalog', async () => {
      const result = await engine.setSkillEnabled('nope', false);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('not in the catalog');
      }
    });

    it('off moves both live folders to parked and the row stays', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/x');

      const result = await engine.setSkillEnabled('obra/x', false);

      expect(isOk(result)).toBe(true);
      expect(isErr(fs.readFile('.agents/skills/obra/x/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.claude/skills/obra/x/SKILL.md'))).toBe(true);
      expect(isOk(fs.readFile('.skil/parked/skills/obra/x/SKILL.md'))).toBe(true);
      expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/x']);
      if (isOk(result)) {
        expect(result.value.paths).toEqual(['.skil/parked/skills/obra/x']);
      }
    });

    it('off is a no-op when the skill is already off', async () => {
      fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      const result = await engine.setSkillEnabled('tdd', false);

      expect(isOk(result)).toBe(true);
      expect(isOk(fs.readFile('.skil/parked/skills/tdd/SKILL.md'))).toBe(true);
    });

    it('never writes a leftover root when parking', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/x');

      await engine.setSkillEnabled('obra/x', false);

      for (const root of ['.cursor', '.codex', '.github', '.windsurf']) {
        expect(isErr(fs.readFile(`${root}/skills/obra/x/SKILL.md`))).toBe(true);
      }
    });

    it('on restores both live folders from the parked copy', async () => {
      fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      const result = await engine.setSkillEnabled('tdd', true);

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.agents/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      if (isOk(result)) {
        expect(result.value.paths).toEqual(
          expect.arrayContaining(['.agents/skills/tdd', '.claude/skills/tdd'])
        );
      }
    });

    it('on is a no-op when the skill is already on', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      const installed = await engine.install('obra/x');

      const result = await engine.setSkillEnabled('obra/x', true);

      expect(isOk(result)).toBe(true);
      if (isOk(result) && isOk(installed)) {
        expect(result.value).toEqual(installed.value);
      }
    });

    it('on re-fetches from the market when parked is gone and source is skills.sh', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/x');
      await engine.setSkillEnabled('obra/x', false);
      fs.removeDir('.skil/parked/skills/obra/x');

      const result = await engine.setSkillEnabled('obra/x', true);

      expect(isOk(result)).toBe(true);
      expect(isOk(fs.readFile('.agents/skills/obra/x/SKILL.md'))).toBe(true);
      expect(isOk(fs.readFile('.claude/skills/obra/x/SKILL.md'))).toBe(true);
      expect(npx.getInstalls()).toEqual([{ skillId: 'obra/x' }, { skillId: 'obra/x' }]);
    });

    it('on errors when parked is gone and source is local, and leaves the row alone', async () => {
      fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      fs.removeDir('.skil/parked/skills/tdd');

      const result = await engine.setSkillEnabled('tdd', true);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('no parked copy');
      }
      expect(engine.skills()).toEqual([
        expect.objectContaining({ id: 'tdd', paths: ['.skil/parked/skills/tdd'] }),
      ]);
    });

    it('on self-heals a partial live copy without touching a stale parked folder', async () => {
      fs.writeFile('.agents/skills/tdd/SKILL.md', '# fresh\n');
      fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# stale\n');
      engine.scan();

      const result = await engine.setSkillEnabled('tdd', true);

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# fresh\n' });
      expect(fs.readFile('.skil/parked/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# stale\n' });
    });

    it('never writes a leftover root when restoring', async () => {
      fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      await engine.setSkillEnabled('tdd', true);

      for (const root of ['.cursor', '.codex', '.github', '.windsurf']) {
        expect(isErr(fs.readFile(`${root}/skills/tdd/SKILL.md`))).toBe(true);
      }
    });
  });

  describe('originChecks', () => {
    it('reports update when the market hash moved and the disk copy was not edited', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      npx.setSkillHash('obra/react-patterns', 'market-moved');

      const result = await engine.originChecks();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([{ skillId: 'obra/react-patterns', status: 'update' }]);
      }
    });

    it('reports edited when the on-disk hash no longer matches originHash', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();

      const result = await engine.originChecks();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([{ skillId: 'obra/react-patterns', status: 'edited' }]);
      }
    });
  });

  describe('updateFromMarket', () => {
    it('overwrites an unedited copy in both live trees and refreshes originHash', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      npx.skillBody = '# from market\n';

      const result = await engine.updateFromMarket('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
      expect(fs.readFile('.claude/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
      expect(result.value.originHash).toBe(result.value.hash);
      expect(result.value.originHash).not.toBeUndefined();
    });

    it('refuses to overwrite an edited copy unless replaceEdited is set', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();

      const blocked = await engine.updateFromMarket('obra/react-patterns');
      expect(isErr(blocked)).toBe(true);

      npx.skillBody = '# from market\n';
      const reset = await engine.updateFromMarket('obra/react-patterns', { replaceEdited: true });
      expect(isOk(reset)).toBe(true);
      expect(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
      expect(fs.readFile('.claude/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
    });

    it('does not delete the on-disk copy when the market fetch fails', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();
      npx.setInstallError(new Error('npx failed'));

      const result = await engine.updateFromMarket('obra/react-patterns', { replaceEdited: true });

      expect(isErr(result)).toBe(true);
      expect(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# edited locally\n',
      });
      expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
    });

    it('keeps the skill catalogued after Reset and a follow-up scan', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();
      npx.skillBody = '# from market\n';

      const reset = await engine.updateFromMarket('obra/react-patterns', { replaceEdited: true });
      expect(isOk(reset)).toBe(true);
      const scanned = engine.scan();
      expect(isOk(scanned)).toBe(true);

      expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
      expect(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
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
    it('does not treat leftover getInstalled() as the catalog; install records the live pair', async () => {
      skills.seedInstalled([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '2024-01-01T00:00:00.000Z' }]);
      const loadedEngine = new CollectionEngine(fs, skills);

      expect(loadedEngine.skills()).toEqual([]);

      await loadedEngine.install('addyosmani/performance-review');

      expect(loadedEngine.skills().map((s) => s.id)).toEqual(['addyosmani/performance-review']);
      expect(loadedEngine.skills()[0]?.paths).toEqual([
        '.agents/skills/addyosmani/performance-review',
        '.claude/skills/addyosmani/performance-review',
      ]);
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
        expect(result.error.message).toContain("Command 'missing' not found");
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
    it('adds a scanned skill to the catalog', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).toEqual(['tdd']);
        expect(result.value.gone).toEqual([]);
        expect(result.value.changed).toEqual([]);
      }
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
      expect(engine.skills()[0]?.id).toBe('ui/styling');
    });

    it('finds skills under .cursor, .claude, .windsurf, and .agents', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.claude/skills/ui/SKILL.md', '# ui\n');
      fs.writeFile('.windsurf/skills/lint/SKILL.md', '# lint\n');
      fs.writeFile('.agents/skills/review/SKILL.md', '# review\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([
        expect.objectContaining({ id: 'tdd', paths: ['.cursor/skills/tdd'] }),
        expect.objectContaining({ id: 'ui', paths: ['.claude/skills/ui'] }),
        expect.objectContaining({ id: 'review', paths: ['.agents/skills/review'] }),
        expect.objectContaining({ id: 'lint', paths: ['.windsurf/skills/lint'] }),
      ]);
    });

    it('finds skills under .codex/skills', () => {
      fs.writeFile('.codex/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([
        expect.objectContaining({ id: 'tdd', paths: ['.codex/skills/tdd'] }),
      ]);
    });

    it('finds skills under .github/skills', () => {
      fs.writeFile('.github/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([
        expect.objectContaining({ id: 'tdd', paths: ['.github/skills/tdd'] }),
      ]);
    });

    it('catalogs a parked-only skill as off, with no live path', () => {
      fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([
        expect.objectContaining({ id: 'tdd', paths: ['.skil/parked/skills/tdd'] }),
      ]);
      expect(engine.skills()[0]?.paths.some((p) => p.startsWith('.agents/skills/') || p.startsWith('.claude/skills/'))).toBe(false);
    });

    it('does not scan .skil/deprecated', () => {
      fs.writeFile('.skil/deprecated/.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([]);
    });

    it('a leftover-only skill is catalogued without creating a live or parked copy', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      engine.scan();

      expect(fs.readFile('.agents/skills/tdd/SKILL.md').ok).toBe(false);
      expect(fs.readFile('.claude/skills/tdd/SKILL.md').ok).toBe(false);
      expect(fs.readFile('.skil/parked/skills/tdd/SKILL.md').ok).toBe(false);
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
    });

    it('does not mint a second catalog id for an npx leftover short folder', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns');
      fs.writeFile('.agents/skills/react-patterns/SKILL.md', '# react-patterns\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).not.toContain('react-patterns');
      }
      expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
      expect(engine.skills()[0]?.paths).toEqual([
        '.claude/skills/obra/react-patterns',
        '.agents/skills/obra/react-patterns',
        '.agents/skills/react-patterns',
      ]);
    });

    it('keeps a filed command map on re-scan and reports gone ids', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.addSkill('build', 'tdd');

      const persisted = fs.readJSON(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (!isOk(persisted)) {
        return;
      }

      fs.reset();
      fs.writeJSON(STATE_PATH, persisted.value);
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const reloaded = new CollectionEngine(fs, skills);
      const result = reloaded.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.gone).toEqual(['design']);
        expect(result.value.added).toEqual([]);
      }
      expect(reloaded.list()[0]?.skills).toEqual(['tdd']);
      expect(reloaded.skills().map((s) => s.id)).toEqual(['tdd']);
    });

    it('succeeds when skill trees are missing and ignores a stray commands/ file', () => {
      fs.writeFile('.cursor/commands/build.md', '# not a skill');

      const result = engine.scan();

      expect(result).toEqual({ ok: true, value: { added: [], gone: [], changed: [], alwaysOnWarnings: [] } });
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
    });

    it('loads v3 collections as commands and missing skills as []', () => {
      fs.writeJSON(STATE_PATH, {
        collections: [{ name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' }],
        installedSkills: [],
        version: '3.0',
      });
      const loaded = new CollectionEngine(fs, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z', enabled: false },
      ]);
      expect(loaded.skills()).toEqual([]);
    });

    it('treats same-hash path change as a rename, not gone plus added', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', []);
      engine.addSkill('build', 'tdd');

      fs.removeFile('.cursor/skills/tdd/SKILL.md');
      fs.writeFile('.cursor/skills/testing/SKILL.md', '# tdd\n');
      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).toEqual([]);
        expect(result.value.gone).toEqual([]);
      }
      expect(engine.list()[0]?.skills).toEqual(['testing']);
      expect(engine.skills().map((record) => record.id)).toEqual(['testing']);
    });

    it('unions the same hash in two docks into one catalog row', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([
        expect.objectContaining({
          id: 'tdd',
          paths: ['.cursor/skills/tdd', '.claude/skills/tdd'],
        }),
      ]);
    });
  });

  describe('deleteSkill', () => {
    it('deletes a leaf skill folder including related files and prunes empty parents', () => {
      fs.writeFile('.cursor/skills/ui/styling/SKILL.md', '# styling\n');
      fs.writeFile('.cursor/skills/ui/styling/scripts/run.sh', 'echo hi\n');
      fs.writeFile('.cursor/skills/ui/styling/references/notes.md', '# notes\n');
      engine.scan();

      const result = engine.deleteSkill('ui/styling');

      expect(isOk(result)).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/ui/styling/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/ui/styling/scripts/run.sh'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/ui/styling/references/notes.md'))).toBe(true);
      expect(engine.skills()).toEqual([]);
      expect(fs.listAllFiles('.cursor/skills')).toEqual({ ok: true, value: [] });
    });

    it('keeps nested skills and this skill’s siblings when deleting a parent skill', () => {
      fs.writeFile('.cursor/skills/build/SKILL.md', '# build\n');
      fs.writeFile('.cursor/skills/build/scripts/run.sh', 'echo parent\n');
      fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
      fs.writeFile('.cursor/skills/build/ui/shadcn/references/notes.md', '# notes\n');
      fs.writeFile('.cursor/skills/build/lint/SKILL.md', '# lint\n');
      engine.scan();

      const result = engine.deleteSkill('build');

      expect(isOk(result)).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/build/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/build/scripts/run.sh'))).toBe(true);
      expect(fs.readFile('.cursor/skills/build/ui/shadcn/SKILL.md')).toEqual({
        ok: true,
        value: '# shadcn\n',
      });
      expect(fs.readFile('.cursor/skills/build/ui/shadcn/references/notes.md')).toEqual({
        ok: true,
        value: '# notes\n',
      });
      expect(fs.readFile('.cursor/skills/build/lint/SKILL.md')).toEqual({ ok: true, value: '# lint\n' });
      expect(engine.skills().map((skill) => skill.id).sort()).toEqual(['build/lint', 'build/ui/shadcn']);
    });

    it('prunes empty parents after deleting a nested leaf, and leaves a sibling tree', () => {
      fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
      fs.writeFile('.cursor/skills/build/ui/shadcn/assets/icon.svg', '<svg />\n');
      fs.writeFile('.cursor/skills/other/SKILL.md', '# other\n');
      engine.scan();

      const result = engine.deleteSkill('build/ui/shadcn');

      expect(isOk(result)).toBe(true);
      expect(fs.listAllFiles('.cursor/skills/build')).toEqual({ ok: true, value: [] });
      expect(fs.readFile('.cursor/skills/other/SKILL.md')).toEqual({ ok: true, value: '# other\n' });
      expect(engine.skills().map((skill) => skill.id)).toEqual(['other']);
    });

    it('deletes the same id from every IDE tree', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo cursor\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.claude/skills/tdd/references/notes.md', '# notes\n');
      engine.scan();

      const result = engine.deleteSkill('tdd');

      expect(isOk(result)).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/tdd/scripts/run.sh'))).toBe(true);
      expect(isErr(fs.readFile('.claude/skills/tdd/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.claude/skills/tdd/references/notes.md'))).toBe(true);
      expect(engine.skills()).toEqual([]);
    });

    it('unfiles the id and rewrites existing live command-skill stamps', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.addSkill('build', 'tdd');
      engine.addSkill('build', 'design');
      await engine.setCommandEnabled('build', true);

      const result = engine.deleteSkill('tdd');

      expect(isOk(result)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['design']);
      const agentsStamp = fs.readFile('.agents/skills/build/SKILL.md');
      expect(isOk(agentsStamp)).toBe(true);
      if (isOk(agentsStamp)) {
        expect(agentsStamp.value).toContain('design');
        expect(agentsStamp.value).not.toMatch(/^\s*-\s*tdd\s*$/m);
      }
      const claudeStamp = fs.readFile('.claude/skills/build/SKILL.md');
      expect(isOk(claudeStamp)).toBe(true);
      if (isOk(claudeStamp)) {
        expect(claudeStamp.value).not.toMatch(/^\s*-\s*tdd\s*$/m);
      }
    });

    it('is a no-op when the id is unknown', () => {
      const result = engine.deleteSkill('missing');

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([]);
    });

    it('leaves disk and state unchanged when persisting fails', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo hi\n');
      engine.scan();
      fs.setWriteError(new Error('Disk full'));

      const result = engine.deleteSkill('tdd');

      expect(isErr(result)).toBe(true);
      fs.setWriteError(null);
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(fs.readFile('.cursor/skills/tdd/scripts/run.sh')).toEqual({ ok: true, value: 'echo hi\n' });
      expect(engine.skills()).toHaveLength(1);
    });

    it('prunes empty parent directories on a real disk', () => {
      const tmpDir = mkdtempSync(join(process.cwd(), 'tmp-skil-delete-'));
      try {
        const realFs = new RealFileSystemAdapter(tmpDir);
        const realEngine = new CollectionEngine(realFs, new InMemorySkillsAdapter());
        realFs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
        realFs.writeFile('.cursor/skills/other/SKILL.md', '# other\n');
        realEngine.scan();

        expect(isOk(realEngine.deleteSkill('build/ui/shadcn'))).toBe(true);
        expect(existsSync(join(tmpDir, '.cursor', 'skills', 'build'))).toBe(false);
        expect(existsSync(join(tmpDir, '.cursor', 'skills', 'other', 'SKILL.md'))).toBe(true);
        expect(existsSync(join(tmpDir, '.cursor', 'skills'))).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('readSkillMd', () => {
    it('returns the on-disk SKILL.md for a scanned id', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n\nWrite tests first.\n');
      engine.scan();

      const result = engine.readSkillMd('tdd');

      expect(result).toEqual({ ok: true, value: '# tdd\n\nWrite tests first.\n' });
    });

    it('reads the first dock copy when the same id exists on several trees', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# cursor tdd\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# claude tdd\n');
      engine.scan();

      const result = engine.readSkillMd('tdd');

      expect(result).toEqual({ ok: true, value: '# cursor tdd\n' });
    });

    it('falls through to the next path when the first copy is gone', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# cursor tdd\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# claude tdd\n');
      engine.scan();
      fs.removeFile('.cursor/skills/tdd/SKILL.md');

      const result = engine.readSkillMd('tdd');

      expect(result).toEqual({ ok: true, value: '# claude tdd\n' });
    });

    it('reads a nested skill folder, not its parent', () => {
      fs.writeFile('.cursor/skills/build/SKILL.md', '# build\n');
      fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
      engine.scan();

      const result = engine.readSkillMd('build/ui/shadcn');

      expect(result).toEqual({ ok: true, value: '# shadcn\n' });
    });

    it('errors when the id is not in the catalog', () => {
      const result = engine.readSkillMd('obra/react-patterns');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('obra/react-patterns');
      }
    });
  });

  describe('one command list', () => {
    it('create twice is already exists', () => {
      engine.create('build', ['tdd']);

      const result = engine.create('build', ['design']);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Command 'build' already exists");
      }
      expect(engine.list()).toEqual([expect.objectContaining({ name: 'build', skills: ['tdd'] })]);
    });

    it('addSkill and removeSkill update the one project list', () => {
      engine.create('build', []);

      const added = engine.addSkill('build', 'tdd');
      expect(isOk(added)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);

      engine.removeSkill('build', 'tdd');
      expect(engine.list()[0]?.skills).toEqual([]);
    });

    it('delete drops the command for the whole project', () => {
      engine.create('build', ['tdd']);

      const result = engine.delete('build');

      expect(isOk(result)).toBe(true);
      expect(engine.list()).toEqual([]);
    });

    it('loads v4 skills[] as the project list', () => {
      fs.writeJSON(STATE_PATH, {
        commands: [{ name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' }],
        skills: [],
        version: '4.0',
      });
      const loaded = new CollectionEngine(fs, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z', enabled: false },
      ]);
    });
  });

  describe('write-through', () => {
    it('does not write a live command-skill stamp until the command is turned on', () => {
      engine.create('build', []);
      engine.addSkill('build', 'tdd');

      expect(isErr(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.claude/skills/build/SKILL.md'))).toBe(true);
    });

    it('addSkill rewrites existing live command-skill stamps on both live trees', async () => {
      engine.create('build', []);
      await engine.setCommandEnabled('build', true);
      engine.addSkill('build', 'tdd');

      const agentsFile = fs.readFile('.agents/skills/build/SKILL.md');
      expect(isOk(agentsFile)).toBe(true);
      if (isOk(agentsFile)) {
        expect(agentsFile.value).toContain('tdd');
        expect(agentsFile.value).toContain('generated_by: skil');
      }
      const claudeFile = fs.readFile('.claude/skills/build/SKILL.md');
      expect(isOk(claudeFile)).toBe(true);
      if (isOk(claudeFile)) {
        expect(claudeFile.value).toContain('tdd');
      }
    });

    it('delete removes the live command-skill folders on both live trees', async () => {
      engine.create('build', ['tdd']);
      await engine.setCommandEnabled('build', true);
      expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true);
      expect(isOk(fs.readFile('.claude/skills/build/SKILL.md'))).toBe(true);

      engine.delete('build');

      expect(isErr(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.claude/skills/build/SKILL.md'))).toBe(true);
    });

    it('leaves an off command unwritten when a skill is added', () => {
      engine.create('build', ['tdd']);
      engine.addSkill('build', 'design');

      expect(isErr(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd', 'design']);
    });

    it('does not rewrite a stamp on scan when the map is unchanged', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', ['tdd']);
      await engine.setCommandEnabled('build', true);
      const before = fs.readFile('.agents/skills/build/SKILL.md');

      engine.scan();

      expect(fs.readFile('.agents/skills/build/SKILL.md')).toEqual(before);
      expect(engine.lastWrittenPaths()).toEqual([]);
    });

    it('rewrites a stamp on scan when gone-id cleanup changed the list', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.addSkill('build', 'tdd');
      engine.addSkill('build', 'design');
      await engine.setCommandEnabled('build', true);
      fs.removeFile('.cursor/skills/design/SKILL.md');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
      expect(engine.lastWrittenPaths()).toContain('.agents/skills/build');
      const stamp = fs.readFile('.agents/skills/build/SKILL.md');
      expect(isOk(stamp)).toBe(true);
      if (isOk(stamp)) {
        expect(stamp.value).toContain('tdd');
        expect(stamp.value).not.toMatch(/^\s*-\s*design\s*$/m);
      }
    });
  });

  describe('usage', () => {
    it('aggregates two collector events for a catalog skill as count 2', async () => {
      const usage = new InMemoryUsageCollector();
      usage.seed([
        { skillId: 'tdd', source: 'claude' },
        { skillId: 'tdd', source: 'claude' },
      ]);
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine = new CollectionEngine(fs, skills, usage);
      engine.scan();

      expect(await engine.usage()).toEqual({
        ok: true,
        value: [{ skillId: 'tdd', count: 2 }],
      });
    });

    it('returns a collector error and still lets scan run', async () => {
      const usage = new InMemoryUsageCollector();
      usage.setCollectError(new Error('log unreadable'));
      engine = new CollectionEngine(fs, skills, usage);
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const result = await engine.usage();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('log unreadable');
      }
      expect(isOk(engine.scan())).toBe(true);
      expect(engine.skills().map((s) => s.id)).toEqual(['tdd']);
    });
  });

  describe('rules', () => {
    it('lists AGENTS.md shared-law sections and path-scoped glob rule files, and scan does not touch either', () => {
      fs.writeFile(
        'AGENTS.md',
        '<!-- skil:rule pair-programming/behavior -->\n# behavior\n<!-- /skil:rule pair-programming/behavior -->\n\n' +
          '<!-- skil:rule security -->\n# security\n<!-- /skil:rule security -->\n'
      );
      fs.writeFile('.cursor/rules/pair-programming/format.mdc', '# format\n');
      fs.writeFile('.claude/rules/review.md', '# review\n');
      fs.writeFile('.github/instructions/typescript.instructions.md', '---\napplyTo: "**/*.ts"\n---\n# ts\n');
      fs.writeFile('.windsurf/rules/style.md', '# style\n');
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      engine.scan();

      const rules = engine.rules();
      expect(rules).toHaveLength(6);
      expect(rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'pair-programming/behavior', kind: 'shared', path: 'AGENTS.md', enabled: true }),
          expect.objectContaining({ id: 'security', kind: 'shared', path: 'AGENTS.md', enabled: true }),
          expect.objectContaining({
            id: '.cursor/rules/pair-programming/format.mdc',
            name: 'pair-programming/format',
            kind: 'glob',
          }),
          expect.objectContaining({ id: '.claude/rules/review.md', name: 'review', kind: 'glob' }),
          expect.objectContaining({
            id: '.github/instructions/typescript.instructions.md',
            name: 'typescript',
            kind: 'glob',
          }),
          expect.objectContaining({ id: '.windsurf/rules/style.md', name: 'style', kind: 'glob' }),
        ])
      );
      expect(fs.readFile('AGENTS.md')).toEqual({
        ok: true,
        value:
          '<!-- skil:rule pair-programming/behavior -->\n# behavior\n<!-- /skil:rule pair-programming/behavior -->\n\n' +
            '<!-- skil:rule security -->\n# security\n<!-- /skil:rule security -->\n',
      });
    });

    it('reads a rule body by path id', () => {
      fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# hello\n');

      const result = engine.readRule('.cursor/rules/behavior.mdc');

      expect(result).toEqual({ ok: true, value: '---\nalwaysApply: true\n---\n# hello\n' });
    });

    it('errors when the rule file is missing', () => {
      const result = engine.readRule('.cursor/rules/gone.mdc');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/gone/i);
      }
    });

    it('does not read an absolute path even when that file exists', () => {
      fs.writeFile('/etc/passwd', 'root:x:0:0:root:/root:/bin/sh\n');

      const result = engine.readRule('/etc/passwd');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/not found/i);
        expect(result).not.toEqual({ ok: true, value: 'root:x:0:0:root:/root:/bin/sh\n' });
      }
    });

    it('does not read a project file that is not a listed rule', () => {
      fs.writeFile('.env', 'SECRET=1\n');
      fs.writeFile('.cursor/rules/../../.env', 'SECRET=1\n');

      expect(isErr(engine.readRule('.env'))).toBe(true);
      expect(isErr(engine.readRule('.cursor/rules/../../.env'))).toBe(true);
    });

    it('turns a shared rule off: removes the AGENTS.md section and parks the body', () => {
      fs.writeFile(
        'AGENTS.md',
        '<!-- skil:rule pair-programming/behavior -->\n# behavior\n<!-- /skil:rule pair-programming/behavior -->\n'
      );

      const result = engine.setSharedRuleEnabled('pair-programming/behavior', false);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.enabled).toBe(false);
      }
      expect(fs.readFile('AGENTS.md')).toEqual({ ok: true, value: '' });
      expect(fs.readFile('.skil/parked/rules/pair-programming/behavior')).toEqual({
        ok: true,
        value: '# behavior',
      });
    });

    it('turning a shared rule off is a no-op when it is already off', () => {
      fs.writeFile('.skil/parked/rules/behavior', '# behavior\n');

      const result = engine.setSharedRuleEnabled('behavior', false);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.enabled).toBe(false);
      }
    });

    it('turns a shared rule on: restores the AGENTS.md section from parked', () => {
      fs.writeFile('.skil/parked/rules/pair-programming/behavior', '# behavior\n');
      fs.writeFile('AGENTS.md', '# existing law\n');

      const result = engine.setSharedRuleEnabled('pair-programming/behavior', true);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.enabled).toBe(true);
      }
      const agents = fs.readFile('AGENTS.md');
      expect(isOk(agents)).toBe(true);
      if (isOk(agents)) {
        expect(agents.value).toContain('# existing law');
        expect(agents.value).toContain('<!-- skil:rule pair-programming/behavior -->');
        expect(agents.value).toContain('# behavior');
      }
      expect(isErr(fs.readFile('.skil/parked/rules/pair-programming/behavior'))).toBe(true);
    });

    it('turning a shared rule on with nothing parked and no live section is an error', () => {
      const result = engine.setSharedRuleEnabled('missing', true);

      expect(isErr(result)).toBe(true);
    });

    it('refuses to toggle a glob rule', () => {
      fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');

      const result = engine.setSharedRuleEnabled('.cursor/rules/behavior.mdc', false);

      expect(isErr(result)).toBe(true);
      expect(fs.readFile('.cursor/rules/behavior.mdc')).toEqual({ ok: true, value: '# behavior\n' });
    });
  });

  describe('leftovers', () => {
    it('lists a leftover skill path, a leftover command file, and leftover .codex/rules, but not a live skill, a parked skill, or a glob rule', () => {
      fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/other/SKILL.md', '# other\n');
      fs.writeFile('.skil/parked/skills/design/SKILL.md', '# design\n');
      fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
      fs.writeFile('.codex/rules/pair-programming/behavior.md', '# behavior\n');
      engine.create('build', []);
      fs.writeFile(
        '.cursor/commands/build.md',
        '---\nname: /build\nskills: []\ngenerated_by: skil\ngenerated_at: 2026-01-01T00:00:00.000Z\n---\n\n1. Use the skills listed in frontmatter when they apply.\n'
      );
      engine.scan();

      const result = engine.leftovers();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toEqual(
        expect.arrayContaining([
          { kind: 'skill', id: 'other', path: '.cursor/skills/other' },
          { kind: 'command', id: 'build', path: '.cursor/commands/build.md' },
          { kind: 'rule', id: '.codex/rules/pair-programming/behavior.md', path: '.codex/rules/pair-programming/behavior.md' },
        ])
      );
      expect(result.value.some((row) => row.kind === 'skill' && row.id === 'tdd')).toBe(false);
      expect(result.value.some((row) => row.id === 'design')).toBe(false);
      expect(result.value.some((row) => row.path === '.cursor/rules/behavior.mdc')).toBe(false);
    });
  });

  describe('adoptLeftovers', () => {
    it('copies a leftover skill into the missing live tree, then deprecates the old path', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      const result = await engine.adoptLeftovers(['tdd']);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.adopted).toEqual(['tdd']);
        expect(result.value.deprecated).toEqual(['.skil/deprecated/.cursor/skills/tdd']);
      }
      expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
      expect(isOk(fs.readFile('.claude/skills/tdd/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
      expect(isOk(fs.readFile('.skil/deprecated/.cursor/skills/tdd/SKILL.md'))).toBe(true);
    });

    it('drops the old path from state so the adopted skill stops showing up as a leftover', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      await engine.adoptLeftovers(['tdd']);
      const result = engine.leftovers();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.some((row) => row.id === 'tdd')).toBe(false);
      }
    });

    it('never touches a parked-only skill: it is off, not a leftover', async () => {
      fs.writeFile('.skil/parked/skills/design/SKILL.md', '# design\n');
      engine.scan();

      const result = await engine.adoptLeftovers();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.adopted).toEqual([]);
        expect(result.value.deprecated).toEqual([]);
      }
      expect(fs.readFile('.skil/parked/skills/design/SKILL.md')).toEqual({ ok: true, value: '# design\n' });
      expect(isErr(fs.readFile('.agents/skills/design/SKILL.md'))).toBe(true);
    });
  });
});
