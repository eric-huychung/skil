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
import { isErr, isOk } from '../../../../../src/core/result.js';

describe('GUI workflow (real engine)', () => {
  it('drives Discover Add → create → file → export through rendered components', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await screen.findByTitle(DEFAULT_TEST_PROJECT_ROOT);

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
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Add obra/react-patterns to frontend' }));

    await waitFor(() => expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']));
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
    expect(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Pick format:/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Claude Code' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported all commands to Claude Code in test-project'
    );
    const written = fs.readFile('.claude/commands/frontend.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
    }
    expect(engine.skills()[0]?.deployedTo.map((row) => row.ide)).toEqual(['claude']);
    expect(engine.list()).toHaveLength(1);
  });

  it('deletes a scanned inbox skill from disk after confirm', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/references/notes.md', '# notes\n');
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await screen.findByTitle(DEFAULT_TEST_PROJECT_ROOT);
    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    expect(await screen.findByRole('dialog', { name: 'Delete tdd?' })).toHaveTextContent(
      '.cursor/skills/tdd'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    await waitFor(() => expect(engine.inbox()).toEqual([]));
    expect(engine.skills()).toEqual([]);
    expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/tdd/references/notes.md'))).toBe(true);
  });
});
