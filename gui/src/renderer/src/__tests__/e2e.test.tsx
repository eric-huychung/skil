import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createInMemoryEngine, installTestBridge, renderWithProviders } from '../test-utils';

describe('GUI workflow (real engine)', () => {
  it('drives create -> add skill -> remove skill -> export through rendered components, matching engine state at each step', async () => {
    // A real CollectionEngine backed by in-memory adapters, not a mocked
    // bridge — the same engine the CLI runs against, just faked at the
    // file system/config/skills.sh boundaries.
    const engine = installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    // Starts empty: UI and engine agree. Bind a folder first — collections
    // mutations stay gated until the engine is rooted on a project.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pick a project folder' })).toBeInTheDocument());
    expect(engine.list()).toHaveLength(0);
    const pickPanel = screen.getByRole('heading', { name: 'Pick a project folder' }).closest('section');
    await userEvent.click(within(pickPanel!).getByRole('button', { name: 'Pick folder' }));

    await waitFor(() => expect(screen.getByText('No collections yet')).toBeInTheDocument());

    // Create a collection through the rendered form.
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.type(screen.getByLabelText('Skills'), 'obra/react-patterns{enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));

    expect(await screen.findByRole('listitem', { name: 'Collection frontend' })).toBeInTheDocument();
    expect(engine.list()).toHaveLength(1);
    expect(engine.list()[0]).toMatchObject({ name: 'frontend', skills: ['obra/react-patterns'] });

    const detail = screen.getByRole('region', { name: 'Collection frontend details' });

    // Add a second skill through the rendered detail panel.
    await userEvent.type(within(detail).getByLabelText('Add skill to frontend'), 'addyosmani/performance-review{enter}');

    await waitFor(() => expect(within(detail).getByText('addyosmani/performance-review')).toBeInTheDocument());
    expect(engine.list()[0].skills).toEqual(['obra/react-patterns', 'addyosmani/performance-review']);

    // Remove the first skill via its rendered remove button.
    await userEvent.click(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' }));

    await waitFor(() => expect(within(detail).queryByText('obra/react-patterns')).not.toBeInTheDocument());
    expect(engine.list()[0].skills).toEqual(['addyosmani/performance-review']);

    // Export the collection to the selected IDE via the rendered controls.
    await userEvent.selectOptions(within(detail).getByLabelText('Export frontend to'), 'windsurf');
    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByText('Exported to windsurf')).toBeInTheDocument());
    // The collection itself still exists — exporting doesn't delete it.
    expect(engine.list()).toHaveLength(1);
  });
});
