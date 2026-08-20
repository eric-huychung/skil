import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInMemoryEngine, installTestBridge, renderWithProviders } from '../test-utils';

describe('GUI workflow (real engine)', () => {
  it('drives create -> activate -> deactivate through rendered components, matching engine state at each step', async () => {
    // A real CollectionEngine backed by in-memory adapters, not a mocked
    // bridge — the same engine the CLI runs against, just faked at the
    // file system/config/skills.sh boundaries.
    const engine = installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    // Starts empty: UI and engine agree.
    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());
    expect(engine.list()).toHaveLength(0);

    // Create a collection through the rendered form.
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.type(screen.getByLabelText('Skills'), 'obra/react-patterns{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'frontend' })).toBeInTheDocument());
    expect(engine.list()).toHaveLength(1);
    expect(engine.list()[0]).toMatchObject({ name: 'frontend', skills: ['obra/react-patterns'] });
    expect(engine.status().activeCollection).toBeNull();

    // Activate it by clicking the rendered row.
    await userEvent.click(screen.getByRole('button', { name: 'frontend' }));

    await waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument());
    expect(engine.status().activeCollection).toBe('frontend');

    // Deactivate it via the rendered Deactivate control.
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(screen.queryByText('Active')).not.toBeInTheDocument());
    expect(engine.status().activeCollection).toBeNull();
    // The collection itself still exists — deactivating doesn't delete it.
    expect(engine.list()).toHaveLength(1);
  });
});
