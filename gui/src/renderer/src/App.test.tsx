import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { createInMemoryEngine, installTestBridge, renderWithProviders } from './test-utils';

describe('App', () => {
  it('mounts without crashing and shows the empty state when there are no collections', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByText('ContextKit')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());
  });

  it('reflects collections created through the engine, not a hand-mocked list', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', ['obra/react-patterns']);

    renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Collection frontend' })).toBeInTheDocument());
  });

  it('defaults to the Collections workspace so existing collection tools stay on the first screen', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByRole('tab', { name: 'Collections' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());
  });

  it('shows the config placeholder when Sync & Config is selected', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Sync & Config' }));

    expect(screen.getByRole('tab', { name: 'Sync & Config' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Config is in dev' })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('shows skill search when Search & Install is selected', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Search & Install' }));

    expect(screen.getByRole('tab', { name: 'Search & Install' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search skills')).toBeInTheDocument();
  });
});
