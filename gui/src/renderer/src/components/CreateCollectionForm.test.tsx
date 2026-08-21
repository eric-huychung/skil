import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCollectionForm from './CreateCollectionForm';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';

describe('CreateCollectionForm', () => {
  it('hides the name field until Create is clicked', () => {
    const bridge = createTestBridge(createInMemoryEngine());

    renderWithProviders(<CreateCollectionForm />, { bridge });

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Collection' })).toBeInTheDocument();
  });

  it('creates an empty collection from a name-only modal', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<CreateCollectionForm />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Create New Collection' }));
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(engine.list()).toHaveLength(1));
    expect(engine.list()[0]).toMatchObject({ name: 'frontend', skills: [] });
  });

  it('does not create when the modal is canceled', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<CreateCollectionForm />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Create New Collection' }));
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(engine.list()).toHaveLength(0);
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('shows a validation error when the collection name already exists', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CreateCollectionForm />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Create New Collection' }));
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already exists/));
    expect(engine.list()).toHaveLength(1);
  });

  it('calls onCreated after a successful submission', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);
    const onCreated = vi.fn();

    renderWithProviders(<CreateCollectionForm onCreated={onCreated} />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Create New Collection' }));
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
