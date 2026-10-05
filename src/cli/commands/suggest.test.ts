import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { err, ok } from '../../core/result.js';
import type { Discover } from '../../backend/discover.js';
import type { LlmChat } from '../../llm/llm-chat.js';
import type { ShelfRole } from '../../backend/market-types.js';
import { createProgram } from '../program.js';
import { runSuggest } from './suggest.js';

const SHELVES: ShelfRole[] = [
  {
    slug: 'swe',
    label: 'SWE',
    fields: [
      {
        slug: 'frontend',
        label: 'Frontend',
        skills: [{ id: 'obra/react-patterns', name: 'React patterns', installs: 1200, rank: 1 }],
      },
    ],
  },
];

function fakeDiscover(shelves = SHELVES): Discover {
  return {
    shelves: async () => ok(shelves),
    suggested: async () => ok({ updatedAt: '', roles: [] }),
    search: async () => ok([]),
    preview: async () => err(new Error('unused')),
    browse: async () => ok([]),
    creators: async () => ok([]),
    creator: async () => err(new Error('unused')),
  };
}

function buildEngine(llmChat?: LlmChat): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemorySkillsAdapter(), undefined, undefined, llmChat);
}

describe('runSuggest', () => {
  it('prints a shortlist table when a key is set', async () => {
    const engine = buildEngine({ complete: async () => ok(JSON.stringify({ ids: ['obra/react-patterns'] })) });

    const outcome = await runSuggest(engine, fakeDiscover());

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(outcome.message).not.toMatch(/editorial picks/i);
  });

  it('prints editorial picks with a no-key note when no key is set', async () => {
    const engine = buildEngine();

    const outcome = await runSuggest(engine, fakeDiscover());

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/editorial picks/i);
    expect(outcome.message).toContain('SKIL_LLM_PROVIDER');
    expect(outcome.message).toContain('mattpocock/skills/improve-codebase-architecture');
  });

  it('uses ids from /api/market/suggested when the role block is present', async () => {
    const engine = buildEngine();
    const discover: Discover = {
      ...fakeDiscover(),
      suggested: async () =>
        ok({
          updatedAt: '2026-03-09',
          roles: [
            {
              slug: 'swe',
              label: 'SWE',
              skills: [{ id: 'from/api', name: 'From API', installs: 1, rank: 1 }],
            },
          ],
        }),
    };

    const outcome = await runSuggest(engine, discover);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('from/api');
    expect(outcome.message).not.toContain('mattpocock/skills/improve-codebase-architecture');
  });

  it('reports a friendly error when the market index fails to load', async () => {
    const engine = buildEngine({ complete: async () => ok('{}') });
    const failingDiscover: Discover = { ...fakeDiscover(), shelves: async () => err(new Error('store_error')) };

    const outcome = await runSuggest(engine, failingDiscover);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).not.toContain('store_error');
  });

  it('shows a friendly message when a role has no editorial picks', async () => {
    const engine = buildEngine({ complete: async () => ok(JSON.stringify({ ids: [] })) });

    const outcome = await runSuggest(engine, fakeDiscover(), { role: 'data' });

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/no suggestions/i);
  });
});

describe('registerSuggestCommand', () => {
  it('registers suggest on the program', () => {
    const program = createProgram(buildEngine());
    expect(program.commands.some((command) => command.name() === 'suggest')).toBe(true);
  });
});
