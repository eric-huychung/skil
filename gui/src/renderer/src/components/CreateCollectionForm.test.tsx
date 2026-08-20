import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateCollectionForm from './CreateCollectionForm';
import { createInMemoryEngine, createTestBridge, renderWithProviders } from '../test-utils';

describe('CreateCollectionForm', () => {
  it('submits the parsed name and skill ids to engine.create()', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<CreateCollectionForm />, { bridge });

    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    const skillInput = screen.getByLabelText('Skills');
    await userEvent.type(skillInput, 'obra/react-patterns{enter}');
    await userEvent.type(skillInput, 'addyosmani/performance-review{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(engine.list()).toHaveLength(1));
    expect(engine.list()[0]).toMatchObject({
      name: 'frontend',
      skills: ['obra/react-patterns', 'addyosmani/performance-review'],
    });
  });

  it('shows a validation error when the collection name already exists', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CreateCollectionForm />, { bridge });

    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already exists/));
    expect(engine.list()).toHaveLength(1);
  });

  it('allows adding and removing multiple skill ids before submitting', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<CreateCollectionForm />, { bridge });

    const skillInput = screen.getByLabelText('Skills');
    await userEvent.type(skillInput, 'obra/react-patterns{enter}');
    await userEvent.type(skillInput, 'addyosmani/performance-review{enter}');
    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.getByText('addyosmani/performance-review')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove obra/react-patterns' }));
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();
    expect(screen.getByText('addyosmani/performance-review')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(engine.list()).toHaveLength(1));
    expect(engine.list()[0].skills).toEqual(['addyosmani/performance-review']);
  });

  it('calls onCreated after a successful submission', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);
    const onCreated = vi.fn();

    renderWithProviders(<CreateCollectionForm onCreated={onCreated} />, { bridge });

    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
