import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { ok } from '../../core/result.js';
import type { ISkillsAdapter } from '../../interfaces/adapters.js';
import { runSearch } from './search.js';

function buildEngine(skills: ISkillsAdapter = new InMemorySkillsAdapter()): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), skills);
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
      install: async () => ok(undefined),
      convert: async () => ok(undefined),
      getInstalled: () => [],
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
});
