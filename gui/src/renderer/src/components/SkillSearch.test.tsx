import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

  it('installs a skill and shows a success message', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Install obra/react-patterns' }));

    await waitFor(() => expect(screen.getByText('Installed')).toBeInTheDocument());
  });

  it('shows an inline error when install fails', async () => {
    const engine = createInMemoryEngine();
    const bridge = {
      ...createTestBridge(engine),
      installSkill: async (): Promise<Result<Skill>> => err(new Error("Failed to install skill 'obra/react-patterns'")),
    };

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Install obra/react-patterns' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Failed to install/));
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

  it('shows a loading state while an install is pending', async () => {
    const engine = createInMemoryEngine();
    const deferred = createDeferred<Result<Skill>>();
    const bridge = { ...createTestBridge(engine), installSkill: () => deferred.promise };

    renderWithProviders(<SkillSearch />, { bridge });

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Install obra/react-patterns' }));

    expect(screen.getByText('Installing\u2026')).toBeInTheDocument();

    deferred.resolve(ok({ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '' }));
    await waitFor(() => expect(screen.queryByText('Installing\u2026')).not.toBeInTheDocument());
  });

  it('renders all-time results with install counts on an empty query, without clicking Search', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<SkillSearch />, { bridge });

    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    expect(screen.getByText(/1200/)).toBeInTheDocument();
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
});
