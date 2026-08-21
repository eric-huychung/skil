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

  it('renders one card per collection and shows the selected collection skills in the detail panel', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('backend', ['addyosmani/api-design']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getAllByRole('listitem', { name: /^Collection / })).toHaveLength(2));
    const detail = screen.getByRole('region', { name: 'Collection frontend details' });
    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).queryByText('addyosmani/api-design')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('listitem', { name: 'Collection backend' }));

    const backendDetail = screen.getByRole('region', { name: 'Collection backend details' });
    expect(within(backendDetail).getByText('addyosmani/api-design')).toBeInTheDocument();
    expect(within(backendDetail).queryByText('obra/react-patterns')).not.toBeInTheDocument();
  });

  it('files an Inbox ID into a named collection', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await screen.findByRole('listitem', { name: 'Collection frontend' });

    await userEvent.click(screen.getByRole('button', { name: 'File obra/react-patterns into frontend' }));

    await waitFor(() => expect(engine.inbox()).toEqual([]));
    expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
    const detail = screen.getByRole('region', { name: 'Collection frontend details' });
    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
  });

  it('removes a skill from a collection when its remove button is clicked', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Collection frontend details' });
    await waitFor(() => expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' }));

    await waitFor(() => expect(within(detail).queryByText('obra/react-patterns')).not.toBeInTheDocument());
    expect(engine.list()[0].skills).toEqual([]);
  });

  it('exports a collection to the selected IDE', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Collection frontend details' });

    await userEvent.selectOptions(within(detail).getByLabelText('Export frontend to'), 'claude');
    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByText('Exported to claude')).toBeInTheDocument());
  });

  it('shows an inline error when export fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const failureResult: ExportResult = { succeeded: [], failures: ["'frontend:obra/react-patterns': boom"] };
    const bridge = { ...createTestBridge(engine), exportCollections: async () => ok(failureResult) };

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Collection frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByRole('alert')).toHaveTextContent(/boom/));
  });

  it('shows an inline error when the export call itself fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = { ...createTestBridge(engine), exportCollections: async () => err(new Error('network down')) };

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Collection frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByRole('alert')).toHaveTextContent(/network down/));
  });

  it('deletes the selected collection after confirm', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Collection frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Delete frontend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete collection' }));

    await waitFor(() => expect(engine.list()).toEqual([]));
    expect(screen.getByText('No collections yet')).toBeInTheDocument();
  });

  it('does not delete when the confirm dialog is canceled', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Collection frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Delete frontend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(engine.list()).toHaveLength(1);
    expect(screen.getByRole('listitem', { name: 'Collection frontend' })).toBeInTheDocument();
  });
});
