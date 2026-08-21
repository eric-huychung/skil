import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionList from './CollectionList';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';
import { err, ok } from '../../../../../src/core/result.js';
import type { ExportResult } from '../../../../../src/types/index.js';

describe('CollectionList', () => {
  it('shows the empty state when there are no collections', async () => {
    const bridge = createTestBridge(createInMemoryEngine());

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());
  });

  it('renders one row per collection, each listing its skills', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('backend', ['addyosmani/api-design']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getAllByRole('listitem', { name: /^Collection/ })).toHaveLength(2));
    const frontendRow = screen.getByRole('listitem', { name: 'Collection frontend' });
    expect(within(frontendRow).getByText('obra/react-patterns')).toBeInTheDocument();
    const backendRow = screen.getByRole('listitem', { name: 'Collection backend' });
    expect(within(backendRow).getByText('addyosmani/api-design')).toBeInTheDocument();
  });

  it('adds a skill to a collection via its add-skill input', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const frontendRow = await screen.findByRole('listitem', { name: 'Collection frontend' });

    await userEvent.type(within(frontendRow).getByLabelText('Add skill to frontend'), 'obra/react-patterns{enter}');

    await waitFor(() => expect(within(frontendRow).getByText('obra/react-patterns')).toBeInTheDocument());
    expect(engine.list()[0].skills).toEqual(['obra/react-patterns']);
  });

  it('removes a skill from a collection when its remove button is clicked', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const frontendRow = await screen.findByRole('listitem', { name: 'Collection frontend' });
    await waitFor(() => expect(within(frontendRow).getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(within(frontendRow).getByRole('button', { name: 'Remove obra/react-patterns' }));

    await waitFor(() => expect(within(frontendRow).queryByText('obra/react-patterns')).not.toBeInTheDocument());
    expect(engine.list()[0].skills).toEqual([]);
  });

  it('exports a collection to the selected IDE', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const frontendRow = await screen.findByRole('listitem', { name: 'Collection frontend' });

    await userEvent.selectOptions(within(frontendRow).getByLabelText('Export frontend to'), 'claude');
    await userEvent.click(within(frontendRow).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(frontendRow).getByText('Exported to claude')).toBeInTheDocument());
  });

  it('shows an inline error when export fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const failureResult: ExportResult = { succeeded: [], failures: ["'frontend:obra/react-patterns': boom"] };
    const bridge = { ...createTestBridge(engine), exportCollections: async () => ok(failureResult) };

    renderWithProviders(<CollectionList />, { bridge });
    const frontendRow = await screen.findByRole('listitem', { name: 'Collection frontend' });

    await userEvent.click(within(frontendRow).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(frontendRow).getByRole('alert')).toHaveTextContent(/boom/));
  });

  it('shows an inline error when the export call itself fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = { ...createTestBridge(engine), exportCollections: async () => err(new Error('network down')) };

    renderWithProviders(<CollectionList />, { bridge });
    const frontendRow = await screen.findByRole('listitem', { name: 'Collection frontend' });

    await userEvent.click(within(frontendRow).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(frontendRow).getByRole('alert')).toHaveTextContent(/network down/));
  });
});
