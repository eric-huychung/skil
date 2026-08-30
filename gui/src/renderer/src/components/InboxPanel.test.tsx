import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InboxPanel from './InboxPanel';
import {
  createInMemoryEngine,
  createInMemoryWorkspace,
  createNpxWorkspace,
  createTestBridge,
  DEFAULT_TEST_PROJECT_ROOT,
  renderWithProviders,
} from '../test-utils';
import { err, isErr, ok, type Result } from '../../../../../src/core/result.js';
import type { MarketPreviewData } from '../../../shared/ipc.js';

describe('InboxPanel', () => {
  it('shows unfiled inventory, not a command card', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument();
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

  it('moves a Discover skill to Project after it lands on disk', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('Project')).toBeInTheDocument();
    expect(screen.queryByText('Market')).not.toBeInTheDocument();
    const project = screen.getByText('Project').closest('.command-stage');
    if (!project) throw new Error('expected project group');
    expect(within(project as HTMLElement).getByText('obra/react-patterns')).toBeInTheDocument();
  });

  it('offers Update on a Project row when the market copy moved', async () => {
    const { engine, fs, skills } = createInMemoryWorkspace();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# original\n');
    engine.scan();
    skills.setSkillHash('obra/react-patterns', 'market-moved');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByRole('button', { name: 'Update obra/react-patterns' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Update obra/react-patterns' }));
    expect(await screen.findByRole('dialog', { name: 'Update obra/react-patterns?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update skill' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument();
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

  it('opens a local SKILL.md preview when a project skill is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n\nWrite tests first.\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n\nClaude copy.\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));

    const dialog = await screen.findByRole('dialog', { name: 'tdd' });
    expect(within(dialog).getByText(/Write tests first/)).toBeInTheDocument();
    expect(within(dialog).getByText('.cursor/skills/tdd')).toBeInTheDocument();
    expect(within(dialog).getByText('.claude/skills/tdd')).toBeInTheDocument();
    expect(within(dialog).queryByText(/npx skills add/)).not.toBeInTheDocument();
  });

  it('offers Reset in preview when a market skill was edited on disk', async () => {
    const { engine, fs } = createNpxWorkspace();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));

    const dialog = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    expect(within(dialog).getByText(/no longer matches the market copy/)).toHaveClass('origin-warning');
    expect(within(dialog).getByRole('button', { name: 'Reset to market' })).toHaveClass('primary-button');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset to market' }));
    expect(await screen.findByRole('dialog', { name: 'Reset obra/react-patterns?' })).toBeInTheDocument();
  });

  it('stacks the Reset confirm in front of the still-open preview', async () => {
    const { engine, fs } = createNpxWorkspace();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));
    const preview = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    await userEvent.click(within(preview).getByRole('button', { name: 'Reset to market' }));

    const confirm = await screen.findByRole('dialog', { name: 'Reset obra/react-patterns?' });
    expect(preview).toBeInTheDocument();
    expect(confirm.parentElement?.parentElement).toBe(document.body);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs[dialogs.length - 1]).toBe(confirm);
  });

  it('keeps a Reset market skill in Project inbox after confirm', async () => {
    const { engine, fs, skills } = createNpxWorkspace();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    engine.scan();
    skills.skillBody = '# from market\n';
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));
    const preview = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    await userEvent.click(within(preview).getByRole('button', { name: 'Reset to market' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reset skill' }));

    expect(await screen.findByText('obra/react-patterns')).toBeInTheDocument();
    await bridge.scan();
    expect(await screen.findByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
    expect(fs.readFile('.agents/skills/obra/react-patterns/SKILL.md')).toEqual({
      ok: true,
      value: '# from market\n',
    });
    expect(fs.readFile('.claude/skills/obra/react-patterns/SKILL.md')).toEqual({
      ok: true,
      value: '# from market\n',
    });
  });

  it('shows a loading state while Reset fetches the market copy', async () => {
    const { engine, fs, skills } = createNpxWorkspace();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    engine.scan();
    skills.skillBody = '# from market\n';
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = createTestBridge(engine);
    const bridge = {
      ...real,
      updateFromMarket: async (skillId: string, opts?: { replaceEdited?: boolean }) => {
        await gate;
        return real.updateFromMarket(skillId, opts);
      },
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));
    const preview = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    await userEvent.click(within(preview).getByRole('button', { name: 'Reset to market' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reset skill' }));

    const loading = await screen.findByRole('dialog', { name: 'Resetting obra/react-patterns' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(within(loading).getByRole('status')).toHaveTextContent(/Fetching the market copy/);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    release();

    expect(await screen.findByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Resetting obra/react-patterns' })).not.toBeInTheDocument();
  });

  it('badges a synced market skill and an edited one', async () => {
    const { engine, fs } = createNpxWorkspace();
    engine.addToInbox('obra/react-patterns');
    await engine.install('obra/react-patterns');
    engine.addToInbox('addyosmani/api-design');
    await engine.install('addyosmani/api-design');
    fs.writeFile('.agents/skills/addyosmani/api-design/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/addyosmani/api-design/SKILL.md', '# edited locally\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('opens the market preview for a Discover-only inbox id', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = {
      ...createTestBridge(engine),
      marketPreview: async (): Promise<Result<MarketPreviewData>> =>
        ok({
          id: 'obra/react-patterns',
          name: 'obra/react-patterns',
          installs: 1200,
          url: '',
          installUrl: null,
          installCommand: 'npx skills add obra/react-patterns',
          skillMd: '# React Patterns\n\nUse hooks.',
          audit: { status: 'pass' },
        }),
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));

    const dialog = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    expect(within(dialog).getByText(/Use hooks/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Audit passed/)).toBeInTheDocument();
  });

  it('does not open preview when delete is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));

    expect(await screen.findByRole('dialog', { name: 'Delete tdd?' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'tdd' })).not.toBeInTheDocument();
  });

  it('shows a list skeleton while inbox is loading', async () => {
    const engine = createInMemoryEngine();
    let resolveInbox!: (value: string[]) => void;
    const inboxPromise = new Promise<string[]>((resolve) => {
      resolveInbox = resolve;
    });
    const bridge = { ...createTestBridge(engine), listInbox: () => inboxPromise };

    renderWithProviders(<InboxPanel />, { bridge });

    expect(screen.getByRole('status', { name: 'Loading skills' })).toBeInTheDocument();
    expect(screen.queryByText('Loading\u2026')).not.toBeInTheDocument();

    resolveInbox([]);
    expect(await screen.findByText(/No unfiled skills/)).toBeInTheDocument();
  });

  it('shows a friendly error when delete fails, not the raw failure', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = {
      ...createTestBridge(engine),
      deleteSkill: async () => err(new Error('EACCES: permission denied, unlink /tmp/inbox.json')),
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete obra/react-patterns' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't delete this skill/);
    expect(screen.queryByText(/EACCES/)).not.toBeInTheDocument();
    expect(screen.queryByText(/inbox.json/)).not.toBeInTheDocument();
  });
});
