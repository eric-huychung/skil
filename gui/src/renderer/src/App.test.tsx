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

describe('App', () => {
  it('mounts on Commands with the empty commands UI, not a pick-folder wall', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByText('Skil')).toBeInTheDocument();
    expect(screen.getByText('skil 0.3.0')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Commands' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Commands' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Cursor workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Command' })).toBeInTheDocument();
    expect(screen.getByText('No commands yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
  });

  it('reflects commands created through the engine without connecting a folder first', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', ['obra/react-patterns']);

    renderWithProviders(<App />);
    await openCommandsWorkspace();

    expect(await screen.findByRole('listitem', { name: 'Command frontend' })).toBeInTheDocument();
  });

  it('always shows Discover search without connecting a folder', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));

    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search skills')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a project folder' })).not.toBeInTheDocument();
  });

  it('puts Skills on the rail above Commands and names each tab for hover', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');

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
    expect(await screen.findByRole('heading', { name: 'Skills' })).toBeInTheDocument();
    expect(screen.getByText('obra/react-patterns')).toBeInTheDocument();
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
    expect(screen.getByText('Skills found')).toBeInTheDocument();
    expect(screen.getByText('Skills by source')).toBeInTheDocument();
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

    const found = screen.getByText('Skills found').closest('.skills-found-card');
    if (!found) throw new Error('expected skills found card');
    expect(within(found as HTMLElement).getByText('0')).toBeInTheDocument();
    expect(screen.getByText('.claude')).toBeInTheDocument();
    expect(screen.getByText('.windsurf')).toBeInTheDocument();
    expect(screen.getByText('.agents')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });

  it('rescans from the icon and shows skills found next to skills by source', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/ui/SKILL.md', '# ui\n');
    installTestBridge(engine);

    renderWithProviders(<App />);
    await clickPickFolder();

    await waitFor(() => {
      const found = screen.getByText('Skills found').closest('.skills-found-card');
      if (!found) throw new Error('expected skills found card');
      expect(within(found as HTMLElement).getByText('2')).toBeInTheDocument();
    });
    expect(screen.getByText('.cursor')).toBeInTheDocument();
    expect(screen.getByText('.claude')).toBeInTheDocument();

    fs.writeFile('.windsurf/skills/lint/SKILL.md', '# lint\n');
    fs.writeFile('.agents/skills/review/SKILL.md', '# review\n');
    await userEvent.click(screen.getByRole('button', { name: 'Re-scan' }));

    await waitFor(() => {
      const card = screen.getByText('Skills found').closest('.skills-found-card');
      if (!card) throw new Error('expected skills found card');
      expect(within(card as HTMLElement).getByText('4')).toBeInTheDocument();
    });
    expect(screen.getByText('.windsurf')).toBeInTheDocument();
    expect(screen.getByText('.agents')).toBeInTheDocument();
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

  it('scans the picked folder and lists unfiled skills in Inbox without creating commands', async () => {
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
    expect(engine.inbox()).toEqual(['tdd', 'ui/styling']);
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

    expect(screen.getByRole('dialog', { name: 'How can we help?' })).toBeInTheDocument();
  });

  it('binds a download destination so the header and Sync show that folder', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    installTestBridge(engine, { nextDestination: '/tmp/other-project' });

    renderWithProviders(<App />);
    expect(screen.queryByTitle('/tmp/other-project')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-scan' })).not.toBeInTheDocument();

    await openCommandsWorkspace();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
    expect(screen.getByTitle('/tmp/other-project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-scan' })).toBeEnabled();

    await userEvent.click(screen.getByRole('tab', { name: 'Sync' }));
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
    expect(screen.getAllByText('/tmp/other-project').length).toBeGreaterThan(1);
  });

  it('updates Commands skill counts after deleting a filed skill from Inbox', async () => {
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
    await userEvent.click(await screen.findByRole('button', { name: 'Delete tdd' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete skill' }));
    await waitFor(() => expect(engine.inbox()).toEqual(['ui']));

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

  it('keeps Discover inbox skills after switching folders', async () => {
    const alpha = createInMemoryEngine();
    alpha.addToInbox('obra/react-patterns');
    const beta = createInMemoryEngine();
    installTestBridge(alpha, {
      projectRoot: '/tmp/alpha',
      recentFolders: ['/tmp/alpha', '/tmp/beta'],
      enginesByPath: { '/tmp/beta': beta },
    });

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(await screen.findByText('obra/react-patterns')).toBeInTheDocument();

    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to /tmp/beta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Switch folder' }));

    await userEvent.click(screen.getByRole('tab', { name: 'Skills' }));
    expect(await screen.findByText('obra/react-patterns')).toBeInTheDocument();
    expect(beta.inbox()).toEqual(['obra/react-patterns']);
  });

  it('disables Import on Sync until a folder is connected', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await openSync();

    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('imports skills from a recent folder without switching the bound project', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('/tmp/other-project/.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile(
      '/tmp/other-project/.cursor/commands/build.md',
      `---
name: /build
skills:
  - tdd
generated_by: skil
generated_at: 2026-08-24T00:00:00.000Z
---

## Goal
from the other project
`
    );
    installTestBridge(engine, {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      recentFolders: [DEFAULT_TEST_PROJECT_ROOT, '/tmp/other-project'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));

    const dialog = screen.getByRole('dialog', { name: 'Import' });
    expect(within(dialog).getByRole('radio', { name: 'Cursor' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import from /tmp/other-project' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await screen.findByRole('dialog', { name: 'Imported' })).toBeInTheDocument();
    expect(engine.inbox()).toEqual(['tdd']);
    expect(engine.list('cursor').find((command) => command.name === 'build')?.skills).toEqual(['tdd']);
    expect(screen.getAllByTitle(DEFAULT_TEST_PROJECT_ROOT).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Switch to /tmp/other-project' })).toBeInTheDocument();
  });

  it('asks to replace when the import would overwrite a dest skill', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# dest tdd\n');
    engine.scan();
    fs.writeFile('/tmp/other-project/.cursor/skills/tdd/SKILL.md', '# source tdd\n');
    installTestBridge(engine, {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      recentFolders: [DEFAULT_TEST_PROJECT_ROOT, '/tmp/other-project'],
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog', { name: 'Import' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import from /tmp/other-project' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await screen.findByRole('dialog', { name: 'Replace existing files?' })).toBeInTheDocument();
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# dest tdd\n' });

    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(await screen.findByRole('dialog', { name: 'Imported' })).toBeInTheDocument();
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# source tdd\n' });
  });

  it('picks another folder to import without binding it', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('/tmp/picked-source/.cursor/skills/design/SKILL.md', '# design\n');
    installTestBridge(engine, {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      recentFolders: [DEFAULT_TEST_PROJECT_ROOT],
      nextDestination: '/tmp/picked-source',
    });

    renderWithProviders(<App />);
    await openSync();
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('dialog', { name: 'Import' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose folder' }));
    expect(within(dialog).getByText('/tmp/picked-source')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await screen.findByRole('dialog', { name: 'Imported' })).toBeInTheDocument();
    expect(engine.inbox()).toEqual(['design']);
    expect(screen.getAllByTitle(DEFAULT_TEST_PROJECT_ROOT).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Switch to /tmp/picked-source' })).not.toBeInTheDocument();
  });
});
