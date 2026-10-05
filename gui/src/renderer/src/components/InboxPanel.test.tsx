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
import { err, isErr, isOk } from '../../../../../src/core/result.js';
import type { SkillRecord } from '../../../shared/ipc.js';

describe('InboxPanel', () => {
  it('shows unfiled inventory, not a command card', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    await engine.install('obra/react-patterns');
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
    await engine.install('obra/react-patterns');
    await engine.install('addyosmani/api-design');
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
    fs.removeFile('.agents/skills/design/SKILL.md');
    fs.removeFile('.claude/skills/design/SKILL.md');

    await bridge.scan();

    expect(await screen.findByRole('status')).toHaveTextContent('Gone: design');
    expect(engine.skills().map((skill) => skill.id)).toEqual(['tdd']);
    expect(screen.queryByText('design')).not.toBeInTheDocument();
  });

  it('refreshes after a watcher scan', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    expect(await screen.findByText(/No unfiled skills/)).toBeInTheDocument();

    await engine.install('tdd');
    bridge.emitScan();

    expect(await screen.findByText('tdd')).toBeInTheDocument();
  });

  it('shows a health warning on a skill row when a doctor finding names it', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\nkey: sk-abcdefghijklmnopqrstuvwx\n');
    engine.scan();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByLabelText('tdd has a health warning')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tdd has a health warning' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Health' })).not.toBeInTheDocument();
  });

  it('opens doctor from the preview warning banner, next to the token count', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile(
      '.cursor/skills/tdd/SKILL.md',
      '---\ndescription: tdd\n---\n# tdd\n\nsk-abcdefghijklmnopqrstuvwx\n'
    );
    engine.scan();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));

    const dialog = await screen.findByRole('dialog', { name: 'tdd' });
    expect(await within(dialog).findByText('1 token')).toBeInTheDocument();
    expect(within(dialog).queryByText('Unused')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Secret leak')).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '1 warning' }));
    const health = await screen.findByRole('dialog', { name: 'Health' });
    expect(within(health).queryByText('Unused')).not.toBeInTheDocument();
    expect(within(health).getByText('Secret leak')).toBeInTheDocument();
    expect(within(health).getByText(/on \/build/)).toBeInTheDocument();
  });

  it('groups Discover pulls under Market and scanned skills under Project', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    await engine.scan();
    await engine.install('obra/react-patterns');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('Market')).toHaveClass('inbox-source-label');
    expect(screen.getByText('Project')).toHaveClass('inbox-source-label');
    const market = screen.getByText('Market').closest('.command-stage');
    const project = screen.getByText('Project').closest('.command-stage');
    if (!market || !project) throw new Error('expected inbox groups');
    expect(within(market as HTMLElement).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(project as HTMLElement).getByText('tdd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Install / })).not.toBeInTheDocument();
  });

  it('groups nested project skills under parent-folder headings, cards show name and short description', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/build/SKILL.md', '# build\n');
    fs.writeFile(
      '.cursor/skills/build/increment/SKILL.md',
      '---\ndescription: One slice at a time.\n---\n# increment\n'
    );
    fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
    await engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });

    const project = (await screen.findByText('Project')).closest('.command-stage');
    if (!project) throw new Error('expected project group');
    const projectEl = project as HTMLElement;

    expect(within(projectEl).getByText('build', { selector: '.stage-label' })).toBeInTheDocument();
    expect(within(projectEl).getByText('build/ui', { selector: '.stage-label' })).toBeInTheDocument();
    expect(within(projectEl).getByText('Other', { selector: '.stage-label' })).toBeInTheDocument();

    const buildFolder = within(projectEl).getByText('build', { selector: '.stage-label' }).closest('.command-stage');
    const uiFolder = within(projectEl).getByText('build/ui', { selector: '.stage-label' }).closest('.command-stage');
    const otherFolder = within(projectEl).getByText('Other', { selector: '.stage-label' }).closest('.command-stage');
    if (!buildFolder || !uiFolder || !otherFolder) throw new Error('expected folder sections');

    expect(within(buildFolder as HTMLElement).getByRole('listitem', { name: 'Skill build' })).toBeInTheDocument();
    const incrementCard = within(buildFolder as HTMLElement).getByRole('listitem', { name: 'Skill build/increment' });
    expect(within(incrementCard).getByText('increment')).toBeInTheDocument();
    expect(within(incrementCard).getByText('One slice at a time.')).toBeInTheDocument();
    expect(within(projectEl).queryByText('build/increment')).not.toBeInTheDocument();

    expect(within(uiFolder as HTMLElement).getByText('shadcn')).toBeInTheDocument();
    expect(within(projectEl).queryByText('build/ui/shadcn')).not.toBeInTheDocument();
    expect(within(otherFolder as HTMLElement).getByText('tdd')).toBeInTheDocument();
  });

  it('cuts a long skill description on the card', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    const long =
      'Use this skill when you need to do a very long thing that should not all dump onto the card because we only have a little space in the middle.';
    fs.writeFile('.cursor/skills/tdd/SKILL.md', `---\ndescription: ${long}\n---\n# tdd\n`);
    await engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });

    const card = await screen.findByRole('listitem', { name: 'Skill tdd' });
    expect(within(card).getByText(/Use this skill when/)).toHaveTextContent('…');
    expect(within(card).queryByText(long)).not.toBeInTheDocument();
  });

  it('keeps a Discover skill under Market after it lands on disk', async () => {
    const engine = createInMemoryEngine();
    await engine.install('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('Market')).toBeInTheDocument();
    expect(screen.queryByText('Project')).not.toBeInTheDocument();
    const market = screen.getByText('Market').closest('.command-stage');
    if (!market) throw new Error('expected market group');
    expect(within(market as HTMLElement).getByText('obra/react-patterns')).toBeInTheDocument();
  });

  it('offers Update on a Market row when the market copy moved', async () => {
    const { engine, fs, skills } = createInMemoryWorkspace();
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# original\n');
    engine.scan();
    skills.setSkillHash('obra/react-patterns', 'market-moved');
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByRole('button', { name: 'Update obra/react-patterns' })).toBeInTheDocument();
    expect(screen.getByText('Update', { selector: '.origin-badge' })).toHaveClass('text-amber-500');
    await userEvent.click(screen.getByRole('button', { name: 'Update obra/react-patterns' }));
    expect(await screen.findByRole('dialog', { name: 'Update obra/react-patterns?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update skill' })).toBeInTheDocument();
  });

  it('shows 25 unfiled skills per page', async () => {
    const engine = createInMemoryEngine();
    for (let index = 0; index < 26; index += 1) {
      await engine.install(`skill/${index}`);
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
    expect(engine.skills()).toEqual([]);
  });

  it('deletes a project skill from disk after confirm', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo hi\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    expect(await screen.findByText('tdd')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete tdd?' });
    expect(dialog).toHaveTextContent('.cursor/skills/tdd');
    expect(dialog).toHaveTextContent('Cannot be undone');

    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByText(/No unfiled skills/)).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Delete tdd?' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'tdd' })).toBeInTheDocument();
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('deletes a market skill without touching project skills', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    await engine.install('obra/react-patterns');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete obra/react-patterns' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete obra/react-patterns?' });
    expect(dialog).toHaveTextContent('Cannot be undone');

    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByText('tdd')).toBeInTheDocument();
    expect(screen.queryByText('obra/react-patterns')).not.toBeInTheDocument();
    expect(engine.skills().map((skill) => skill.id)).toEqual(['tdd']);
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('keeps nested skills when deleting a parent skill', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/build/SKILL.md', '# build\n');
    fs.writeFile('.cursor/skills/build/scripts/run.sh', 'echo parent\n');
    fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for build' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete build' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete build?' });
    expect(dialog).toHaveTextContent('Keeping build/ui/shadcn');

    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByText('shadcn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Details for build/ui/shadcn' })).toBeInTheDocument();
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
    expect(within(dialog).getByRole('button', { name: /Turn (on|off) tdd/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete tdd' })).toBeInTheDocument();
    expect(within(dialog).getByText('.cursor/skills/tdd')).toBeInTheDocument();
    expect(within(dialog).getByText('.claude/skills/tdd')).toBeInTheDocument();
    expect(within(dialog).queryByText(/npx skills add/)).not.toBeInTheDocument();
  });

  it('offers Reset in preview when a market skill was edited on disk', async () => {
    const { engine, fs } = createNpxWorkspace();
    await engine.install('obra/react-patterns');
    fs.writeFile('.agents/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/obra/react-patterns/SKILL.md', '# edited locally\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));

    const dialog = await screen.findByRole('dialog', { name: 'obra/react-patterns' });
    expect(within(dialog).getByText(/no longer matches the market copy/)).toHaveClass('origin-warning', 'text-destructive');
    expect(within(dialog).getByRole('button', { name: 'Reset to market' })).toHaveClass('primary-button');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset to market' }));
    expect(await screen.findByRole('dialog', { name: 'Reset obra/react-patterns?' })).toBeInTheDocument();
  });

  it('stacks the Reset confirm in front of the still-open preview', async () => {
    const { engine, fs } = createNpxWorkspace();
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

  it('keeps a Reset market skill under Market after confirm', async () => {
    const { engine, fs, skills } = createNpxWorkspace();
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
    expect(screen.getByText('Market')).toBeInTheDocument();
    expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
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
    await engine.install('obra/react-patterns');
    await engine.install('addyosmani/api-design');
    fs.writeFile('.agents/skills/addyosmani/api-design/SKILL.md', '# edited locally\n');
    fs.writeFile('.claude/skills/addyosmani/api-design/SKILL.md', '# edited locally\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<InboxPanel />, { bridge });

    expect(await screen.findByText('Synced')).toBeInTheDocument();
    expect(screen.getByText('Edited')).toHaveClass('text-destructive');
  });

  it('keeps the preview open behind the delete confirm', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));
    const preview = await screen.findByRole('dialog', { name: 'tdd' });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));

    expect(await screen.findByRole('dialog', { name: 'Delete tdd?' })).toBeInTheDocument();
    expect(preview).toBeInTheDocument();
  });

  it('keeps the toggle busy with a spinner until refresh completes', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();

    let listSkillsCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const real = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });
    const bridge = {
      ...real,
      listSkills: async () => {
        listSkillsCalls += 1;
        if (listSkillsCalls > 1) {
          await refreshGate;
        }
        return real.listSkills();
      },
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off tdd' }));

    const busyToggle = screen.getByRole('button', { name: 'Turn off tdd' });
    expect(busyToggle).toHaveAttribute('aria-busy', 'true');
    expect(busyToggle.textContent).not.toMatch(/Off/);

    releaseRefresh();
    expect(await screen.findByRole('button', { name: 'Turn on tdd' })).toBeInTheDocument();
  });

  it('toggles a project skill off, parking it, and back on', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<InboxPanel />, { bridge });
    const off = await screen.findByRole('button', { name: 'Turn off tdd' });
    await userEvent.click(off);

    expect(await screen.findByRole('button', { name: 'Turn on tdd' })).toBeInTheDocument();
    expect(isErr(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.skil/parked/skills/tdd/SKILL.md'))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Turn on tdd' }));

    expect(await screen.findByRole('button', { name: 'Turn off tdd' })).toBeInTheDocument();
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.claude/skills/tdd/SKILL.md'))).toBe(true);
  });

  it('shows an inline error when toggling fails, without dropping the row', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const real = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });
    const bridge = {
      ...real,
      setSkillEnabled: async () => err(new Error('EACCES: permission denied')),
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off tdd' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update this skill");
    expect(screen.getByRole('button', { name: 'Turn off tdd' })).toBeInTheDocument();
  });

  it('shows a list skeleton while the catalog is loading', async () => {
    const engine = createInMemoryEngine();
    let resolveSkills!: (value: SkillRecord[]) => void;
    const skillsPromise = new Promise<SkillRecord[]>((resolve) => {
      resolveSkills = resolve;
    });
    const bridge = { ...createTestBridge(engine), listSkills: () => skillsPromise };

    renderWithProviders(<InboxPanel />, { bridge });

    expect(screen.getByRole('status', { name: 'Loading skills' })).toBeInTheDocument();
    expect(screen.queryByText('Loading\u2026')).not.toBeInTheDocument();

    resolveSkills([]);
    expect(await screen.findByText(/No unfiled skills/)).toBeInTheDocument();
  });

  it('shows a friendly error when delete fails, not the raw failure', async () => {
    const { engine } = createNpxWorkspace();
    await engine.install('obra/react-patterns');
    const bridge = {
      ...createTestBridge(engine),
      deleteSkill: async () => err(new Error('EACCES: permission denied, unlink /tmp/inbox.json')),
    };

    renderWithProviders(<InboxPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for obra/react-patterns' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete obra/react-patterns' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't delete this skill/);
    expect(screen.queryByText(/EACCES/)).not.toBeInTheDocument();
    expect(screen.queryByText(/inbox.json/)).not.toBeInTheDocument();
  });
});
