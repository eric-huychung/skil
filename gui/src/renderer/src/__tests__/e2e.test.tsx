import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInMemoryEngine, installTestBridge, renderWithProviders } from '../test-utils';

describe('GUI workflow (real engine)', () => {
  it('drives Discover Add → create → file → export through rendered components', async () => {
    const engine = installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());
    expect(engine.list()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Create New Collection' }));
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    expect(await screen.findByRole('listitem', { name: 'Collection frontend' })).toBeInTheDocument();
    expect(engine.list()).toHaveLength(1);
    expect(engine.list()[0]).toMatchObject({ name: 'frontend', skills: [] });

    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));
    await waitFor(() => expect(engine.inbox()).toEqual(['obra/react-patterns']));

    await userEvent.click(screen.getByRole('tab', { name: 'Collections' }));
    await userEvent.click(await screen.findByRole('button', { name: 'File obra/react-patterns into frontend' }));

    await waitFor(() => expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']));
    expect(engine.inbox()).toEqual([]);

    const detail = screen.getByRole('region', { name: 'Collection frontend details' });
    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();

    await userEvent.selectOptions(within(detail).getByLabelText('Export frontend to'), 'windsurf');
    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByText('Exported to windsurf')).toBeInTheDocument());
    expect(engine.list()).toHaveLength(1);
  });
});
