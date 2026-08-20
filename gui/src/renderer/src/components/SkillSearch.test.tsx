import { describe, expect, it } from 'vitest';
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
});
