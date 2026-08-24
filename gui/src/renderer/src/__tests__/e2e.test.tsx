import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import {
  createInMemoryWorkspace,
  DEFAULT_TEST_PROJECT_ROOT,
  installTestBridge,
  renderWithProviders,
} from '../test-utils';
import { isOk } from '../../../../../src/core/result.js';

describe('GUI workflow (real engine)', () => {
  it('drives Discover Add → create → file → export through rendered components', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await screen.findByTitle(DEFAULT_TEST_PROJECT_ROOT);
    await userEvent.click(screen.getByRole('button', { name: 'Open Cursor workspace' }));

    await waitFor(() => expect(screen.getByText('No commands yet')).toBeInTheDocument());
    expect(engine.list()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Create New Command' }));
    await userEvent.type(screen.getByLabelText('Name'), 'frontend');
    await userEvent.click(screen.getByRole('button', { name: 'Create command' }));

    expect(await screen.findByRole('listitem', { name: 'Command frontend' })).toBeInTheDocument();
    expect(engine.list()).toHaveLength(1);
    expect(engine.list()[0]).toMatchObject({ name: 'frontend', skills: [] });

    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    await waitFor(() => expect(screen.getByText('obra/react-patterns')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Add obra/react-patterns' }));
    await waitFor(() => expect(engine.inbox()).toEqual(['obra/react-patterns']));
    expect(engine.skills()).toEqual([]);

    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open Cursor workspace' }));
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Add obra/react-patterns to frontend' }));

    await waitFor(() => expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']));
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
    expect(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' })).toBeInTheDocument();

    const dests = screen.getByRole('group', { name: 'Copy to' });
    await userEvent.click(within(dests).getByRole('button', { name: 'Windsurf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy frontend to Windsurf' }));

    expect(await screen.findByRole('dialog', { name: 'Copied' })).toHaveTextContent(
      'Copied to Windsurf in test-project'
    );
    const written = fs.readFile('.windsurf/workflows/frontend.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
    }
    expect(engine.skills()[0]?.deployedTo.map((row) => row.ide)).toEqual(['windsurf']);
    expect(engine.list()).toHaveLength(1);
  });
});
