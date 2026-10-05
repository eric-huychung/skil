import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarketDiscover, { clearDiscoverSuggestCache } from './MarketDiscover';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';
import { err, ok, type Result } from '../../../../../src/core/result.js';
import type { CreatorCard, CreatorDetail, MarketPreviewData, MarketSearchRow, ShelfRole, Skill, SuggestResult } from '../../../shared/ipc.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const SHELVES: ShelfRole[] = [
  {
    slug: 'swe',
    label: 'SWE',
    fields: [
      {
        slug: 'frontend',
        label: 'Frontend',
        skills: [
          { id: 'obra/react-patterns', name: 'obra/react-patterns', installs: 1200, rank: 1 },
          { id: 'addyosmani/performance-review', name: 'addyosmani/performance-review', installs: 300, rank: 2 },
        ],
      },
      {
        slug: 'backend',
        label: 'Backend',
        skills: [{ id: 'vercel-labs/security-review', name: 'vercel-labs/security-review', installs: 90, rank: 1 }],
      },
    ],
  },
  {
    slug: 'pm',
    label: 'PM',
    fields: [{ slug: 'roadmap', label: 'Roadmap', skills: [] }],
  },
];

const PREVIEW: MarketPreviewData = {
  id: 'obra/react-patterns',
  name: 'obra/react-patterns',
  installs: 1200,
  url: 'https://www.skills.sh/obra/react-patterns',
  installUrl: 'https://github.com/obra/react-patterns',
  installCommand: 'npx skills add obra/react-patterns',
  skillMd: '# React Patterns\n\nUse hooks.',
  audit: { status: 'pass' },
};

async function openLeaderboard() {
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Leaderboard' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Top' })).toHaveAttribute('aria-selected', 'true'));
}

const SUGGESTED = {
  updatedAt: '2026-03-09',
  roles: [
    {
      slug: 'swe',
      label: 'SWE',
      skills: [{ id: 'obra/react-patterns', name: 'React patterns', installs: 1200, rank: 1 }],
    },
    {
      slug: 'pm',
      label: 'PM',
      skills: [{ id: 'pick-pm', name: 'pick-pm', installs: 10, rank: 1 }],
    },
  ],
};

describe('MarketDiscover', () => {
  beforeEach(() => {
    clearDiscoverSuggestCache();
  });

  it('stays on Top and Trending when the market index is empty', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<MarketDiscover />, { bridge });

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Leaderboard' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Suggested' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'skills.sh' })).toHaveAttribute('href', 'https://skills.sh');
    await openLeaderboard();
    expect(screen.getByRole('tab', { name: 'Top' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'SWE' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
  });

  it('shows role and category chips with rank, name, and installs', async () => {
    const engine = createInMemoryEngine();
    const bridge = { ...createTestBridge(engine), marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES) };

    renderWithProviders(<MarketDiscover />, { bridge });

    await openLeaderboard();
    await userEvent.click(screen.getByRole('tab', { name: 'SWE' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Frontend' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'PM' })).toBeInTheDocument();
    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.getByText(/1\.2k/)).toBeInTheDocument();
  });

  it('switches rows when a different role, then category, is selected', async () => {
    const engine = createInMemoryEngine();
    const bridge = { ...createTestBridge(engine), marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES) };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();
    await userEvent.click(screen.getByRole('tab', { name: 'SWE' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Backend' }));
    await waitFor(() => expect(screen.getByText('vercel-labs/security-review')).toBeInTheDocument());
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'PM' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Roadmap' })).toBeInTheDocument());
    expect(screen.queryByText('vercel-labs/security-review')).not.toBeInTheDocument();
  });

  it('adds a skill by installing it into both live trees', async () => {
    const engine = createInMemoryEngine();
    const bridge = { ...createTestBridge(engine), marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES) };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument()
    );
    expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
    expect(engine.skills()[0]?.paths).toEqual(['.agents/skills/obra/react-patterns', '.claude/skills/obra/react-patterns']);
  });

  it('shows "+N more" on collapsed suite rows and searches the suite prefix on click', async () => {
    const engine = createInMemoryEngine();
    const searched: string[] = [];
    const suiteShelves: ShelfRole[] = [
      {
        slug: 'swe',
        label: 'SWE',
        fields: [
          {
            slug: 'cloud',
            label: 'Cloud',
            skills: [
              { id: 'microsoft/github-copilot-for-azure/azure-deploy', name: 'azure-deploy', installs: 900, rank: 1, moreCount: 4 },
              { id: 'vercel-labs/agent-skills/vercel-deploy', name: 'vercel-deploy', installs: 500, rank: 2 },
            ],
          },
        ],
      },
    ];
    const bridge = {
      ...createTestBridge(engine),
      marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(suiteShelves),
      marketSearch: async (query: string): Promise<Result<MarketSearchRow[]>> => {
        searched.push(query);
        return ok([{ id: 'microsoft/github-copilot-for-azure/azure-rbac', name: 'azure-rbac', installs: 400 }]);
      },
    };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();
    await userEvent.click(screen.getByRole('tab', { name: 'SWE' }));
    await waitFor(() => expect(screen.getByText('azure-deploy')).toBeInTheDocument());

    const suiteRow = screen.getByText('azure-deploy').closest('li') as HTMLElement;
    expect(suiteRow).toHaveTextContent('azure-deploy, +4 more');
    const plainRow = screen.getByText('vercel-deploy').closest('li') as HTMLElement;
    expect(within(plainRow).queryByText(/more/)).not.toBeInTheDocument();

    await userEvent.click(within(suiteRow).getByRole('button', { name: '+4 more' }));

    await waitFor(() => expect(screen.getByText('azure-rbac')).toBeInTheDocument());
    expect(searched).toEqual(['azure']);
    expect(screen.getByLabelText('Search skills')).toHaveValue('azure');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('searches the full market index and falls back to skills.sh on error', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
      marketSearch: async (query: string): Promise<Result<MarketSearchRow[]>> =>
        query === 'react'
          ? ok([{ id: 'obra/react-patterns', name: 'obra/react-patterns', installs: 1200 }])
          : err(new Error('market search unavailable')),
    };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Leaderboard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'SWE' })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search skills'));
    await userEvent.type(screen.getByLabelText('Search skills'), 'zzzz');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Search didn't go through/));
    expect(screen.queryByText('market search unavailable')).not.toBeInTheDocument();
  });

  it('shows a list skeleton while the market index loads', async () => {
    const engine = createInMemoryEngine();
    const deferred = createDeferred<Result<ShelfRole[]>>();
    const bridge = { ...createTestBridge(engine), marketShelves: () => deferred.promise };

    renderWithProviders(<MarketDiscover />, { bridge });

    expect(screen.getByRole('status', { name: 'Loading skills' })).toBeInTheDocument();
    expect(screen.queryByText('Loading\u2026')).not.toBeInTheDocument();

    deferred.resolve(ok(SHELVES));
    await openLeaderboard();
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
  });

  it('does not refetch Top or Trending after the first successful load', async () => {
    const engine = createInMemoryEngine();
    const inner = createTestBridge(engine);
    const browseSkills = vi.fn(inner.browseSkills);
    const bridge = {
      ...inner,
      marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
      browseSkills,
    };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Trending' }));
    await waitFor(() => expect(screen.getByText('vercel-labs/security-review')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Top' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    expect(browseSkills).toHaveBeenCalledTimes(2);
  });

  it('shows a friendly error when the live leaderboard fails, not the raw failure', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
      browseSkills: async (): Promise<Result<Skill[]>> => err(new Error('leaderboard unreachable')),
    };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load skills/));
    expect(screen.queryByText(/leaderboard unreachable/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('opens a preview with skillMd and audit status', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
      marketPreview: async (): Promise<Result<MarketPreviewData>> => ok(PREVIEW),
    };

    renderWithProviders(<MarketDiscover />, { bridge });
    await openLeaderboard();
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Details for obra/react-patterns' }));

    const dialog = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    expect(within(dialog).getByText(/Audit passed/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Use hooks/)).toBeInTheDocument();
  });

  describe('Suggested tab', () => {
    it('shows the catalog error when the suggested API fails, and never calls the LLM path', async () => {
      const engine = createInMemoryEngine();
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: false })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketSuggested: async (): Promise<Result<typeof SUGGESTED>> => err(new Error('store_error')),
        llmStatus: async () => ({ hasKey: false, enabled: false, provider: 'anthropic' as const, keys: [], activeId: null }),
        suggest,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load skills/));
      expect(suggest).not.toHaveBeenCalled();
    });

    it('still loads editorial picks when the market index is unavailable', async () => {
      const engine = createInMemoryEngine();
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: false })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => err(new Error('store_error')),
        marketSuggested: async () => ok(SUGGESTED),
        llmStatus: async () => ({ hasKey: false, enabled: false, provider: 'anthropic' as const, keys: [], activeId: null }),
        suggest,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Add obra/react-patterns' })).toBeInTheDocument());
      expect(suggest).not.toHaveBeenCalled();
    });

    it('loads editorial picks without a bound folder', async () => {
      const engine = createInMemoryEngine();
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: false })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketSuggested: async () => ok(SUGGESTED),
        getProjectRoot: async () => null,
        llmStatus: async () => ({ hasKey: false, enabled: false, provider: 'anthropic' as const, keys: [], activeId: null }),
        suggest,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));

      await waitFor(() => expect(screen.getByText('React patterns')).toBeInTheDocument());
      expect(suggest).not.toHaveBeenCalled();
    });

    it('refetches when the suggested role chip changes', async () => {
      const engine = createInMemoryEngine();
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: false })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketSuggested: async (_role?: string) =>
          ok({
            updatedAt: '2026-03-09',
            roles: [
              {
                slug: _role ?? 'swe',
                label: _role ?? 'SWE',
                skills: [{ id: `pick-${_role ?? 'swe'}`, name: `pick-${_role ?? 'swe'}`, installs: 1, rank: 1 }],
              },
            ],
          }),
        llmStatus: async () => ({ hasKey: false, enabled: false, provider: 'anthropic' as const, keys: [], activeId: null }),
        suggest,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));
      await waitFor(() => expect(screen.getByText('pick-swe')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'PM' }));
      await waitFor(() => expect(screen.getByText('pick-pm')).toBeInTheDocument());
      expect(suggest).not.toHaveBeenCalled();
    });

    it('shows a compact no-key banner with hover copy and no Settings button', async () => {
      const engine = createInMemoryEngine();
      const onOpenSettings = vi.fn();
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketSuggested: async () => ok(SUGGESTED),
        llmStatus: async () => ({ hasKey: false, enabled: false, provider: 'anthropic' as const, keys: [], activeId: null }),
        suggest: vi.fn(async (): Promise<Result<SuggestResult>> =>
          ok({ ids: ['obra/react-patterns'], usedLlm: false })
        ),
      };

      renderWithProviders(<MarketDiscover onOpenSettings={onOpenSettings} />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));

      await waitFor(() => expect(screen.getByText(/editorial picks only/i)).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Open LLM settings' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
      const banner = screen.getByRole('button', { name: /editorial picks only/i });
      expect(banner).toHaveAttribute('title', expect.stringMatching(/settings/i));
      expect(screen.getByText('React patterns')).toBeInTheDocument();
      await userEvent.click(banner);
      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('shows a ranked shortlist with a working + when a key is saved', async () => {
      const engine = createInMemoryEngine();
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: true })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketSuggested: async () => ok(SUGGESTED),
        llmStatus: async () => ({ hasKey: true, enabled: true, provider: 'anthropic' as const, keys: [], activeId: 'k1' }),
        suggest,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));

      await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
      expect(screen.queryByText(/editorial picks only/i)).not.toBeInTheDocument();
      expect(suggest).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument()
      );
    });

    it('does not refetch when switching away and back with the same role and key state', async () => {
      const engine = createInMemoryEngine();
      const marketSuggested = vi.fn(async () => ok(SUGGESTED));
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: true })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketSuggested,
        llmStatus: async () => ({ hasKey: true, enabled: true, provider: 'anthropic' as const, keys: [], activeId: 'k1' }),
        suggest,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));
      await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }));
      await waitFor(() => expect(screen.queryByRole('tab', { name: 'Suggested', selected: true })).not.toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));
      await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

      expect(suggest).toHaveBeenCalledTimes(1);
      expect(marketSuggested).toHaveBeenCalledTimes(1);
    });

    it('does not call suggest again after remounting with the key toggled off then on', async () => {
      const engine = createInMemoryEngine();
      const suggest = vi.fn(async (): Promise<Result<SuggestResult>> =>
        ok({ ids: ['obra/react-patterns'], usedLlm: true })
      );
      const marketSuggested = vi.fn(async () => ok(SUGGESTED));

      function bridge(enabled: boolean) {
        return {
          ...createTestBridge(engine),
          marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
          marketSuggested,
          llmStatus: async () => ({
            hasKey: true,
            enabled,
            provider: 'anthropic' as const,
            keys: [],
            activeId: enabled ? 'k1' : null,
          }),
          suggest,
        };
      }

      const first = renderWithProviders(<MarketDiscover />, { bridge: bridge(true) });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));
      await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
      expect(suggest).toHaveBeenCalledTimes(1);
      first.unmount();

      const off = renderWithProviders(<MarketDiscover />, { bridge: bridge(false) });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));
      await waitFor(() => expect(screen.getByText('React patterns')).toBeInTheDocument());
      expect(suggest).toHaveBeenCalledTimes(1);
      off.unmount();

      renderWithProviders(<MarketDiscover />, { bridge: bridge(true) });
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggested' })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('tab', { name: 'Suggested' }));
      await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
      expect(suggest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Creators tab', () => {
    const CREATORS: CreatorCard[] = [
      { slug: 'vercel', label: 'Vercel', official: true, pinned: true, skillCount: 3, totalInstalls: 52000, },
      { slug: 'obra', label: 'obra', official: false, pinned: false, skillCount: 1, totalInstalls: 1200 },
    ];
    const VERCEL: CreatorDetail = {
      slug: 'vercel',
      label: 'Vercel',
      official: true,
      repos: [
        {
          source: 'vercel-labs/agent-skills',
          skills: [
            { id: 'vercel-labs/agent-skills/react-best-practices', name: 'react-best-practices', installs: 40000, topics: ['frontend'] },
            { id: 'vercel-labs/agent-skills/web-design', name: 'web-design', installs: 9000, topics: [] },
          ],
        },
        {
          source: 'vercel/ai',
          skills: [{ id: 'vercel/ai/ai-sdk', name: 'ai-sdk', installs: 3000, topics: ['backend'] }],
        },
      ],
    };

    async function openCreators() {
      await openLeaderboard();
      await userEvent.click(screen.getByRole('tab', { name: 'Creators' }));
    }

    it('opens a creator grid, then a detail grouped by repo, then the preview', async () => {
      const engine = createInMemoryEngine();
      const marketCreator = vi.fn(async (): Promise<Result<CreatorDetail>> => ok(VERCEL));
      const marketPreview = vi.fn(
        async (): Promise<Result<MarketPreviewData>> =>
          ok({ ...PREVIEW, id: 'vercel-labs/agent-skills/react-best-practices', name: 'react-best-practices' })
      );
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketCreators: async (): Promise<Result<CreatorCard[]>> => ok(CREATORS),
        marketCreator,
        marketPreview,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await openLeaderboard();
      const tabs = within(screen.getByRole('tablist', { name: 'Leaderboard' })).getAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent)).toEqual(['Top', 'Trending', 'Creators', 'SWE', 'PM']);

      await userEvent.click(screen.getByRole('tab', { name: 'SWE' }));
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Frontend' })).toBeInTheDocument());
      await userEvent.click(screen.getByRole('tab', { name: 'Creators' }));
      expect(screen.getByRole('tab', { name: 'Creators' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'SWE' })).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByRole('tablist', { name: 'Category' })).not.toBeInTheDocument();

      const grid = await screen.findByRole('list', { name: 'Creators' });
      const cards = within(grid).getAllByRole('listitem');
      expect(cards).toHaveLength(2);
      expect(within(cards[0]).getByText('Vercel')).toBeInTheDocument();
      expect(within(cards[0]).getByText('Official on skills.sh')).toBeInTheDocument();
      expect(within(cards[0]).getByText(/3 skills/)).toBeInTheDocument();
      expect(within(cards[0]).getByText(/52k/)).toBeInTheDocument();
      expect(within(cards[0]).getByText(/installs, skills\.sh/)).toBeInTheDocument();
      expect(within(cards[1]).queryByText('Official on skills.sh')).not.toBeInTheDocument();
      expect(within(cards[1]).getByText(/1 skill\b/)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/verified/i);

      await userEvent.click(within(cards[0]).getByRole('button', { name: 'Open Vercel' }));
      expect(marketCreator).toHaveBeenCalledWith('vercel');
      expect(await screen.findByRole('heading', { name: 'Vercel' })).toBeInTheDocument();
      expect(screen.getByText('Official on skills.sh')).toBeInTheDocument();
      const repo = screen.getByRole('list', { name: 'vercel-labs/agent-skills' });
      expect(within(repo).getAllByRole('listitem', { name: /./ })).toHaveLength(2);
      expect(screen.getByRole('list', { name: 'vercel/ai' })).toBeInTheDocument();
      expect(within(repo).getByText('Frontend')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add vercel/ai/ai-sdk' })).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/verified/i);

      await userEvent.click(screen.getByRole('button', { name: 'Details for react-best-practices' }));
      expect(await screen.findByRole('dialog', { name: 'react-best-practices' })).toBeInTheDocument();
      expect(marketPreview).toHaveBeenCalledWith('vercel-labs/agent-skills/react-best-practices');
      await userEvent.keyboard('{Escape}');

      await userEvent.click(screen.getByRole('button', { name: 'Back to creators' }));
      expect(await screen.findByRole('list', { name: 'Creators' })).toBeInTheDocument();
    });

    it('renders no topic chips for a skill with empty topics', async () => {
      const engine = createInMemoryEngine();
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketCreators: async (): Promise<Result<CreatorCard[]>> => ok(CREATORS),
        marketCreator: async (): Promise<Result<CreatorDetail>> => ok(VERCEL),
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await openCreators();
      await userEvent.click(await screen.findByRole('button', { name: 'Open Vercel' }));
      const empty = await screen.findByRole('listitem', { name: 'web-design' });
      expect(within(empty).queryByRole('list', { name: 'Topics' })).not.toBeInTheDocument();
      const labeled = screen.getByRole('listitem', { name: 'ai-sdk' });
      expect(within(within(labeled).getByRole('list', { name: 'Topics' })).getByText('Backend')).toBeInTheDocument();
    });

    it('shows a retry when creators fail and keeps the other tabs working', async () => {
      const engine = createInMemoryEngine();
      const marketCreators = vi
        .fn<() => Promise<Result<CreatorCard[]>>>()
        .mockResolvedValueOnce(err(new Error('store_error')))
        .mockResolvedValueOnce(err(new Error('store_error')))
        .mockResolvedValue(ok(CREATORS));
      const bridge = {
        ...createTestBridge(engine),
        marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES),
        marketCreators,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await openCreators();
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load/));
      expect(screen.queryByText(/store_error/)).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Top' }));
      await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'SWE' }));
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Frontend' })).toBeInTheDocument());

      await userEvent.click(screen.getByRole('tab', { name: 'Creators' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('list', { name: 'Creators' })).toBeInTheDocument();
      expect(marketCreators).toHaveBeenCalledTimes(3);
    });

    it('shows a retry when one creator fails to load', async () => {
      const engine = createInMemoryEngine();
      const marketCreator = vi
        .fn<(slug: string) => Promise<Result<CreatorDetail>>>()
        .mockResolvedValueOnce(err(new Error('store_error')))
        .mockResolvedValue(ok(VERCEL));
      const bridge = {
        ...createTestBridge(engine),
        marketCreators: async (): Promise<Result<CreatorCard[]>> => ok(CREATORS),
        marketCreator,
      };

      renderWithProviders(<MarketDiscover />, { bridge });
      await openCreators();
      await userEvent.click(await screen.findByRole('button', { name: 'Open Vercel' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load/));
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('heading', { name: 'Vercel' })).toBeInTheDocument();
      expect(marketCreator).toHaveBeenLastCalledWith('vercel');
    });

    it('says so when there are no creators', async () => {
      const engine = createInMemoryEngine();
      renderWithProviders(<MarketDiscover />, { bridge: createTestBridge(engine) });
      await openCreators();
      expect(await screen.findByText(/No creators yet/)).toBeInTheDocument();
    });
  });
});
