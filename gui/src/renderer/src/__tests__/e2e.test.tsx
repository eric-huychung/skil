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
  it('drives Discover Add → create → file → toggle on through rendered components', async () => {
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
    await waitFor(() => expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']));
    expect(engine.list()[0]?.skills).toEqual([]);

    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Add obra/react-patterns to frontend' }));

    await waitFor(() => expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']));
    expect(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' })).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('listitem', { name: 'Command frontend' })).getByRole('button', { name: 'Turn on frontend' }));

    await waitFor(() => expect(isOk(fs.readFile('.agents/skills/frontend/SKILL.md'))).toBe(true));
    expect(isOk(fs.readFile('.claude/skills/frontend/SKILL.md'))).toBe(true);
    expect(within(screen.getByRole('listitem', { name: 'Command frontend' })).getByRole('button', { name: 'Turn off frontend' })).toBeInTheDocument();
    expect(engine.list()).toHaveLength(1);
  });

  it('deletes a scanned skill from disk after confirm', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/references/notes.md', '# notes\n');
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await screen.findByTitle(DEFAULT_TEST_PROJECT_ROOT);
    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    expect(await screen.findByRole('dialog', { name: 'Delete tdd?' })).toHaveTextContent(
      '.cursor/skills/tdd'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    await waitFor(() => expect(engine.skills()).toEqual([]));
    expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/tdd/references/notes.md'))).toBe(true);
  });
});
