import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionList from './CollectionList';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';
import { err } from '../../../../../src/core/result.js';

describe('CollectionList', () => {
  it('shows the empty state when there are no collections', async () => {
    const bridge = createTestBridge(createInMemoryEngine());

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());
  });

  it('renders one row per collection from engine.list()', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('backend', ['addyosmani/api-design']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText('backend')).toBeInTheDocument();
  });

  it('visually indicates the active collection', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('backend', ['addyosmani/api-design']);
    engine.activate('frontend');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    const frontendRow = screen.getByText('frontend').closest('li');
    const backendRow = screen.getByText('backend').closest('li');
    expect(frontendRow).not.toBeNull();
    expect(backendRow).not.toBeNull();
    expect(within(frontendRow!).getByText('Active')).toBeInTheDocument();
    expect(within(backendRow!).queryByText('Active')).not.toBeInTheDocument();
  });

  it('activates a collection when its row is clicked', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.create('backend', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    await userEvent.click(screen.getByRole('button', { name: 'frontend' }));

    await waitFor(() => expect(engine.status().activeCollection).toBe('frontend'));
    const frontendRow = screen.getByText('frontend').closest('li');
    expect(within(frontendRow!).getByText('Active')).toBeInTheDocument();
  });

  it('deactivates the active collection when Deactivate is clicked', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.activate('frontend');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => expect(engine.status().activeCollection).toBeNull());
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('shows an inline error when activation fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    const bridge = {
      ...createTestBridge(engine),
      activateCollection: async () => err(new Error("Collection 'frontend' not found. Run 'contextkit list'.")),
    };

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'frontend' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'frontend' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not found/));
  });
});
