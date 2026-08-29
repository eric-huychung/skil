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
 * `npx skills add --agent` project dirs (vercel-labs/skills). Cursor, Codex,
 * and Copilot dump into `.agents/skills`, not their dock folders. Folder
 * name is the last id segment.
 */
function npxProjectSkillRoot(ide: IDE): string {
  switch (ide) {
    case 'cursor':
    case 'agents':
    case 'codex':
    case 'copilot':
      return '.agents/skills';
    case 'claude':
      return '.claude/skills';
    case 'windsurf':
      return '.windsurf/skills';
  }
}

class NpxLayoutSkillsAdapter extends InMemorySkillsAdapter {
  skillBody = '';

  constructor(private readonly disk: InMemoryFileSystemAdapter) {
    super();
  }

  override async install(skillId: string, targetIDE: IDE, opts?: { cwd?: string }) {
    const result = await super.install(skillId, targetIDE, opts);
    if (!isOk(result)) {
      return result;
    }
    const shortName = skillId.split('/').filter(Boolean).at(-1) ?? skillId;
    const prefix = opts?.cwd ? `${opts.cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/` : '';
    this.disk.writeFile(
      `${prefix}${npxProjectSkillRoot(targetIDE)}/${shortName}/SKILL.md`,
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
        inbox: [],
        version: '5.0',
      });
      const loaded = new CollectionEngine(fs, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd', 'design', 'ui'], createdAt: '2024-01-01T00:00:00.000Z' },
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
        inbox: [],
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
        { name: 'frontend', skills: ['react-patterns'], createdAt: '2024-01-01T00:00:00.000Z' },
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

  describe('exportCommand', () => {
    it('writes a stamped cursor command file whose skills match the command', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', ['tdd', 'design']);

      const result = await engine.exportCommand('build', 'cursor');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual(['.cursor/commands/build.md']);
        expect(result.value.failures).toEqual([]);
      }

      const written = fs.readFile('.cursor/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('name: /build');
        expect(written.value).toContain('generated_by: skil');
        expect(written.value).toMatch(/generated_at: \d{4}-\d{2}-\d{2}T/);
        expect(written.value).toContain('- tdd');
        expect(written.value).toContain('- design');
        expect(written.value).toContain('## Goal');
        expect(written.value).toContain('<!-- Describe what this command is for. -->');
        expect(written.value).toContain('## Skills');
        expect(written.value).toContain('- `tdd`');
        expect(written.value).not.toContain('1. Use the skills listed in frontmatter when they apply.');
      }
      expect(skills.getInstalls()).toEqual([]);
    });

    it('writes the command file under dest without moving workspace state', async () => {
      engine.create('build', ['obra/react-patterns']);

      const result = await engine.exportCommand('build', 'cursor', { dest: '/tmp/other-project' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded[0]).toBe('/tmp/other-project/.cursor/commands/build.md');
      }
      const written = fs.readFile('/tmp/other-project/.cursor/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('generated_by: skil');
        expect(written.value).toContain('- obra/react-patterns');
      }
      expect(isOk(fs.readFile('/tmp/other-project/.cursor/commands/build.md'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(engine.list()).toEqual([expect.objectContaining({ name: 'build' })]);
    });

    it('refuses an existing unstamped file unless replace is set', async () => {
      engine.create('build', ['tdd']);
      fs.writeFile('.cursor/commands/build.md', '# their old /build\n');

      const refused = await engine.exportCommand('build', 'cursor');

      expect(isErr(refused)).toBe(true);
      if (isErr(refused)) {
        expect(refused.code).toBe('UNSTAMPED_COMMAND');
        expect(refused.labels).toEqual(['build']);
      }
      expect(fs.readFile('.cursor/commands/build.md')).toEqual({
        ok: true,
        value: '# their old /build\n',
      });
      expect(skills.getInstalls()).toEqual([]);

      const replaced = await engine.exportCommand('build', 'cursor', { replace: true });

      expect(isOk(replaced)).toBe(true);
      const written = fs.readFile('.cursor/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('generated_by: skil');
        expect(written.value).not.toContain('their old /build');
      }
    });

    it('overwrites a file already stamped by skil', async () => {
      engine.create('build', ['tdd']);
      await engine.exportCommand('build', 'cursor');
      engine.addSkill('build', 'design');

      const result = await engine.exportCommand('build', 'cursor');

      expect(isOk(result)).toBe(true);
      const written = fs.readFile('.cursor/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('- tdd');
        expect(written.value).toContain('- design');
        expect(written.value).toContain('generated_by: skil');
      }
    });

    it('keeps a customized Goal when filing a skill onto a stamped command', async () => {
      engine.create('build', ['tdd']);
      await engine.exportCommand('build', 'cursor');
      const stamp = fs.readFile('.cursor/commands/build.md');
      expect(isOk(stamp)).toBe(true);
      if (isOk(stamp)) {
        fs.writeFile(
          '.cursor/commands/build.md',
          stamp.value.replace(
            '<!-- Describe what this command is for. -->',
            'Ship the checkout flow.'
          )
        );
      }

      engine.addSkill('build', 'design');

      const written = fs.readFile('.cursor/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('Ship the checkout flow.');
        expect(written.value).toContain('- `design`');
        expect(written.value).not.toContain('<!-- Describe what this command is for. -->');
      }
    });

    it('resets Goal, Sequence, and Rules when replace is set on a stamped file', async () => {
      engine.create('build', ['tdd']);
      await engine.exportCommand('build', 'cursor');
      const stamp = fs.readFile('.cursor/commands/build.md');
      expect(isOk(stamp)).toBe(true);
      if (isOk(stamp)) {
        fs.writeFile(
          '.cursor/commands/build.md',
          stamp.value.replace(
            '<!-- Describe what this command is for. -->',
            'Ship the checkout flow.'
          )
        );
      }

      const result = await engine.exportCommand('build', 'cursor', { replace: true });

      expect(isOk(result)).toBe(true);
      const written = fs.readFile('.cursor/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('<!-- Describe what this command is for. -->');
        expect(written.value).not.toContain('Ship the checkout flow.');
      }
    });

    it('fails when the command is missing and leaves other IDE files alone', async () => {
      engine.create('build', []);
      fs.writeFile('.claude/commands/build.md', '# keep me\n');
      fs.writeFile('.windsurf/workflows/build.md', '# keep windsurf\n');

      const missing = await engine.exportCommand('missing', 'cursor');
      expect(isErr(missing)).toBe(true);
      if (isErr(missing)) {
        expect(missing.error.message).toContain("Command 'missing' not found");
      }
      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);

      const exported = await engine.exportCommand('/build', 'cursor');
      expect(isOk(exported)).toBe(true);
      expect(isOk(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(fs.readFile('.claude/commands/build.md')).toEqual({ ok: true, value: '# keep me\n' });
      expect(fs.readFile('.windsurf/workflows/build.md')).toEqual({
        ok: true,
        value: '# keep windsurf\n',
      });
    });

    it('writes Claude, Windsurf, and agents files to their IDE paths', async () => {
      engine.create('build', []);

      expect(await engine.copyTo('build', 'cursor', 'claude')).toEqual({
        ok: true,
        value: { succeeded: ['.claude/commands/build.md'], failures: [] },
      });
      expect(await engine.copyTo('build', 'cursor', 'windsurf')).toEqual({
        ok: true,
        value: { succeeded: ['.windsurf/workflows/build.md'], failures: [] },
      });
      expect(await engine.copyTo('build', 'cursor', 'agents')).toEqual({
        ok: true,
        value: { succeeded: ['.agents/commands/build.md'], failures: [] },
      });

      expect(isOk(fs.readFile('.claude/commands/build.md'))).toBe(true);
      expect(isOk(fs.readFile('.windsurf/workflows/build.md'))).toBe(true);
      expect(isOk(fs.readFile('.agents/commands/build.md'))).toBe(true);
    });

    it('copies filed local skills into the target IDE and leaves the source folder unchanged', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/tdd/references/notes.md', '# notes\n');
      engine.scan();
      engine.create('build', ['tdd']);

      const result = await engine.copyTo('build', 'cursor', 'claude');

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.claude/commands/build.md')).toMatchObject({ ok: true });
      expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(fs.readFile('.claude/skills/tdd/references/notes.md')).toEqual({
        ok: true,
        value: '# notes\n',
      });
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(fs.readFile('.cursor/skills/tdd/references/notes.md')).toEqual({
        ok: true,
        value: '# notes\n',
      });
      expect(skills.getInstalls()).toEqual([]);
    });

    it('leaves a skill already in the target IDE unchanged and does not copy again', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# cursor tdd\n');
      fs.writeFile('.claude/skills/tdd/SKILL.md', '# claude tdd\n');
      engine.scan();
      engine.create('build', ['tdd']);

      const result = await engine.copyTo('build', 'cursor', 'claude');

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({
        ok: true,
        value: '# claude tdd\n',
      });
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({
        ok: true,
        value: '# cursor tdd\n',
      });
      expect(skills.getInstalls()).toEqual([]);
    });

    it('installs Discover-only skills that have no local folder', async () => {
      engine.create('build', ['obra/react-patterns']);

      const result = await engine.copyTo('build', 'cursor', 'claude');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toContain('.claude/commands/build.md');
        expect(result.value.succeeded).toContain('.claude/skills/obra/react-patterns');
        expect(result.value.failures).toEqual([]);
      }
      expect(skills.getInstalls()).toEqual([{ skillId: 'obra/react-patterns', ide: 'claude' }]);
    });

    it('exports filed skills to Codex without a command file', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', ['tdd']);

      const result = await engine.exportCommand('build', 'codex');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual(['.codex/skills/tdd']);
        expect(result.value.failures).toEqual([]);
      }
      expect(fs.readFile('.codex/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(isErr(fs.readFile('.codex/commands/build.md'))).toBe(true);
    });

    it('exports a VS Code prompt file and filed skills to Copilot', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', ['tdd']);

      const result = await engine.exportCommand('build', 'copilot');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual(['.github/prompts/build.prompt.md', '.github/skills/tdd']);
        expect(result.value.failures).toEqual([]);
      }
      expect(fs.readFile('.github/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(isOk(fs.readFile('.github/prompts/build.prompt.md'))).toBe(true);
    });
  });

  describe('exportAll', () => {
    it('writes a stamped command file for every command in the workspace', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', ['tdd']);
      engine.create('testing', ['design']);

      const result = await engine.exportAll('cursor');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual(['.cursor/commands/build.md', '.cursor/commands/testing.md']);
        expect(result.value.failures).toEqual([]);
      }

      const build = fs.readFile('.cursor/commands/build.md');
      const testing = fs.readFile('.cursor/commands/testing.md');
      expect(isOk(build)).toBe(true);
      expect(isOk(testing)).toBe(true);
      if (isOk(build)) {
        expect(build.value).toContain('generated_by: skil');
        expect(build.value).toContain('- tdd');
      }
      if (isOk(testing)) {
        expect(testing.value).toContain('generated_by: skil');
        expect(testing.value).toContain('- design');
      }
    });

    it('refuses an unstamped file and does not write other command files', async () => {
      engine.create('build', ['tdd']);
      engine.create('testing', ['design']);
      fs.writeFile('.cursor/commands/testing.md', '# their old /testing\n');

      const refused = await engine.exportAll('cursor');

      expect(isErr(refused)).toBe(true);
      if (isErr(refused)) {
        expect(refused.code).toBe('UNSTAMPED_COMMAND');
        expect(refused.labels).toEqual(['testing']);
      }
      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(fs.readFile('.cursor/commands/testing.md')).toEqual({
        ok: true,
        value: '# their old /testing\n',
      });
    });

    it('lists every unstamped command name in one error', async () => {
      engine.create('build', ['tdd']);
      engine.create('testing', ['design']);
      engine.create('review', ['tdd']);
      fs.writeFile('.cursor/commands/testing.md', '# their old /testing\n');
      fs.writeFile('.cursor/commands/review.md', '# their old /review\n');

      const refused = await engine.exportAll('cursor');

      expect(isErr(refused)).toBe(true);
      if (isErr(refused)) {
        expect(refused.code).toBe('UNSTAMPED_COMMAND');
        expect(refused.labels).toEqual(['testing', 'review']);
      }
      expect(fs.readFile('.cursor/commands/testing.md')).toEqual({
        ok: true,
        value: '# their old /testing\n',
      });
      expect(fs.readFile('.cursor/commands/review.md')).toEqual({
        ok: true,
        value: '# their old /review\n',
      });
    });

    it('overwrites every unstamped file when replace is set', async () => {
      engine.create('build', ['tdd']);
      engine.create('testing', ['design']);
      fs.writeFile('.cursor/commands/testing.md', '# their old /testing\n');

      const replaced = await engine.exportAll('cursor', { replace: true });

      expect(isOk(replaced)).toBe(true);
      const build = fs.readFile('.cursor/commands/build.md');
      const testing = fs.readFile('.cursor/commands/testing.md');
      expect(isOk(build)).toBe(true);
      expect(isOk(testing)).toBe(true);
      if (isOk(testing)) {
        expect(testing.value).toContain('generated_by: skil');
        expect(testing.value).not.toContain('their old /testing');
      }
    });

    it('fails when there are no commands', async () => {
      const result = await engine.exportAll('cursor');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/no commands/i);
      }
      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
    });

    it('writes every command file under dest without moving workspace state', async () => {
      engine.create('build', []);
      engine.create('testing', []);

      const result = await engine.exportAll('cursor', { dest: '/tmp/other-project' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.succeeded).toEqual([
          '/tmp/other-project/.cursor/commands/build.md',
          '/tmp/other-project/.cursor/commands/testing.md',
        ]);
      }
      expect(isOk(fs.readFile('/tmp/other-project/.cursor/commands/build.md'))).toBe(true);
      expect(isOk(fs.readFile('/tmp/other-project/.cursor/commands/testing.md'))).toBe(true);
      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(engine.list().map((c) => c.name)).toEqual(['build', 'testing']);
    });
  });

  describe('market skill export (npx layout)', () => {
    it('keeps a Discover skill on the Cursor command after save, in .cursor not .agents', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      engine.addToInbox('vercel-labs/skills/find-skills');
      engine.create('build', []);
      engine.file('vercel-labs/skills/find-skills', 'build', 'cursor');

      const exported = await engine.exportAll('cursor');
      expect(isOk(exported)).toBe(true);

      engine.scan();

      expect(engine.list()[0]?.skills).toEqual(['vercel-labs/skills/find-skills']);
      const commandFile = fs.readFile('.cursor/commands/build.md');
      expect(isOk(commandFile)).toBe(true);
      if (isOk(commandFile)) {
        expect(commandFile.value).toContain('vercel-labs/skills/find-skills');
      }
      expect(isOk(fs.readFile('.cursor/skills/vercel-labs/skills/find-skills/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.agents/skills/find-skills/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.agents/commands/build.md'))).toBe(true);
    });
  });

  describe('install', () => {
    it('installs a skill via the skills adapter and records deployedTo on the catalog', async () => {
      const result = await engine.install('obra/react-patterns', 'cursor');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.id).toBe('obra/react-patterns');
        expect(result.value.source).toBe('skills.sh');
        expect(result.value.paths).toEqual(['.cursor/skills/obra/react-patterns']);
        expect(result.value.deployedTo).toEqual([
          expect.objectContaining({
            ide: 'cursor',
            path: '.cursor/skills/obra/react-patterns',
            installedAt: expect.any(String),
          }),
        ]);
        expect(engine.skills()).toEqual([result.value]);
      }
      expect(engine.list()).toEqual([]);
      expect(isErr(fs.readFile('.cursor/commands/obra/react-patterns.md'))).toBe(true);
    });

    it('stamps originHash from the copied SKILL.md and keeps it after the file is edited', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      const result = await engine.install('obra/react-patterns', 'cursor');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.originHash).toBe(result.value.hash);
      expect(result.value.originHash).toMatch(/^[a-f0-9]{64}$/);

      fs.writeFile('.cursor/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();

      const row = engine.skills()[0];
      expect(row?.originHash).toBe(result.value.originHash);
      expect(row?.hash).not.toBe(row?.originHash);
    });

    it('persists the catalog deploy and does not require the id to be filed', async () => {
      engine.addToInbox('obra/react-patterns');

      await engine.install('obra/react-patterns', 'cursor');

      expect(engine.inbox()).toEqual(['obra/react-patterns']);
      const persisted = fs.readJSON<{ skills: Array<{ id: string; deployedTo: Array<{ ide: string }> }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toEqual([
          expect.objectContaining({
            id: 'obra/react-patterns',
            source: 'skills.sh',
            deployedTo: [expect.objectContaining({ ide: 'cursor' })],
          }),
        ]);
      }
    });

    it('keeps source local when installing a scanned skill to another IDE', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();

      const result = await engine.install('tdd', 'claude');

      expect(isOk(result)).toBe(true);
      const record = engine.skills().find((s) => s.id === 'tdd');
      expect(record?.source).toBe('local');
      expect(record?.paths).toEqual(['.cursor/skills/tdd', '.claude/skills/tdd']);
      expect(record?.deployedTo).toEqual([
        expect.objectContaining({ ide: 'claude', path: '.claude/skills/tdd' }),
      ]);
    });

    it('installs to Codex under .codex/skills and records deployedTo', async () => {
      const result = await engine.install('obra/x', 'codex');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paths).toEqual(['.codex/skills/obra/x']);
        expect(result.value.deployedTo).toEqual([
          expect.objectContaining({ ide: 'codex', path: '.codex/skills/obra/x' }),
        ]);
      }
      expect(isErr(fs.readFile('.codex/commands/obra/x.md'))).toBe(true);
    });

    it('installs to Copilot under .github/skills and records deployedTo', async () => {
      const result = await engine.install('obra/x', 'copilot');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paths).toEqual(['.github/skills/obra/x']);
        expect(result.value.deployedTo).toEqual([
          expect.objectContaining({ ide: 'copilot', path: '.github/skills/obra/x' }),
        ]);
      }
    });

    it('places a Cursor install under .cursor/skills and removes the vercel .agents dump', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      const result = await engine.install('obra/react-patterns', 'cursor');

      expect(isOk(result)).toBe(true);
      expect(isOk(fs.readFile('.cursor/skills/obra/react-patterns/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.agents/skills/react-patterns/SKILL.md'))).toBe(true);
      expect(engine.skills()[0]?.paths).toEqual(['.cursor/skills/obra/react-patterns']);
    });

    it('places an agents install under .agents/skills', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      const result = await engine.install('obra/react-patterns', 'agents');

      expect(isOk(result)).toBe(true);
      expect(isOk(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md'))).toBe(true);
      expect(engine.skills()[0]?.paths).toEqual(['.agents/skills/obra/react-patterns']);
    });

    it('places Codex and Copilot installs in their dock folders after a vercel .agents dump', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);

      await engine.install('obra/x', 'codex');
      expect(isOk(fs.readFile('.codex/skills/obra/x/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.agents/skills/x/SKILL.md'))).toBe(true);

      await engine.install('obra/y', 'copilot');
      expect(isOk(fs.readFile('.github/skills/obra/y/SKILL.md'))).toBe(true);
      expect(isErr(fs.readFile('.agents/skills/y/SKILL.md'))).toBe(true);
    });

    it('upserts deployedTo when the same skill is installed to a second IDE', async () => {
      await engine.install('obra/x', 'cursor');
      await engine.install('obra/x', 'windsurf');

      expect(engine.skills()).toHaveLength(1);
      expect(engine.skills()[0]?.deployedTo.map((d) => d.ide)).toEqual(['cursor', 'windsurf']);
      expect(engine.skills()[0]?.paths).toEqual([
        '.cursor/skills/obra/x',
        '.windsurf/skills/obra/x',
      ]);
    });

    it('returns an error when the skills adapter fails to install', async () => {
      skills.setInstallError(new Error('npx: command failed'));

      const result = await engine.install('obra/react-patterns', 'cursor');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('command failed');
      }
    });

    it('does not persist a deploy when the adapter fails', async () => {
      engine.create('frontend', []);
      skills.setInstallError(new Error('npx: command failed'));

      await engine.install('obra/react-patterns', 'cursor');

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

      const result = await engine.install('obra/react-patterns', 'cursor');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Disk full');
      }
      expect(engine.skills()).toEqual([]);

      fs.setWriteError(null);
      await engine.install('obra/react-patterns', 'cursor');
      const persisted = fs.readJSON<{ skills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toHaveLength(1);
        expect(persisted.value.skills[0]?.id).toBe('obra/react-patterns');
      }
    });

    it('installs into dest and keeps catalog state on the current workspace', async () => {
      const result = await engine.install('obra/react-patterns', 'cursor', { dest: '/tmp/other-project' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.deployedTo).toEqual([
          expect.objectContaining({
            ide: 'cursor',
            path: '/tmp/other-project/.cursor/skills/obra/react-patterns',
          }),
        ]);
      }
      expect(skills.getInstalls()).toEqual([
        { skillId: 'obra/react-patterns', ide: 'cursor', cwd: '/tmp/other-project' },
      ]);
      const persisted = fs.readJSON<{ skills: Array<{ id: string }> }>(STATE_PATH);
      expect(isOk(persisted)).toBe(true);
      if (isOk(persisted)) {
        expect(persisted.value.skills).toHaveLength(1);
      }
    });
  });

  describe('originChecks', () => {
    it('reports update when the market hash moved and the disk copy was not edited', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns', 'cursor');
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
      await engine.install('obra/react-patterns', 'cursor');
      fs.writeFile('.cursor/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();

      const result = await engine.originChecks();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual([{ skillId: 'obra/react-patterns', status: 'edited' }]);
      }
    });
  });

  describe('updateFromMarket', () => {
    it('overwrites an unedited copy and refreshes originHash', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns', 'cursor');
      npx.skillBody = '# from market\n';

      const result = await engine.updateFromMarket('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(fs.readFile('.cursor/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
      expect(result.value.originHash).toBe(result.value.hash);
      expect(result.value.originHash).not.toBeUndefined();
    });

    it('refuses to overwrite an edited copy unless replaceEdited is set', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      await engine.install('obra/react-patterns', 'cursor');
      fs.writeFile('.cursor/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();

      const blocked = await engine.updateFromMarket('obra/react-patterns');
      expect(isErr(blocked)).toBe(true);

      npx.skillBody = '# from market\n';
      const reset = await engine.updateFromMarket('obra/react-patterns', { replaceEdited: true });
      expect(isOk(reset)).toBe(true);
      expect(fs.readFile('.cursor/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# from market\n',
      });
    });

    it('does not delete the on-disk copy when the market fetch fails', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      engine.addToInbox('obra/react-patterns');
      await engine.install('obra/react-patterns', 'cursor');
      fs.writeFile('.cursor/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();
      npx.setInstallError(new Error('npx failed'));

      const result = await engine.updateFromMarket('obra/react-patterns', { replaceEdited: true });

      expect(isErr(result)).toBe(true);
      expect(fs.readFile('.cursor/skills/obra/react-patterns/SKILL.md')).toEqual({
        ok: true,
        value: '# edited locally\n',
      });
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
    });

    it('keeps the skill in Inbox after Reset and a follow-up scan', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      engine.addToInbox('obra/react-patterns');
      await engine.install('obra/react-patterns', 'cursor');
      fs.writeFile('.cursor/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
      engine.scan();
      npx.skillBody = '# from market\n';

      const reset = await engine.updateFromMarket('obra/react-patterns', { replaceEdited: true });
      expect(isOk(reset)).toBe(true);
      const scanned = engine.scan();
      expect(isOk(scanned)).toBe(true);

      expect(engine.inbox()).toEqual(['obra/react-patterns']);
      expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
      expect(fs.readFile('.cursor/skills/obra/react-patterns/SKILL.md')).toEqual({
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
    it('does not treat leftover getInstalled() as the catalog; install records deployedTo', async () => {
      skills.seedInstalled([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '2024-01-01T00:00:00.000Z' }]);
      const loadedEngine = new CollectionEngine(fs, skills);

      expect(loadedEngine.skills()).toEqual([]);

      await loadedEngine.install('addyosmani/performance-review', 'cursor');

      expect(loadedEngine.skills().map((s) => s.id)).toEqual(['addyosmani/performance-review']);
      expect(loadedEngine.skills()[0]?.deployedTo).toEqual([
        expect.objectContaining({ ide: 'cursor' }),
      ]);
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
      const loadedEngine = new CollectionEngine(fs, skills);

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
      expect(engine.skills()).toEqual([]);
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

  describe('file', () => {
    it('files an inbox ID onto an existing command and keeps it in Inbox', () => {
      engine.create('frontend', []);
      engine.addToInbox('obra/react-patterns');

      const result = engine.file('obra/react-patterns', 'frontend');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.skills).toEqual(['obra/react-patterns']);
      }
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
      expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
      expect(skills.getInstalled()).toEqual([]);
      expect(engine.skills()).toEqual([]);
    });

    it('keeps the ID in Inbox when the command already has it', () => {
      engine.create('frontend', ['obra/react-patterns']);
      engine.addToInbox('obra/react-patterns');

      const result = engine.file('obra/react-patterns', 'frontend');

      expect(isOk(result)).toBe(true);
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
      expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
    });

    it('files onto /build when the stored name is build', () => {
      engine.create('/build', []);
      engine.addToInbox('tdd');

      const result = engine.file('tdd', '/build');

      expect(isOk(result)).toBe(true);
      expect(engine.list()[0]?.name).toBe('build');
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
    });

    it('returns an error and leaves state unchanged when the collection is missing', () => {
      engine.addToInbox('obra/react-patterns');

      const result = engine.file('obra/react-patterns', 'frontend');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Command 'frontend' not found");
      }
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
    });

    it('returns an error and leaves state unchanged when the ID is not in inbox', () => {
      engine.create('frontend', []);

      const result = engine.file('obra/react-patterns', 'frontend');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/inbox/i);
      }
      expect(engine.list()[0]?.skills).toEqual([]);
      expect(engine.inbox()).toEqual([]);
    });

    it('leaves inbox and the command unchanged when persisting fails', () => {
      engine.create('frontend', []);
      engine.addToInbox('obra/react-patterns');
      fs.setWriteError(new Error('Disk full'));

      const result = engine.file('obra/react-patterns', 'frontend');

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

    it('does not mint a second catalog id for an npx leftover short folder', async () => {
      const npx = new NpxLayoutSkillsAdapter(fs);
      engine = new CollectionEngine(fs, npx);
      engine.addToInbox('obra/react-patterns');
      await engine.install('obra/react-patterns', 'cursor');
      fs.writeFile('.agents/skills/react-patterns/SKILL.md', '# react-patterns\n');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.added).not.toContain('react-patterns');
      }
      expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
      expect(engine.inbox()).toEqual(['obra/react-patterns']);
      expect(engine.skills()[0]?.paths).toEqual([
        '.cursor/skills/obra/react-patterns',
        '.agents/skills/react-patterns',
      ]);
    });

    it('keeps a filed command map on re-scan and reports gone ids', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.file('tdd', 'build');

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
      expect(reloaded.inbox()).toEqual(['tdd']);
      expect(reloaded.skills().map((s) => s.id)).toEqual(['tdd']);
    });

    it('succeeds when skill trees are missing and ignores commands/ files', () => {
      fs.writeFile('.cursor/commands/build.md', '# not a skill');

      const result = engine.scan();

      expect(result).toEqual({ ok: true, value: { added: [], gone: [], changed: [], commandPulls: [] } });
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
      const loaded = new CollectionEngine(fs, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' },
      ]);
      expect(loaded.skills()).toEqual([]);
    });

    it('treats same-hash path change as a rename, not gone plus added', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', []);
      engine.addToInbox('tdd');
      engine.file('tdd', 'build');

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

    it('does not adopt stamp extra ids into the map', () => {
      engine.create('build', ['tdd']);
      fs.writeFile(
        '.claude/commands/build.md',
        `---
name: /build
skills:
  - tdd
  - design
generated_by: skil
generated_at: 2026-08-24T00:00:00.000Z
---

1. Use the skills listed in frontmatter when they apply.
2. Do not invent extra required steps.
`
      );

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.commandPulls).toEqual([{ ide: 'claude', name: 'build' }]);
      }
      expect(engine.list().find((command) => command.name === 'build')?.skills).toEqual(['tdd']);
      const claudeStamp = fs.readFile('.claude/commands/build.md');
      expect(isOk(claudeStamp)).toBe(true);
      if (isOk(claudeStamp)) {
        expect(claudeStamp.value).toContain('generated_at: 2026-08-24T00:00:00.000Z');
        expect(claudeStamp.value).toContain('- design');
      }
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
      expect(engine.inbox()).toEqual([]);
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
      expect(engine.inbox().sort()).toEqual(['build/lint', 'build/ui/shadcn']);
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

    it('unfiles the id and rewrites existing stamps', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.file('tdd', 'build');
      engine.file('design', 'build');
      await engine.exportCommand('build', 'cursor');
      await engine.exportCommand('build', 'claude');

      const result = engine.deleteSkill('tdd');

      expect(isOk(result)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['design']);
      const cursorStamp = fs.readFile('.cursor/commands/build.md');
      expect(isOk(cursorStamp)).toBe(true);
      if (isOk(cursorStamp)) {
        expect(cursorStamp.value).toContain('design');
        expect(cursorStamp.value).not.toMatch(/^\s*-\s*tdd\s*$/m);
      }
      const claudeStamp = fs.readFile('.claude/commands/build.md');
      expect(isOk(claudeStamp)).toBe(true);
      if (isOk(claudeStamp)) {
        expect(claudeStamp.value).not.toMatch(/^\s*-\s*tdd\s*$/m);
      }
    });

    it('drops a market inbox id without touching disk', () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.addToInbox('obra/react-patterns');

      const result = engine.deleteSkill('obra/react-patterns');

      expect(isOk(result)).toBe(true);
      expect(engine.inbox()).toEqual(['tdd']);
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
    });

    it('is a no-op when the id is unknown', () => {
      const result = engine.deleteSkill('missing');

      expect(isOk(result)).toBe(true);
      expect(engine.skills()).toEqual([]);
      expect(engine.inbox()).toEqual([]);
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
      expect(engine.inbox()).toEqual(['tdd']);
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
      engine.addToInbox('obra/react-patterns');

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

      const result = engine.create('build', ['design'], undefined, 'claude');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain("Command 'build' already exists");
      }
      expect(engine.list()).toEqual([expect.objectContaining({ name: 'build', skills: ['tdd'] })]);
    });

    it('file and removeSkill update the one list; Inbox is unchanged', () => {
      engine.create('build', []);
      engine.addToInbox('tdd');
      engine.addToInbox('design');

      const filed = engine.file('tdd', 'build', 'cursor');
      expect(isOk(filed)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
      expect(engine.inbox()).toEqual(['tdd', 'design']);

      engine.removeSkill('build', 'tdd', 'claude');
      expect(engine.list()[0]?.skills).toEqual([]);
      expect(engine.inbox()).toEqual(['tdd', 'design']);
    });

    it('delete drops the command for the whole project', () => {
      engine.create('build', ['tdd']);

      const result = engine.delete('build', 'cursor');

      expect(isOk(result)).toBe(true);
      expect(engine.list()).toEqual([]);
    });

    it('loads v4 skills[] as the project list', () => {
      fs.writeJSON(STATE_PATH, {
        commands: [{ name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' }],
        skills: [],
        inbox: [],
        version: '4.0',
      });
      const loaded = new CollectionEngine(fs, skills);

      expect(loaded.list()).toEqual([
        { name: 'build', skills: ['tdd'], createdAt: '2024-01-01T00:00:00.000Z' },
      ]);
    });
  });

  describe('copyTo', () => {
    it('writes the same list to Claude without rewriting a Cursor stamp', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', ['tdd']);
      await engine.exportCommand('build', 'cursor');
      const cursorStamp = fs.readFile('.cursor/commands/build.md');
      expect(isOk(cursorStamp)).toBe(true);

      const result = await engine.copyTo('build', 'cursor', 'claude');

      expect(isOk(result)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
      const claudeFile = fs.readFile('.claude/commands/build.md');
      expect(isOk(claudeFile)).toBe(true);
      if (isOk(claudeFile)) {
        expect(claudeFile.value).toContain('generated_by: skil');
        expect(claudeFile.value).toContain('tdd');
      }
      const after = fs.readFile('.cursor/commands/build.md');
      expect(after).toEqual(cursorStamp);
    });

    it('writes the same skills list to Claude with a default command body', async () => {
      engine.create('build', ['tdd']);

      const result = await engine.copyTo('build', 'cursor', 'claude');

      expect(isOk(result)).toBe(true);
      const written = fs.readFile('.claude/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('generated_by: skil');
        expect(written.value).toContain('- tdd');
        expect(written.value).toContain('<!-- Describe what this command is for. -->');
      }
      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
    });

    it('refuses an unstamped dest file unless replace is true', async () => {
      engine.create('build', ['tdd']);
      fs.writeFile('.claude/commands/build.md', '# leftover\n');

      const refused = await engine.copyTo('build', 'cursor', 'claude');

      expect(isErr(refused)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
      expect(fs.readFile('.claude/commands/build.md')).toEqual({ ok: true, value: '# leftover\n' });

      const replaced = await engine.copyTo('build', 'cursor', 'claude', { replace: true });
      expect(isOk(replaced)).toBe(true);
      const written = fs.readFile('.claude/commands/build.md');
      expect(isOk(written)).toBe(true);
      if (isOk(written)) {
        expect(written.value).toContain('generated_by: skil');
        expect(written.value).toContain('tdd');
        expect(written.value).not.toContain('# leftover');
      }
    });
  });

  describe('write-through', () => {
    it('does not create a stamp until export', () => {
      engine.create('build', []);
      engine.addToInbox('tdd');
      engine.file('tdd', 'build', 'cursor');

      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(isErr(fs.readFile('.claude/commands/build.md'))).toBe(true);
    });

    it('files rewrite existing stamps on every dock with the same list', async () => {
      engine.create('build', []);
      await engine.exportCommand('build', 'cursor');
      await engine.exportCommand('build', 'claude');
      engine.addToInbox('tdd');
      engine.file('tdd', 'build');

      const cursorFile = fs.readFile('.cursor/commands/build.md');
      expect(isOk(cursorFile)).toBe(true);
      if (isOk(cursorFile)) {
        expect(cursorFile.value).toContain('tdd');
        expect(cursorFile.value).toContain('generated_by: skil');
      }
      const claudeFile = fs.readFile('.claude/commands/build.md');
      expect(isOk(claudeFile)).toBe(true);
      if (isOk(claudeFile)) {
        expect(claudeFile.value).toContain('tdd');
      }
    });

    it('delete removes our stamps on every dock', async () => {
      engine.create('build', ['tdd']);
      await engine.exportCommand('build', 'cursor');
      await engine.exportCommand('build', 'claude');
      expect(isOk(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(isOk(fs.readFile('.claude/commands/build.md'))).toBe(true);

      engine.delete('build');

      expect(isErr(fs.readFile('.cursor/commands/build.md'))).toBe(true);
      expect(isErr(fs.readFile('.claude/commands/build.md'))).toBe(true);
    });

    it('leaves an unstamped Cursor command file alone', () => {
      fs.writeFile('.cursor/commands/build.md', '# leftover\n');
      engine.create('build', ['tdd']);
      engine.addToInbox('design');
      engine.file('design', 'build', 'cursor');

      expect(fs.readFile('.cursor/commands/build.md')).toEqual({ ok: true, value: '# leftover\n' });
      expect(engine.list()[0]?.skills).toEqual(['tdd', 'design']);
    });

    it('does not rewrite a stamp on scan when the map is unchanged', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      engine.create('build', ['tdd']);
      await engine.exportCommand('build', 'cursor');
      const before = fs.readFile('.cursor/commands/build.md');

      engine.scan();

      expect(fs.readFile('.cursor/commands/build.md')).toEqual(before);
      expect(engine.lastWrittenPaths()).toEqual([]);
    });

    it('rewrites a stamp on scan when gone-id cleanup changed the list', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
      engine.scan();
      engine.create('build', []);
      engine.file('tdd', 'build');
      engine.file('design', 'build');
      await engine.exportCommand('build', 'cursor');
      fs.removeFile('.cursor/skills/design/SKILL.md');

      const result = engine.scan();

      expect(isOk(result)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
      expect(engine.lastWrittenPaths()).toContain('.cursor/commands/build.md');
      const stamp = fs.readFile('.cursor/commands/build.md');
      expect(isOk(stamp)).toBe(true);
      if (isOk(stamp)) {
        expect(stamp.value).toContain('tdd');
        expect(stamp.value).not.toMatch(/^\s*-\s*design\s*$/m);
      }
    });
  });

  describe('importFrom', () => {
    const SOURCE = '/tmp/other-project';

    function sourceFile(relative: string, contents: string): void {
      fs.writeFile(`${SOURCE}/${relative}`, contents);
    }

    function stampedCommand(name: string, skillIds: string[], goal = 'from the other project'): string {
      const skillLines =
        skillIds.length === 0 ? 'skills: []' : `skills:\n${skillIds.map((id) => `  - ${id}`).join('\n')}`;
      return `---
name: /${name}
${skillLines}
generated_by: skil
generated_at: 2026-08-24T00:00:00.000Z
---

## Goal
${goal}
`;
    }

    it('copies missing skills and stamped commands onto this project', async () => {
      sourceFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      sourceFile('.cursor/commands/build.md', stampedCommand('build', ['tdd']));
      sourceFile('.claude/skills/ui/SKILL.md', '# ui\n');
      sourceFile('.claude/commands/review.md', stampedCommand('review', ['ui']));

      const result = await engine.importFrom(SOURCE, 'cursor');

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(engine.inbox()).toEqual(['tdd']);
      expect(engine.list().find((command) => command.name === 'build')?.skills).toEqual(['tdd']);
      expect(isErr(fs.readFile('.claude/skills/ui/SKILL.md'))).toBe(true);
      expect(engine.list().map((command) => command.name)).toEqual(['build']);
      const destStamp = fs.readFile('.cursor/commands/build.md');
      expect(isOk(destStamp)).toBe(true);
      if (isOk(destStamp)) {
        expect(destStamp.value).toContain('from the other project');
      }
    });

    it('imports a skil command whose frontmatter lost the closing fence', async () => {
      sourceFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      sourceFile('.cursor/commands/research.md', stampedCommand('research', ['tdd']));
      sourceFile(
        '.cursor/commands/plan.md',
        `---

## name: /plan

skills:

- productivity/diagram-maker
- philosophy/tdd
- design/codebase-design
- design/to-tasks
generated_by: skil
generated_at: 2026-08-26T05:49:28.896Z

## Goal

Turn the spec into architecture and a small task list.
`
      );

      const result = await engine.importFrom(SOURCE, 'cursor');

      expect(isOk(result)).toBe(true);
      expect(engine.list().map((command) => command.name).sort()).toEqual(['plan', 'research']);
      expect(engine.list().find((command) => command.name === 'plan')?.skills).toEqual([
        'productivity/diagram-maker',
        'philosophy/tdd',
        'design/codebase-design',
        'design/to-tasks',
      ]);
      const dest = fs.readFile('.cursor/commands/plan.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toMatch(/^---\nname: \/plan\n/);
        expect(dest.value).toContain('\n---\n');
        expect(dest.value).not.toContain('## name:');
        expect(dest.value).toContain('Turn the spec into architecture and a small task list.');
        expect(dest.value).not.toContain('<!-- Describe what this command is for. -->');
      }
    });

    it('heals a broken dest stamp on replace import instead of pasting ## name into the body', async () => {
      engine.create('plan', ['tdd']);
      sourceFile(
        '.cursor/commands/plan.md',
        `---

## name: /plan

skills:

- philosophy/tdd
generated_by: skil
generated_at: 2026-08-26T05:49:28.896Z

## Goal

Turn the spec into architecture and a small task list.
`
      );

      const result = await engine.importFrom(SOURCE, 'cursor', { replace: true });

      expect(isOk(result)).toBe(true);
      const dest = fs.readFile('.cursor/commands/plan.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toMatch(/^---\nname: \/plan\n/);
        expect(dest.value).not.toContain('## name:');
        expect(dest.value).toContain('Turn the spec into architecture and a small task list.');
        expect(dest.value).not.toContain('<!-- Describe what this command is for. -->');
      }
    });

    it('does not adopt a stamp that is not on the map', () => {
      fs.writeFile(
        '.cursor/commands/plan.md',
        `---

## name: /plan

skills:

- philosophy/tdd
generated_by: skil
generated_at: 2026-08-26T05:49:28.896Z

## Goal

Turn the spec into architecture and a small task list.
`
      );

      const scanned = engine.scan();

      expect(isOk(scanned)).toBe(true);
      expect(engine.list()).toEqual([]);
      const dest = fs.readFile('.cursor/commands/plan.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toContain('## name: /plan');
      }
    });

    it('ignores unstamped source commands and source inbox state', async () => {
      sourceFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      sourceFile('.cursor/commands/planning.md', '# leftover\n');
      fs.writeJSON(`${SOURCE}/.skil/state.json`, {
        version: '5.0',
        commands: [],
        skills: [],
        inbox: ['obra/react-patterns'],
      });

      const result = await engine.importFrom(SOURCE, 'cursor');

      expect(isOk(result)).toBe(true);
      expect(engine.inbox()).toEqual(['tdd']);
      expect(engine.list()).toEqual([]);
      expect(isErr(fs.readFile('.cursor/commands/planning.md'))).toBe(true);
    });

    it('errors when dest already has a different skill body unless replace is set', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# dest tdd\n');
      engine.scan();
      sourceFile('.cursor/skills/tdd/SKILL.md', '# source tdd\n');

      const blocked = await engine.importFrom(SOURCE, 'cursor');

      expect(isErr(blocked)).toBe(true);
      if (isErr(blocked)) {
        expect(blocked.code).toBe('IMPORT_CONFLICT');
        expect(blocked.labels).toEqual(['tdd']);
      }
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# dest tdd\n' });

      const replaced = await engine.importFrom(SOURCE, 'cursor', { replace: true });

      expect(isOk(replaced)).toBe(true);
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# source tdd\n' });
    });

    it('leaves a same-hash dest skill alone and still adds new skills', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      engine.scan();
      sourceFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      sourceFile('.cursor/skills/design/SKILL.md', '# design\n');

      const result = await engine.importFrom(SOURCE, 'cursor');

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
      expect(fs.readFile('.cursor/skills/design/SKILL.md')).toEqual({ ok: true, value: '# design\n' });
      expect(engine.inbox().sort()).toEqual(['design', 'tdd']);
    });

    it('errors when dest already has the command unless replace is set', async () => {
      engine.create('build', ['design']);
      sourceFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
      sourceFile('.cursor/commands/build.md', stampedCommand('build', ['tdd']));

      const blocked = await engine.importFrom(SOURCE, 'cursor');

      expect(isErr(blocked)).toBe(true);
      if (isErr(blocked)) {
        expect(blocked.code).toBe('IMPORT_CONFLICT');
        expect(blocked.labels).toEqual(['/build']);
      }
      expect(engine.list()[0]?.skills).toEqual(['design']);

      const replaced = await engine.importFrom(SOURCE, 'cursor', { replace: true });

      expect(isOk(replaced)).toBe(true);
      expect(engine.list()[0]?.skills).toEqual(['tdd']);
    });

    it('refuses an unstamped dest command file unless replace is set', async () => {
      fs.writeFile('.cursor/commands/build.md', '# leftover\n');
      sourceFile('.cursor/commands/build.md', stampedCommand('build', []));

      const blocked = await engine.importFrom(SOURCE, 'cursor');

      expect(isErr(blocked)).toBe(true);
      if (isErr(blocked)) {
        expect(blocked.code).toBe('IMPORT_CONFLICT');
        expect(blocked.labels).toEqual(['/build']);
      }
      expect(fs.readFile('.cursor/commands/build.md')).toEqual({ ok: true, value: '# leftover\n' });

      const replaced = await engine.importFrom(SOURCE, 'cursor', { replace: true });

      expect(isOk(replaced)).toBe(true);
      const dest = fs.readFile('.cursor/commands/build.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toContain('generated_by: skil');
      }
    });

    it('copies missing rules from the source dock', async () => {
      sourceFile('.cursor/rules/pair-programming/behavior.mdc', '---\nalwaysApply: true\n---\n# behavior\n');
      sourceFile('AGENTS.md', '# agents from source\n');

      const result = await engine.importFrom(SOURCE, 'cursor');

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.cursor/rules/pair-programming/behavior.mdc')).toEqual({
        ok: true,
        value: '---\nalwaysApply: true\n---\n# behavior\n',
      });
      expect(fs.readFile('AGENTS.md')).toEqual({ ok: true, value: '# agents from source\n' });
      expect(engine.rules().map((rule) => rule.id).sort()).toEqual([
        '.cursor/rules/pair-programming/behavior.mdc',
        'AGENTS.md',
      ]);
    });

    it('refuses import when dest rules already differ, then replaces', async () => {
      sourceFile('.cursor/rules/behavior.mdc', '# source\n');
      fs.writeFile('.cursor/rules/behavior.mdc', '# dest\n');

      const blocked = await engine.importFrom(SOURCE, 'cursor');
      expect(isErr(blocked)).toBe(true);
      if (isErr(blocked)) {
        expect(blocked.code).toBe('IMPORT_CONFLICT');
        expect(blocked.labels).toEqual(['behavior']);
      }
      expect(fs.readFile('.cursor/rules/behavior.mdc')).toEqual({ ok: true, value: '# dest\n' });

      const replaced = await engine.importFrom(SOURCE, 'cursor', { replace: true });
      expect(isOk(replaced)).toBe(true);
      expect(fs.readFile('.cursor/rules/behavior.mdc')).toEqual({ ok: true, value: '# source\n' });
    });

    it('errors when the source has no skills, stamped commands, or rules', async () => {
      sourceFile('.cursor/commands/planning.md', '# leftover\n');

      const result = await engine.importFrom(SOURCE, 'cursor');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/nothing to import/i);
      }
    });

    it('errors when sourceRoot is this project', async () => {
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      const result = await engine.importFrom('.', 'cursor');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/itself/i);
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
      expect(engine.inbox()).toEqual(['tdd']);
    });
  });

  describe('rules', () => {
    it('lists cursor, claude, copilot, and root rule files without putting them in Inbox', () => {
      fs.writeFile(
        '.cursor/rules/pair-programming/behavior.mdc',
        '---\nalwaysApply: true\n---\n# behavior\n'
      );
      fs.writeFile('.cursor/rules/optional.mdc', '---\nalwaysApply: false\n---\n# optional\n');
      fs.writeFile('.claude/rules/review.md', '# review\n');
      fs.writeFile('CLAUDE.md', '# claude root\n');
      fs.writeFile('AGENTS.md', '# agents\n');
      fs.writeFile('.github/copilot-instructions.md', '# copilot always\n');
      fs.writeFile(
        '.github/instructions/typescript.instructions.md',
        '---\napplyTo: "**/*.ts"\n---\n# ts\n'
      );
      fs.writeFile('.windsurf/rules/style.md', '# style\n');
      fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

      engine.scan();

      expect(engine.inbox()).toEqual(['tdd']);
      const rules = engine.rules();
      expect(rules).toHaveLength(8);
      expect(rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: '.cursor/rules/pair-programming/behavior.mdc',
            name: 'pair-programming/behavior',
            dock: 'cursor',
            alwaysApply: true,
          }),
          expect.objectContaining({
            id: '.cursor/rules/optional.mdc',
            name: 'optional',
            dock: 'cursor',
            alwaysApply: false,
          }),
          expect.objectContaining({
            id: '.claude/rules/review.md',
            name: 'review',
            dock: 'claude',
            alwaysApply: true,
          }),
          expect.objectContaining({
            id: 'CLAUDE.md',
            name: 'CLAUDE',
            dock: 'claude',
            alwaysApply: true,
          }),
          expect.objectContaining({
            id: 'AGENTS.md',
            name: 'AGENTS',
            dock: 'agents',
            alwaysApply: true,
          }),
          expect.objectContaining({
            id: '.github/copilot-instructions.md',
            name: 'copilot-instructions',
            dock: 'copilot',
            alwaysApply: true,
          }),
          expect.objectContaining({
            id: '.github/instructions/typescript.instructions.md',
            name: 'typescript',
            dock: 'copilot',
            alwaysApply: false,
          }),
          expect.objectContaining({
            id: '.windsurf/rules/style.md',
            name: 'style',
            dock: 'windsurf',
            alwaysApply: false,
          }),
        ])
      );
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

    it('writes alwaysApply on a cursor rule and leaves other files alone', () => {
      fs.writeFile(
        '.cursor/rules/behavior.mdc',
        '---\ndescription: pair\nalwaysApply: false\n---\n# body\n'
      );
      fs.writeFile('.claude/rules/review.md', '# other rule\n');

      const result = engine.setAlwaysApply('.cursor/rules/behavior.mdc', true);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.alwaysApply).toBe(true);
      }
      expect(fs.readFile('.cursor/rules/behavior.mdc')).toEqual({
        ok: true,
        value: '---\ndescription: pair\nalwaysApply: true\n---\n# body\n',
      });
      expect(fs.readFile('.claude/rules/review.md')).toEqual({ ok: true, value: '# other rule\n' });
    });

    it('writes alwaysApply on every dock copy of the same rule', () => {
      fs.writeFile(
        '.cursor/rules/pair-programming/behavior.mdc',
        '---\nalwaysApply: true\n---\n# body\n'
      );
      fs.writeFile('.claude/rules/pair-programming/behavior.md', '---\nalwaysApply: true\n---\n# body\n');

      const result = engine.setAlwaysApply('.cursor/rules/pair-programming/behavior.mdc', false);

      expect(isOk(result)).toBe(true);
      expect(fs.readFile('.cursor/rules/pair-programming/behavior.mdc')).toEqual({
        ok: true,
        value: '---\nalwaysApply: false\n---\n# body\n',
      });
      expect(fs.readFile('.claude/rules/pair-programming/behavior.md')).toEqual({
        ok: true,
        value: '---\nalwaysApply: false\n---\n# body\n',
      });
    });

    it('refuses to toggle alwaysApply on a root always-on file', () => {
      fs.writeFile('CLAUDE.md', '# claude\n');

      const result = engine.setAlwaysApply('CLAUDE.md', false);

      expect(isErr(result)).toBe(true);
      expect(fs.readFile('CLAUDE.md')).toEqual({ ok: true, value: '# claude\n' });
    });

    it('does not list the same rule twice after export to another dock', async () => {
      fs.writeFile(
        '.cursor/rules/pair-programming/behavior.mdc',
        '---\nalwaysApply: true\n---\n# behavior\n'
      );

      const exported = await engine.exportRules('claude');
      expect(isOk(exported)).toBe(true);
      const dest = fs.readFile('.claude/rules/pair-programming/behavior.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toContain('generated_by: skil');
        expect(dest.value).toContain('id: pair-programming/behavior');
        expect(dest.value).toContain('alwaysApply: true');
        expect(dest.value).toContain('# behavior');
      }

      expect(engine.rules()).toEqual([
        expect.objectContaining({
          id: '.cursor/rules/pair-programming/behavior.mdc',
          name: 'pair-programming/behavior',
          path: '.cursor/rules/pair-programming/behavior.mdc',
          dock: 'cursor',
          alwaysApply: true,
        }),
      ]);
    });

    it('exports every scanned rule into the dest dock rules dir', async () => {
      fs.writeFile(
        '.cursor/rules/pair-programming/behavior.mdc',
        '---\nalwaysApply: true\n---\n# behavior\n'
      );
      fs.writeFile('CLAUDE.md', '# claude root\n');
      fs.writeFile('.claude/rules/review.md', '# review\n');

      const result = await engine.exportRules('cursor');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.failures).toEqual([]);
        expect(result.value.succeeded).toEqual(['.cursor/rules/review.mdc']);
      }
      expect(isErr(fs.readFile('.cursor/rules/CLAUDE.mdc'))).toBe(true);
      expect(fs.readFile('CLAUDE.md')).toEqual({ ok: true, value: '# claude root\n' });
      const review = fs.readFile('.cursor/rules/review.mdc');
      expect(isOk(review)).toBe(true);
      if (isOk(review)) {
        expect(review.value).toContain('generated_by: skil');
        expect(review.value).toContain('# review');
      }
      expect(fs.readFile('.cursor/rules/pair-programming/behavior.mdc')).toEqual({
        ok: true,
        value: '---\nalwaysApply: true\n---\n# behavior\n',
      });
    });

    it('refuses export when dest rule files already differ, then replaces', async () => {
      fs.writeFile('.cursor/rules/behavior.mdc', '# new\n');
      fs.writeFile('.claude/rules/behavior.md', '# old\n');

      const blocked = await engine.exportRules('claude');
      expect(isErr(blocked)).toBe(true);
      if (isErr(blocked)) {
        expect(blocked.code).toBe('RULE_EXPORT_CONFLICT');
        expect(blocked.labels).toEqual(['behavior']);
      }
      expect(fs.readFile('.claude/rules/behavior.md')).toEqual({ ok: true, value: '# old\n' });

      const replaced = await engine.exportRules('claude', { replace: true });
      expect(isOk(replaced)).toBe(true);
      const dest = fs.readFile('.claude/rules/behavior.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toContain('generated_by: skil');
        expect(dest.value).toContain('# new');
      }
    });

    it('errors when there are no rules to export', async () => {
      const result = await engine.exportRules('cursor');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/no rules to export/i);
      }
    });

    it('exports folder rules into AGENTS.md when Codex has no existing root file', async () => {
      fs.writeFile('.cursor/rules/pair-programming/behavior.mdc', '# behavior\n');
      fs.writeFile('.cursor/rules/pair-programming/format.mdc', '# format\n');

      const result = await engine.exportRules('codex');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.failures).toEqual([]);
        expect(result.value.succeeded).toEqual([
          '.codex/rules/pair-programming/behavior.md',
          '.codex/rules/pair-programming/format.md',
          'AGENTS.md',
        ]);
      }
      expect(isOk(fs.readFile('.codex/rules/pair-programming/behavior.md'))).toBe(true);
      expect(isOk(fs.readFile('.codex/rules/pair-programming/format.md'))).toBe(true);
      const dest = fs.readFile('AGENTS.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toContain('<!-- skil:rule pair-programming/behavior -->');
        expect(dest.value).toContain('<!-- skil:rule pair-programming/format -->');
        expect(dest.value).toContain('generated_by: skil');
      }
    });

    it('exports folder rules into .agents/rules and AGENTS.md', async () => {
      fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');

      const result = await engine.exportRules('agents');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.failures).toEqual([]);
        expect(result.value.succeeded).toEqual(['.agents/rules/behavior.md', 'AGENTS.md']);
      }
      const folder = fs.readFile('.agents/rules/behavior.md');
      expect(isOk(folder)).toBe(true);
      if (isOk(folder)) {
        expect(folder.value).toContain('generated_by: skil');
        expect(folder.value).toContain('# behavior');
      }
      const root = fs.readFile('AGENTS.md');
      expect(isOk(root)).toBe(true);
      if (isOk(root)) {
        expect(root.value).toContain('<!-- skil:rule behavior -->');
      }
    });

    it('reports dest paths on a second Codex export instead of an empty success', async () => {
      fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
      await engine.exportRules('codex');

      const again = await engine.exportRules('codex');

      expect(isOk(again)).toBe(true);
      if (isOk(again)) {
        expect(again.value.failures).toEqual([]);
        expect(again.value.succeeded).toEqual(['.codex/rules/behavior.md', 'AGENTS.md']);
      }
    });

    it('exports folder rules into AGENTS.md for Codex and writes a dock folder copy', async () => {
      fs.writeFile('AGENTS.md', '# agents\n');
      fs.writeFile('.cursor/rules/pair-programming/behavior.mdc', '# behavior\n');

      const result = await engine.exportRules('codex', { dest: '/tmp/out' });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.failures).toEqual([]);
        expect(result.value.succeeded).toEqual([
          '/tmp/out/.codex/rules/pair-programming/behavior.md',
          '/tmp/out/AGENTS.md',
        ]);
      }
      const folder = fs.readFile('/tmp/out/.codex/rules/pair-programming/behavior.md');
      expect(isOk(folder)).toBe(true);
      if (isOk(folder)) {
        expect(folder.value).toContain('# behavior');
        expect(folder.value).toContain('generated_by: skil');
      }
      const dest = fs.readFile('/tmp/out/AGENTS.md');
      expect(isOk(dest)).toBe(true);
      if (isOk(dest)) {
        expect(dest.value).toContain('# agents');
        expect(dest.value).toContain('<!-- skil:rule pair-programming/behavior -->');
        expect(dest.value).toContain('generated_by: skil');
        expect(dest.value).toContain('# behavior');
      }
    });
  });
});
