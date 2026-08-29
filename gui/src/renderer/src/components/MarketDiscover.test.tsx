import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarketDiscover from './MarketDiscover';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';
import { err, ok, type Result } from '../../../../../src/core/result.js';
import type { MarketPreviewData, MarketSearchRow, ShelfRole, Skill } from '../../../shared/ipc.js';

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

describe('MarketDiscover', () => {
  it('stays on Top and Trending when the market index is empty', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<MarketDiscover />, { bridge });

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Top' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'SWE' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
  });

  it('shows role and category chips with rank, name, and installs', async () => {
    const engine = createInMemoryEngine();
    const bridge = { ...createTestBridge(engine), marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES) };

    renderWithProviders(<MarketDiscover />, { bridge });

    await waitFor(() => expect(screen.getByRole('tab', { name: 'SWE' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'PM' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Frontend' })).toBeInTheDocument();
    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.getByText(/1\.2k/)).toBeInTheDocument();
  });

  it('switches rows when a different role, then category, is selected', async () => {
    const engine = createInMemoryEngine();
    const bridge = { ...createTestBridge(engine), marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES) };

    renderWithProviders(<MarketDiscover />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Backend' }));
    await waitFor(() => expect(screen.getByText('vercel-labs/security-review')).toBeInTheDocument());
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'PM' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Roadmap' })).toBeInTheDocument());
    expect(screen.queryByText('vercel-labs/security-review')).not.toBeInTheDocument();
  });

  it('adds a skill to Inbox without installing', async () => {
    const engine = createInMemoryEngine();
    const bridge = { ...createTestBridge(engine), marketShelves: async (): Promise<Result<ShelfRole[]>> => ok(SHELVES) };

    renderWithProviders(<MarketDiscover />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument()
    );
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
    expect(engine.skills()).toEqual([]);
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
    await waitFor(() => expect(screen.getByRole('tab', { name: 'SWE' })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(screen.queryByRole('tab', { name: 'SWE' })).not.toBeInTheDocument();

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
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Top' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Top' }));
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
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Top' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Top' }));

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
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Details for obra/react-patterns' }));

    const dialog = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    expect(within(dialog).getByText(/Audit passed/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Use hooks/)).toBeInTheDocument();
  });
});
