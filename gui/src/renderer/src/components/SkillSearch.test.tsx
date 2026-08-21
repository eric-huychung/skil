import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillSearch from './SkillSearch';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';
import { err, ok, type Result } from '../../../../../src/core/result.js';
import type { Skill } from '../../../../../src/types/index.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('SkillSearch', () => {
  it('searches on submit and renders results', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react patterns');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(screen.getByText('addyosmani/performance-review')).toBeInTheDocument();
  });

  it('adds a skill to Inbox and shows Added, without installing', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument());
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
  });

  it('shows a visible error when adding to Inbox fails', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      addToInbox: async (): Promise<Result<string[]>> => err(new Error("Failed to save inbox: Disk full")),
    };

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Failed to save inbox/));
    expect(screen.getByRole('alert')).not.toHaveClass('sr-only');
  });

  it('shows a loading state while the search is pending', async () => {
    const engine = createInMemoryEngine();
    const deferred = createDeferred<Result<Skill[]>>();
    const bridge = { ...createTestBridge(engine), searchSkills: () => deferred.promise };

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByText('Searching\u2026')).toBeInTheDocument();

    deferred.resolve(ok([]));
    await waitFor(() => expect(screen.queryByText('Searching\u2026')).not.toBeInTheDocument());
  });

  it('shows a loading state while adding to Inbox is pending', async () => {
    const engine = createInMemoryEngine();
    const deferred = createDeferred<Result<string[]>>();
    const bridge = { ...createTestBridge(engine), addToInbox: () => deferred.promise };

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));

    expect(screen.getByText('Adding\u2026')).toBeInTheDocument();

    deferred.resolve(ok(['obra/react-patterns']));
    await waitFor(() => expect(screen.queryByText('Adding\u2026')).not.toBeInTheDocument());
  });

  it('renders all-time results with install counts on an empty query, without clicking Search', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });

    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(screen.getByText(/1\.2k/)).toBeInTheDocument();
    expect(screen.queryByText('vercel-labs/security-review')).not.toBeInTheDocument();
  });

  it('submitting an empty query browses the leaderboard instead of typed-searching', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText(/1\.2k/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByText(/1\.2k/)).toBeInTheDocument();
    expect(screen.queryByText('vercel-labs/security-review')).not.toBeInTheDocument();
  });

  it('renders a different list when the Trending tab is selected', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Trending' }));

    await waitFor(() => expect(screen.getByText('vercel-labs/security-review')).toBeInTheDocument());
    expect(screen.getByText(/90/)).toBeInTheDocument();
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();
  });

  it('does not refetch a view after the first successful load', async () => {
    const engine = createInMemoryEngine();
    const inner = createTestBridge(engine);
    const browseSkills = vi.fn(inner.browseSkills);
    const bridge = { ...inner, browseSkills };

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Trending' }));
    await waitFor(() => expect(screen.getByText('vercel-labs/security-review')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'All time' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    expect(browseSkills).toHaveBeenCalledTimes(2);
  });

  it('shows at most 20 leaderboard rows', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      browseSkills: async () =>
        ok(
          Array.from({ length: 21 }, (_, index) => ({
            id: `skill/${index}`,
            source: 'skills.sh' as const,
            installedAt: '',
            installs: index,
          })),
        ),
    };

    renderWithProviders(<SkillSearch />, { bridge });

    await waitFor(() => expect(screen.getByText('skill/0')).toBeInTheDocument());
    expect(screen.getByText('skill/19')).toBeInTheDocument();
    expect(screen.queryByText('skill/20')).not.toBeInTheDocument();
  });

  it('shows a loading state while browse is pending', async () => {
    const engine = createInMemoryEngine();
    const deferred = createDeferred<Result<Skill[]>>();
    const bridge = { ...createTestBridge(engine), browseSkills: () => deferred.promise };

    renderWithProviders(<SkillSearch />, { bridge });

    expect(screen.getByText('Searching\u2026')).toBeInTheDocument();

    deferred.resolve(ok([]));
    await waitFor(() => expect(screen.queryByText('Searching\u2026')).not.toBeInTheDocument());
  });

  it('shows an inline error when browse fails', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      browseSkills: async (): Promise<Result<Skill[]>> => err(new Error('leaderboard unreachable')),
    };

    renderWithProviders(<SkillSearch />, { bridge });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/leaderboard unreachable/));
  });

  it('opens a details dialog with listing metadata when the skill name is clicked', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      browseSkills: async () =>
        ok([
          {
            id: 'vercel-labs/skills/find-skills',
            source: 'skills.sh' as const,
            installedAt: '',
            installs: 3052722,
            name: 'find-skills',
            repo: 'vercel-labs/skills',
            installUrl: 'https://github.com/vercel-labs/skills',
            url: 'https://www.skills.sh/vercel-labs/skills/find-skills',
          },
        ]),
    };

    renderWithProviders(<SkillSearch />, { bridge });

    await waitFor(() => expect(screen.getByText('vercel-labs/skills/find-skills')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'vercel-labs/skills/find-skills' }));

    const dialog = screen.getByRole('dialog', { name: 'find-skills' });
    expect(within(dialog).getByText('vercel-labs/skills/find-skills')).toBeInTheDocument();
    expect(within(dialog).getByText('vercel-labs/skills')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/vercel-labs/skills',
    );
    expect(within(dialog).getByRole('link', { name: 'skills.sh' })).toHaveAttribute(
      'href',
      'https://www.skills.sh/vercel-labs/skills/find-skills',
    );
    expect(within(dialog).getByText('3.1m')).toBeInTheDocument();
  });
});
