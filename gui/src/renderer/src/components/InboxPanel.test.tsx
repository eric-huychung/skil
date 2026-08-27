import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InboxPanel from './InboxPanel';
import {
  createInMemoryEngine,
  createInMemoryWorkspace,
  createTestBridge,
  DEFAULT_TEST_PROJECT_ROOT,
  renderWithProviders,
} from '../test-utils';
import { isErr } from '../../../../../src/core/result.js';

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
    expect(screen.queryByRole('button', { name: 'Scan' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search skills')).toBeInTheDocument();
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install obra/react-patterns' })).not.toBeInTheDocument();
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

  it('surfaces gone ids after a scan when a skill folder is removed', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await bridge.scan();

    expect(await screen.findByText('design')).toBeInTheDocument();
    fs.removeFile('.cursor/skills/design/SKILL.md');

    await bridge.scan();

    expect(await screen.findByRole('status')).toHaveTextContent('Gone: design');
    expect(engine.inbox()).toEqual(['tdd']);
    expect(screen.queryByText('design')).not.toBeInTheDocument();
  });

  it('refreshes after a watcher scan', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    expect(await screen.findByText(/No unfiled skills/)).toBeInTheDocument();

    engine.addToInbox('tdd');
    bridge.emitScan();

    expect(await screen.findByText('tdd')).toBeInTheDocument();
  });

  it('groups Discover pulls under Market and scanned skills under Project', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    await engine.scan();
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('Market')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    const market = screen.getByText('Market').closest('.command-stage');
    const project = screen.getByText('Project').closest('.command-stage');
    if (!market || !project) throw new Error('expected inbox groups');
    expect(within(market as HTMLElement).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(project as HTMLElement).getByText('tdd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Install / })).not.toBeInTheDocument();
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

  it('does not offer Scan when no folder is connected', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Connect a folder' })).not.toBeInTheDocument();
    expect(engine.inbox()).toEqual([]);
  });

  it('deletes a project skill from disk after confirm', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo hi\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    expect(await screen.findByText('tdd')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete tdd' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete tdd?' });
    expect(dialog).toHaveTextContent('.cursor/skills/tdd');
    expect(dialog).toHaveTextContent('Cannot be undone');

    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByText(/No unfiled skills/)).toBeInTheDocument();
    expect(engine.inbox()).toEqual([]);
    expect(engine.skills()).toEqual([]);
    expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/tdd/scripts/run.sh'))).toBe(true);
  });

  it('does not delete when the confirm dialog is canceled', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Delete tdd?' })).not.toBeInTheDocument();
    expect(screen.getByText('tdd')).toBeInTheDocument();
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('removes a market inbox id without touching project skills', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete obra/react-patterns' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete obra/react-patterns?' });
    expect(dialog).toHaveTextContent('Not on disk');

    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByText('tdd')).toBeInTheDocument();
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();
    expect(engine.inbox()).toEqual(['tdd']);
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('keeps nested skills when deleting a parent skill from Inbox', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/build/SKILL.md', '# build\n');
    fs.writeFile('.cursor/skills/build/scripts/run.sh', 'echo parent\n');
    fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: /^Delete build$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete build?' });
    expect(dialog).toHaveTextContent('Keeping build/ui/shadcn');

    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByText('build/ui/shadcn')).toBeInTheDocument();
    expect(engine.inbox()).toEqual(['build/ui/shadcn']);
    expect(engine.skills().map((skill) => skill.id)).toEqual(['build/ui/shadcn']);
    expect(fs.readFile('.cursor/skills/build/ui/shadcn/SKILL.md')).toEqual({
      ok: true,
      value: '# shadcn\n',
    });
    expect(isErr(fs.readFile('.cursor/skills/build/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/build/scripts/run.sh'))).toBe(true);
  });
});
