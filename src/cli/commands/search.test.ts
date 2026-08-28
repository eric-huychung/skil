import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { ok } from '../../core/result.js';
import type { ISkillsAdapter } from '../../interfaces/adapters.js';
import type { Skill } from '../../types/index.js';
import { createProgram } from '../program.js';
import { runSearch } from './search.js';

function buildEngine(skills: ISkillsAdapter = new InMemorySkillsAdapter()): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), skills);
}

function elevenBrowseHits(): Skill[] {
  return Array.from({ length: 11 }, (_, index) => ({
    id: `skill/${index}`,
    source: 'skills.sh' as const,
    installedAt: '',
    installs: 100 - index,
  }));
}

describe('runSearch', () => {
  it('lists matching skills', async () => {
    const engine = buildEngine();

    const outcome = await runSearch(engine, 'react');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
  });

  it('shows a friendly message when no skills match', async () => {
    const engine = buildEngine({
      search: async () => ok([]),
      browse: async () => ok([]),
      install: async () => ok(undefined),
      convert: async () => ok(undefined),
      getInstalled: () => [],
      skillHash: async () => ok(null),
    });

    const outcome = await runSearch(engine, 'nonexistent');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("No skills found for 'nonexistent'");
  });

  it('reports an error when the search fails', async () => {
    const skills = new InMemorySkillsAdapter();
    skills.setSearchError(new Error('network unreachable'));
    const engine = buildEngine(skills);

    const outcome = await runSearch(engine, 'react');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('network unreachable');
  });

  it('lists the all-time leaderboard with install counts when query is empty', async () => {
    const engine = buildEngine();

    const outcome = await runSearch(engine, '');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(outcome.message).toContain('1200');
    expect(outcome.message).not.toContain('vercel-labs/security-review');
  });

  it('lists the trending leaderboard when --trending is set and query is empty', async () => {
    const engine = buildEngine();

    const outcome = await runSearch(engine, '', { trending: true });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('vercel-labs/security-review');
    expect(outcome.message).toContain('90');
    expect(outcome.message).not.toContain('obra/react-patterns');
  });

  it('ignores --trending and typed-searches when a query is given', async () => {
    const engine = buildEngine();

    const outcome = await runSearch(engine, 'react', { trending: true });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(outcome.message).not.toContain('vercel-labs/security-review');
  });

  it('shows at most 10 leaderboard rows', async () => {
    const engine = buildEngine({
      search: async () => ok([]),
      browse: async () => ok(elevenBrowseHits()),
      install: async () => ok(undefined),
      convert: async () => ok(undefined),
      getInstalled: () => [],
      skillHash: async () => ok(null),
    });

    const outcome = await runSearch(engine, '');

    expect(outcome.message).toContain('skill/0');
    expect(outcome.message).toContain('skill/9');
    expect(outcome.message).not.toContain('skill/10');
  });

  it('shows a friendly message when the leaderboard is empty', async () => {
    const engine = buildEngine({
      search: async () => ok([]),
      browse: async () => ok([]),
      install: async () => ok(undefined),
      convert: async () => ok(undefined),
      getInstalled: () => [],
      skillHash: async () => ok(null),
    });

    const outcome = await runSearch(engine, '');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe('No skills found on the all-time leaderboard');
  });

  it('reports an error when browse fails', async () => {
    const skills = new InMemorySkillsAdapter();
    skills.setBrowseError(new Error('leaderboard unreachable'));
    const engine = buildEngine(skills);

    const outcome = await runSearch(engine, '');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('leaderboard unreachable');
  });
});

describe('registerSearchCommand', () => {
  it('documents empty search and --trending in help text', () => {
    const program = createProgram(buildEngine());
    program.exitOverride();

    let output = '';
    program.configureOutput({ writeOut: (text) => { output += text; } });
    expect(() => program.parse(['search', '--help'], { from: 'user' })).toThrow();

    expect(output).toContain('--trending');
    expect(output).toMatch(/all-time|leaderboard/i);
  });
});
