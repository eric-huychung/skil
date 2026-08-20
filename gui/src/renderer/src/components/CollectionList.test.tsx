import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import CollectionList from './CollectionList';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';

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
});
