import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

    await waitFor(() => expect(screen.getByText('1 collection')).toBeInTheDocument());
  });
});
