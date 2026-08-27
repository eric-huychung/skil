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
    expect(engine.skills()).toEqual([]);
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
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Search skills'), 'zzzz-not-on-the-leaderboard');
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

    expect(screen.getByRole('button', { name: 'Adding obra/react-patterns' })).toBeDisabled();

    deferred.resolve(ok(['obra/react-patterns']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument());
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

  it('does not offer a Discover refresh control', async () => {
    const engine = createInMemoryEngine();
    const inner = createTestBridge(engine);
    const browseSkills = vi.fn(inner.browseSkills);
    const bridge = { ...inner, browseSkills };

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(browseSkills).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('button', { name: 'Refresh skills' })).not.toBeInTheDocument();
    expect(browseSkills).toHaveBeenCalledTimes(1);
    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
  });

  it('shows 25 leaderboard rows per page and keeps a 500 cap', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      browseSkills: async () =>
        ok(
          Array.from({ length: 501 }, (_, index) => ({
            id: `skill/${index}`,
            source: 'skills.sh' as const,
            installedAt: '',
            installs: index,
          })),
        ),
    };

    renderWithProviders(<SkillSearch />, { bridge });

    await waitFor(() => expect(screen.getByText('skill/0')).toBeInTheDocument());
    expect(screen.getByText('skill/24')).toBeInTheDocument();
    expect(screen.queryByText('skill/25')).not.toBeInTheDocument();
    expect(screen.getByText('500 available')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 20')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Page 4' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('skill/25')).toBeInTheDocument();
    expect(screen.queryByText('skill/0')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 20')).toBeInTheDocument();
    expect(screen.queryByText('skill/500')).not.toBeInTheDocument();
  });

  it('filters the cached leaderboard as you type without calling search', async () => {
    const engine = createInMemoryEngine();
    const inner = createTestBridge(engine);
    const searchSkills = vi.fn(inner.searchSkills);
    const bridge = { ...inner, searchSkills };

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(screen.getByText('addyosmani/performance-review')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');

    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.queryByText('addyosmani/performance-review')).not.toBeInTheDocument();
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it('calls search only when the cached list has no match', async () => {
    const engine = createInMemoryEngine();
    const inner = createTestBridge(engine);
    const searchSkills = vi.fn(inner.searchSkills);
    const bridge = { ...inner, searchSkills };

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Search skills'), 'zzzz-not-on-the-leaderboard');
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();
    expect(searchSkills).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(searchSkills).toHaveBeenCalledTimes(1);
    expect(searchSkills).toHaveBeenCalledWith('zzzz-not-on-the-leaderboard');
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

  it('opens a details dialog from the skill card with a repository link', async () => {
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

    await waitFor(() => expect(screen.getByText('find-skills')).toBeInTheDocument());
    expect(screen.queryByText('vercel-labs/skills/find-skills')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Details for find-skills' }));

    const dialog = screen.getByRole('dialog', { name: 'find-skills' });
    expect(within(dialog).getByText('Repository')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'vercel-labs/skills/find-skills' })).toHaveAttribute(
      'href',
      'https://github.com/vercel-labs/skills',
    );
    expect(within(dialog).getByRole('link', { name: 'vercel-labs/skills/find-skills' })).toHaveClass(
      'skill-details-link',
    );
    expect(within(dialog).getByRole('link', { name: 'skills.sh' })).toHaveAttribute(
      'href',
      'https://www.skills.sh/vercel-labs/skills/find-skills',
    );
    expect(within(dialog).getByRole('link', { name: 'skills.sh' })).toHaveClass('skill-details-link');
    expect(within(dialog).getByText('3.1m')).toBeInTheDocument();
  });

  it('opens details when clicking the skill name, not only the overlay control', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByText('obra/react-patterns'));

    expect(screen.getByRole('dialog', { name: 'obra/react-patterns' })).toBeInTheDocument();
  });

  it('opens a second skill after closing the first details dialog', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByText('obra/react-patterns'));
    expect(screen.getByRole('dialog', { name: 'obra/react-patterns' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('addyosmani/performance-review'));
    expect(screen.getByRole('dialog', { name: 'addyosmani/performance-review' })).toBeInTheDocument();
  });

  it('does not open details when clicking Add', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument());
  });
});
