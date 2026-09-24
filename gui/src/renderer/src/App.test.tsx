import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {
  createInMemoryEngine,
  createInMemoryWorkspace,
  createTestBridge,
  DEFAULT_TEST_PROJECT_ROOT,
  installTestBridge,
  renderWithProviders,
} from './test-utils';
import { err, isOk, ok } from '../../../../src/core/result.js';
import { isCommandSkillStamp, writeCommandFile } from '../../../../src/core/command-file.js';
import { version as APP_VERSION } from '../../../package.json';

async function openSync() {
  await userEvent.click(screen.getByRole('tab', { name: 'Sync' }));
}

async function clickPickFolder() {
  await openSync();
  await userEvent.click(await screen.findByRole('button', { name: 'Pick folder' }));
}

async function openCommandsWorkspace() {
  await screen.findByRole('heading', { name: 'Commands' });
}

function syncMetric(label: string) {
  const el = screen.getByText(label, { selector: '.found-label' });
  const card = el.closest('.sync-metric-card');
  if (!card) throw new Error(`expected ${label} metric card`);
  return card as HTMLElement;
}

describe('App', () => {
  it('mounts on Commands with the empty commands UI, not a pick-folder wall', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByText('Skil')).toBeInTheDocument();
    expect(screen.getByText('Free and open source')).toBeInTheDocument();
    expect(screen.getByText(`skil ${APP_VERSION}`)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Commands' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Commands' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Cursor workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Command' })).toBeInTheDocument();
    expect(screen.getByText('No commands yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
  });

  it('shows a list skeleton on Sync while recents are loading', async () => {
    let resolveRecents!: (value: string[]) => void;
    const recentsPromise = new Promise<string[]>((resolve) => {
      resolveRecents = resolve;
    });
    const bridge = {
      ...createTestBridge(createInMemoryEngine()),
      listRecentFolders: () => recentsPromise,
    };

    renderWithProviders(<App />, { bridge });
    await userEvent.click(screen.getByRole('tab', { name: 'Sync' }));

    expect(screen.getByRole('status', { name: 'Loading sync' })).toBeInTheDocument();
    expect(screen.queryByText('Skills', { selector: '.found-label' })).not.toBeInTheDocument();
    expect(screen.queryByText('Loading\u2026')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick folder' })).toBeInTheDocument();

    resolveRecents([]);
    expect(await screen.findByText('Skills', { selector: '.found-label' })).toBeInTheDocument();
    expect(screen.getByText('Commands', { selector: '.found-label' })).toBeInTheDocument();
    expect(screen.getByText('Rules', { selector: '.found-label' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading sync' })).not.toBeInTheDocument();
  });

  it('reflects commands created through the engine without connecting a folder first', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', ['obra/react-patterns']);

    renderWithProviders(<App />);
    await openCommandsWorkspace();

    expect(await screen.findByRole('listitem', { name: 'Command frontend' })).toBeInTheDocument();
  });

  it('keeps the command list when leaving Commands and coming back', async () => {
    const engine = createInMemoryEngine();
    engine.create('build', ['tdd']);
    const inner = createTestBridge(engine);
    let listCalls = 0;
    const bridge = {
      ...inner,
      listCollections: async () => {
        listCalls += 1;
        return inner.listCollections();
      },
    };

    renderWithProviders(<App />, { bridge });
    expect(await screen.findByRole('listitem', { name: 'Command build' })).toBeInTheDocument();
    expect(listCalls).toBe(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));
    expect(screen.getByRole('listitem', { name: 'Command build' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading commands' })).not.toBeInTheDocument();
    expect(listCalls).toBe(1);
  });

  it('always shows Discover search without connecting a folder', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));

    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search skills')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a project folder' })).not.toBeInTheDocument();
  });

  it('keeps topbar, rail, and footer as shell chrome across tabs', async () => {
    installTestBridge(createInMemoryEngine());
    renderWithProviders(<App />);
    await screen.findByRole('heading', { name: 'Commands' });

    const shell = document.querySelector('.app-shell');
    expect(shell?.querySelector(':scope > .topbar')).toBeTruthy();
    expect(shell?.querySelector(':scope > .workspace > .rail')).toBeTruthy();
    expect(shell?.querySelector(':scope > .footer-bar')).toBeTruthy();
    expect(document.querySelector('.panel-section .topbar')).toBeNull();
    expect(document.querySelector('.panel-section .rail')).toBeNull();
    expect(document.querySelector('.panel-section .footer-bar')).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    await screen.findByRole('heading', { name: 'Discover' });
    expect(shell?.querySelector(':scope > .topbar')).toBeTruthy();
    expect(shell?.querySelector(':scope > .workspace > .rail')).toBeTruthy();
    expect(shell?.querySelector(':scope > .footer-bar')).toBeTruthy();
  });

  it('puts Skills on the rail above Commands and names each tab for hover', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', []);
    await engine.install('obra/react-patterns');

    renderWithProviders(<App />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));
    expect(tabs.indexOf('Skills')).toBeGreaterThan(-1);
    expect(tabs.indexOf('Skills')).toBeLessThan(tabs.indexOf('Commands'));
    expect(tabs.indexOf('Commands')).toBeLessThan(tabs.indexOf('Rules'));
    for (const name of ['Sync', 'Discover', 'Skills', 'Commands', 'Rules']) {
      expect(screen.getByRole('tab', { name })).toHaveTextContent(name);
    }
    expect(await screen.findByRole('heading', { name: 'Commands' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
    await openCommandsWorkspace();
    expect(
      screen.getByRole('button', { name: 'Add obra/react-patterns to frontend' })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(screen.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
    const skillsPanel = (await screen.findByRole('heading', { name: 'Skills' })).closest('section');
    expect(skillsPanel).not.toBeNull();
    expect(within(skillsPanel as HTMLElement).getByText('obra/react-patterns')).toBeInTheDocument();
  });

  it('shows a red Sync rail dot until a folder is connected', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    const sync = screen.getByRole('tab', { name: 'Sync' });
    expect(sync.querySelector('.sync-dot')).toHaveClass('disconnected');

    await clickPickFolder();

    expect(screen.getByRole('tab', { name: 'Sync' }).querySelector('.sync-dot')).toHaveClass('connected');
  });

  it('hides the header path and Re-scan until a folder is connected', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.queryByRole('button', { name: 'Re-scan' })).not.toBeInTheDocument();
    expect(screen.queryByTitle(DEFAULT_TEST_PROJECT_ROOT)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick folder' })).not.toBeInTheDocument();

    await openSync();
    expect(screen.getByRole('button', { name: 'Pick folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan' })).not.toBeInTheDocument();
    expect(screen.getByText('Last scanned Never')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pick folder' }));

    expect((await screen.findAllByText(DEFAULT_TEST_PROJECT_ROOT)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Config is in dev' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Re-scan' })).not.toHaveTextContent(/re-scan/i);
    expect(screen.queryByText('Last scanned Never')).not.toBeInTheDocument();
    expect(screen.getByText('Skills', { selector: '.found-label' })).toBeInTheDocument();
    expect(screen.getByText('Commands', { selector: '.found-label' })).toBeInTheDocument();
    expect(screen.getByText('Rules', { selector: '.found-label' })).toBeInTheDocument();
    expect(screen.queryByText('Skills by source')).not.toBeInTheDocument();
  });

  it('keeps Re-scan next to the header path after leaving Sync', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await clickPickFolder();

    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));

    expect(screen.getByTitle(DEFAULT_TEST_PROJECT_ROOT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeEnabled();
  });

  it('shows 0 skills found when no folder is connected even if leftover catalog exists', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/ui/SKILL.md', '# ui\n');
    fs.writeFile('.claude/skills/lint/SKILL.md', '# lint\n');
    fs.writeFile('.claude/skills/review/SKILL.md', '# review\n');
    fs.writeFile('.windsurf/skills/grill/SKILL.md', '# grill\n');
    fs.writeFile('.agents/skills/find/SKILL.md', '# find\n');
    fs.writeFile('.agents/skills/browser/SKILL.md', '# browser\n');
    engine.scan();
    expect(engine.skills()).toHaveLength(7);
    installTestBridge(engine);

    renderWithProviders(<App />);
    await openSync();

    expect(within(syncMetric('Skills')).getByText('0')).toBeInTheDocument();
    expect(within(syncMetric('Commands')).getByText('0')).toBeInTheDocument();
    expect(within(syncMetric('Rules')).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.queryByText('Skills by source')).not.toBeInTheDocument();
  });

  it('rescans from the icon and shows skills, commands, and rules counts', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/ui/SKILL.md', '# ui\n');
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# body\n<!-- /skil:rule behavior -->\n');
    engine.create('build', ['tdd']);
    installTestBridge(engine);

    renderWithProviders(<App />);
    await clickPickFolder();

    await waitFor(() => {
      expect(within(syncMetric('Skills')).getByText('2')).toBeInTheDocument();
    });
    expect(within(syncMetric('Commands')).getByText('1')).toBeInTheDocument();
    expect(within(syncMetric('Rules')).getByText('1')).toBeInTheDocument();

    fs.writeFile('.windsurf/skills/lint/SKILL.md', '# lint\n');
    fs.writeFile('.agents/skills/review/SKILL.md', '# review\n');
    await userEvent.click(screen.getByRole('button', { name: 'Re-scan' }));

    await waitFor(() => {
      expect(within(syncMetric('Skills')).getByText('4')).toBeInTheDocument();
    });
    expect(within(syncMetric('Commands')).getByText('1')).toBeInTheDocument();
    expect(within(syncMetric('Rules')).getByText('1')).toBeInTheDocument();
  });

  it('leaves the bound folder unchanged when the picker is canceled', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      nextPick: null,
    });

    renderWithProviders(<App />);
    await openSync();

    expect((await screen.findAllByText(DEFAULT_TEST_PROJECT_ROOT)).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Change folder' }));

    expect(screen.getAllByText(DEFAULT_TEST_PROJECT_ROOT).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
  });

  it('scans the picked folder and lists unfiled skills in Skills without creating commands', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/ui/styling/SKILL.md', '# styling\n');
    installTestBridge(engine);

    renderWithProviders(<App />);

    expect(await screen.findByRole('heading', { name: 'Commands' })).toBeInTheDocument();
    expect(screen.queryByText('tdd')).not.toBeInTheDocument();

    await clickPickFolder();
    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));

    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByText('tdd')).toBeInTheDocument();
    expect(screen.getByText('ui/styling')).toBeInTheDocument();
    expect(engine.skills().map((skill) => skill.id)).toEqual(['tdd', 'ui/styling']);
    expect(engine.list()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Scan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeEnabled();
  });

  it('does not put a rescan control on Discover or Skills', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));

    expect(screen.queryByRole('button', { name: 'Refresh skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));

    expect(screen.queryByRole('button', { name: 'Scan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan' })).not.toBeInTheDocument();
  });

  it('opens a help dialog from the rail', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('dialog', { name: 'Three problems. One map.' })).toBeInTheDocument();
  });

  it('opens help from the footer when a newer release exists', async () => {
    const inner = createTestBridge(createInMemoryEngine());
    window.skil = {
      ...inner,
      checkAppUpdate: async () =>
        ok({
          current: APP_VERSION,
          latest: '9.9.9',
          newer: true,
          url: 'https://github.com/eric-huychung/skil/releases/tag/v9.9.9',
        }),
    };

    renderWithProviders(<App />);
    expect(screen.getByText('Free and open source')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: '9.9.9 is out' }));

    expect(screen.getByRole('dialog', { name: 'About Skil' })).toBeInTheDocument();
  });

  it('updates Commands skill counts after deleting a filed skill', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/ui/SKILL.md', '# ui\n');
    engine.scan();
    engine.create('build', ['tdd', 'ui']);
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await waitFor(() => {
      expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('2 skills');
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Details for tdd' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));
    await waitFor(() => expect(engine.skills().map((skill) => skill.id)).toEqual(['ui']));

    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));

    await waitFor(() => {
      expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('1 skill');
    });
  });

  it('refreshes Commands after a watcher scan', async () => {
    const engine = createInMemoryEngine();
    const bridge = createTestBridge(engine);

    renderWithProviders(<App />, { bridge });
    await openCommandsWorkspace();
    expect(await screen.findByText('No commands yet')).toBeInTheDocument();

    engine.create('build', ['tdd']);
    bridge.emitScan();

    expect(await screen.findByRole('listitem', { name: 'Command build' })).toBeInTheDocument();
  });

  it('restores the last folder on launch without picking', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      recentFolders: [DEFAULT_TEST_PROJECT_ROOT, '/tmp/other-project'],
    });

    renderWithProviders(<App />);

    expect(await screen.findByTitle(DEFAULT_TEST_PROJECT_ROOT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Pick folder' })).not.toBeInTheDocument();

    await openSync();
    expect(screen.getByRole('heading', { name: 'Recent folders' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to /tmp/other-project' })).toBeInTheDocument();
    expect(screen.getByText('tmp/other-project')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Switch to ${DEFAULT_TEST_PROJECT_ROOT}` })).not.toBeInTheDocument();
  });

  it('lists a picked folder under Recent folders on Sync', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await openSync();
    expect(screen.queryByRole('heading', { name: 'Recent folders' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pick folder' }));

    expect(await screen.findByRole('heading', { name: 'Recent folders' })).toBeInTheDocument();
    expect(screen.getByText('test-project')).toBeInTheDocument();
  });

  it('asks before switching to a recent folder and cancel keeps the current one', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: '/tmp/alpha',
      recentFolders: ['/tmp/alpha', '/tmp/beta'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to /tmp/beta' }));

    expect(screen.getByRole('dialog', { name: 'Switch folder?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Switch folder?' })).not.toBeInTheDocument();
    expect(screen.getAllByTitle('/tmp/alpha').length).toBeGreaterThan(0);
  });

  it('switches to a recent folder after confirm', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: '/tmp/alpha',
      recentFolders: ['/tmp/alpha', '/tmp/beta'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to /tmp/beta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Switch folder' }));

    expect((await screen.findAllByTitle('/tmp/beta')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Switch to /tmp/beta' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to /tmp/alpha' })).toBeInTheDocument();
  });

  it('asks before removing a recent folder and cancel keeps it', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: '/tmp/alpha',
      recentFolders: ['/tmp/alpha', '/tmp/beta'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Remove /tmp/beta from recents' }));

    expect(screen.getByRole('dialog', { name: 'Remove folder?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Switch to /tmp/beta' })).toBeInTheDocument();
  });

  it('removes a recent folder after confirm', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: '/tmp/alpha',
      recentFolders: ['/tmp/alpha', '/tmp/beta'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Remove /tmp/beta from recents' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove folder' }));

    expect(screen.queryByRole('button', { name: 'Switch to /tmp/beta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Remove folder?' })).not.toBeInTheDocument();
    expect(screen.getAllByTitle('/tmp/alpha').length).toBeGreaterThan(0);
  });

  it('disconnects the bound folder when it is removed from recents', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: '/tmp/alpha',
      recentFolders: ['/tmp/alpha', '/tmp/beta'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Remove /tmp/alpha from recents' }));
    expect(screen.getByRole('dialog', { name: 'Remove folder?' })).toHaveTextContent('disconnect');
    await userEvent.click(screen.getByRole('button', { name: 'Remove folder' }));

    expect(screen.getByRole('button', { name: 'Pick folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sync' }).querySelector('.sync-dot')).toHaveClass('disconnected');
    expect(screen.queryByTitle('/tmp/alpha')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to /tmp/beta' })).toBeInTheDocument();
  });

  it('shows a warning on the Sync rail when leftovers exist, even off the Sync tab', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);

    const sync = screen.getByRole('tab', { name: 'Sync' });
    expect(await within(sync).findByTitle('Leftovers to clean up')).toBeInTheDocument();
    expect(sync.querySelector('.sync-dot')).not.toBeInTheDocument();
  });

  it('copies leftover-only skills into the live pair on scan, leftover stays for remove', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await openSync();

    expect(await screen.findByRole('button', { name: '1 leftover' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '1 leftover' }));
    expect(await screen.findByRole('heading', { name: 'Cleanup' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Needs import' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ready to remove' })).toHaveTextContent('.cursor/skills/tdd');
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.claude/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
  });

  it('imports leftover commands into the live pair on scan and shows them on Commands', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/commands/build.md', writeCommandFile('build', ['tdd']));
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(await screen.findByRole('button', { name: '1 leftover' }));
    expect(screen.queryByRole('list', { name: 'Needs import' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ready to remove' })).toHaveTextContent('.cursor/commands/build.md');

    await waitFor(() => expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true));
    const live = fs.readFile('.agents/skills/build/SKILL.md');
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(isCommandSkillStamp(live.value)).toBe(true);
    expect(isOk(fs.readFile('.claude/skills/build/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.cursor/commands/build.md'))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(within(syncMetric('Commands')).getByText('1')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));
    expect(await screen.findByRole('listitem', { name: 'Command build' })).toBeInTheDocument();
  });

  it('removes matching leftovers after import and leaves the live pair', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(await screen.findByRole('button', { name: '1 leftover' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove leftovers' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: /Remove 1 leftover/ })).getByRole('button', {
        name: 'Remove leftovers',
      })
    );

    await waitFor(() => expect(screen.queryByRole('button', { name: '1 leftover' })).not.toBeInTheDocument());
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.skil/deprecated/.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md').ok).toBe(false);
  });

  it('keeps drift in Conflicts and does not offer batch remove for it', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# live\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# leftover\n');
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await openSync();

    expect(await screen.findByRole('button', { name: '1 conflict' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '1 conflict' }));
    expect(screen.getByRole('list', { name: 'Conflicts' })).toHaveTextContent('tdd');
    expect(screen.queryByRole('button', { name: 'Remove leftovers' })).not.toBeInTheDocument();
    expect(isOk(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Keep current' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '1 conflict' })).not.toBeInTheDocument());
    expect(fs.readFile('.agents/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# live\n' });
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md').ok).toBe(false);
  });

  it('uses leftover content as live and drops the leftover path', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# live\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# live\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# leftover\n');
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(await screen.findByRole('button', { name: '1 conflict' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use leftover' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '1 conflict' })).not.toBeInTheDocument());
    expect(screen.queryByRole('list', { name: 'Conflicts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ready to remove' })).not.toBeInTheDocument();
    expect(fs.readFile('.agents/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# leftover\n' });
    expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# leftover\n' });
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md').ok).toBe(false);
  });

  it('opens a two-pane compare when a conflict card is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n\nLive copy body.\n');
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n\nLeftover copy body.\n');
    engine.scan();
    installTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(await screen.findByRole('button', { name: '1 conflict' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare tdd' }));

    const compare = await screen.findByRole('dialog', { name: 'tdd' });
    expect(compare).toHaveTextContent('Live copy body');
    expect(compare).toHaveTextContent('Leftover copy body');
    expect(compare).toHaveTextContent('.agents/skills/tdd');
    expect(compare).toHaveTextContent('.cursor/skills/tdd');
    expect(screen.getByRole('dialog', { name: 'Cleanup' })).toBeInTheDocument();
    expect(within(compare).getByText('Live copy body.')).toHaveClass('sync-compare-line-changed');
    expect(within(compare).getByText('Leftover copy body.')).toHaveClass('sync-compare-line-changed');
    expect(within(compare).getAllByText('# tdd')[0]).not.toHaveClass('sync-compare-line-changed');

    await userEvent.click(screen.getByRole('button', { name: 'Close compare' }));
    expect(screen.queryByRole('dialog', { name: 'tdd' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Cleanup' })).toBeInTheDocument();
  });

  it('shows a friendly error when importing leftovers fails, without dropping the list', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/extra.mdc', '---\nglobs: src/**\n---\n# extra\n');
    engine.scan();
    const real = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });
    const bridge = { ...real, importToCanonical: async () => err(new Error('EACCES: permission denied')) };

    renderWithProviders(<App />, { bridge });
    await openSync();
    await userEvent.click(await screen.findByRole('button', { name: '1 leftover' }));
    await userEvent.click(screen.getByRole('button', { name: 'Import all' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't import those paths");
    expect(screen.getByRole('heading', { name: 'Cleanup' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Needs import' })).toHaveTextContent('.cursor/rules/extra.mdc');
  });
});
