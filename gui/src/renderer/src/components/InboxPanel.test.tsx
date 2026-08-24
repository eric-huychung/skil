import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InboxPanel from './InboxPanel';
import {
  createInMemoryEngine,
  createInMemoryWorkspace,
  createTestBridge,
  DEFAULT_TEST_PROJECT_ROOT,
  renderWithProviders,
} from '../test-utils';
import { err, ok, type Result } from '../../../../../src/core/result.js';
import type { SkillRecord } from '../../../../../src/types/index.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('InboxPanel', () => {
  it('shows unfiled inventory, not a command card', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Command Inbox' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled();
    expect(screen.getByText('Connect a project folder to scan')).toBeInTheDocument();
    expect(screen.getByLabelText('Search skills')).toBeInTheDocument();
  });

  it('filters unfiled skills from the search box', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    engine.addToInbox('addyosmani/api-design');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });
    expect(await screen.findByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.getByText('addyosmani/api-design')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search skills'), 'react');

    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.queryByText('addyosmani/api-design')).not.toBeInTheDocument();
  });

  it('surfaces gone ids after Scan when a skill folder is removed', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Scan' }));

    expect(await screen.findByText('design')).toBeInTheDocument();
    fs.removeFile('.cursor/skills/design/SKILL.md');

    await userEvent.click(screen.getByRole('button', { name: 'Scan' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Gone: design');
    expect(engine.inbox()).toEqual(['tdd']);
    expect(screen.queryByText('design')).not.toBeInTheDocument();
  });

  it('installs an Inbox skill to the chosen IDE', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    const inventory = (await screen.findByRole('heading', { name: 'Inbox' })).closest('.inbox-panel');
    if (!inventory) throw new Error('expected inbox panel');

    await waitFor(() =>
      expect(within(inventory as HTMLElement).getByRole('button', { name: 'Install obra/react-patterns' })).toBeEnabled()
    );
    await userEvent.click(within(inventory as HTMLElement).getByRole('button', { name: 'Install obra/react-patterns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Claude' }));

    const dialog = await screen.findByRole('dialog', { name: 'Installed' });
    expect(dialog).toHaveTextContent('Installed obra/react-patterns to Claude in test-project');
    expect(dialog).toHaveClass('status-success');
    expect(engine.skills().find((skill) => skill.id === 'obra/react-patterns')?.deployedTo.map((row) => row.ide)).toEqual([
      'claude',
    ]);
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
  });

  it('shows a loading dialog while install is pending', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const deferred = createDeferred<Result<SkillRecord>>();
    const bridge = {
      ...createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT }),
      install: () => deferred.promise,
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install obra/react-patterns' })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole('button', { name: 'Install obra/react-patterns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Claude' }));

    expect(screen.getByRole('dialog', { name: 'Installing…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Installing obra/react-patterns' })).toBeDisabled();

    deferred.resolve(
      ok({
        id: 'obra/react-patterns',
        hash: '',
        paths: [],
        deployedTo: [],
        source: 'skills.sh',
      })
    );
    expect(await screen.findByRole('dialog', { name: 'Installed' })).toBeInTheDocument();
  });

  it('shows a visible error when inbox install fails', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = {
      ...createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT }),
      install: async () => err(new Error('npx skills add failed\nstderr: boom')),
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Install obra/react-patterns' })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole('button', { name: 'Install obra/react-patterns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cursor' }));

    const dialog = await screen.findByRole('dialog', { name: 'Install failed' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not install obra/react-patterns to Cursor in test-project'
    );
    expect(dialog).toHaveClass('status-error');
    const details = within(dialog).getByText('Details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(within(dialog).getByText(/stderr: boom/)).not.toBeVisible();

    await userEvent.click(within(dialog).getByText('Details'));
    expect(details).toHaveAttribute('open');
    expect(within(dialog).getByText(/stderr: boom/)).toBeVisible();
    expect(engine.skills()).toEqual([]);
  });

  it('shows 25 unfiled skills per page', async () => {
    const engine = createInMemoryEngine();
    for (let index = 0; index < 26; index += 1) {
      engine.addToInbox(`skill/${index}`);
    }
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('skill/0')).toBeInTheDocument();
    expect(screen.getByText('skill/24')).toBeInTheDocument();
    expect(screen.queryByText('skill/25')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('skill/25')).toBeInTheDocument();
    expect(screen.queryByText('skill/0')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('explains why Scan cannot run when no folder is connected', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Scan' }));

    const dialog = await screen.findByRole('dialog', { name: 'Connect a folder' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Scan reads SKILL.md folders from a connected project. Connect a folder on the Sync tab first.'
    );
    expect(engine.inbox()).toEqual([]);
  });

  it('picks a destination folder when installing without a connected repo', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine, { nextDestination: '/tmp/other-project' });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Install obra/react-patterns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Claude' }));

    expect(await screen.findByRole('dialog', { name: 'Installed' })).toHaveTextContent(
      'Installed obra/react-patterns to Claude in other-project'
    );
    expect(engine.skills().find((skill) => skill.id === 'obra/react-patterns')?.deployedTo).toEqual([
      expect.objectContaining({
        ide: 'claude',
        path: '/tmp/other-project/.claude/skills/obra/react-patterns',
      }),
    ]);
    expect(await bridge.getProjectRoot()).toBeNull();
  });

  it('does not install when destination pick is canceled', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine, { nextDestination: null });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Install obra/react-patterns' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cursor' }));

    expect(screen.queryByRole('dialog', { name: 'Installed' })).not.toBeInTheDocument();
    expect(engine.skills()).toEqual([]);
  });
});
