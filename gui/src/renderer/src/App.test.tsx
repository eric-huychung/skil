import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {
  createInMemoryEngine,
  createInMemoryWorkspace,
  DEFAULT_TEST_PROJECT_ROOT,
  installTestBridge,
  renderWithProviders,
} from './test-utils';

async function openSync() {
  await userEvent.click(screen.getByRole('tab', { name: 'Sync' }));
}

async function clickPickFolder() {
  await openSync();
  const heading = await screen.findByRole('heading', { name: 'Project folder' });
  const card = heading.closest('.config-card');
  if (!card) throw new Error('expected project folder card');
  await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Pick folder' }));
}

describe('App', () => {
  it('mounts on Commands with the empty commands UI, not a pick-folder wall', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByText('ContextKit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Commands' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No commands yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan (connect a folder first)' })).toBeDisabled();
    expect(screen.getByText('Connect a project folder to scan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Command' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a project folder' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Collections/)).not.toBeInTheDocument();
  });

  it('reflects commands created through the engine without connecting a folder first', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', ['obra/react-patterns']);

    renderWithProviders(<App />);

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

  it('does not put Inbox on the rail', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');

    renderWithProviders(<App />);

    expect(screen.queryByRole('tab', { name: 'Inbox' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Commands' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add obra/react-patterns to frontend' })
    ).toBeInTheDocument();
  });

  it('puts Pick folder on Sync, not the header', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.queryByRole('button', { name: 'Pick folder' })).not.toBeInTheDocument();

    await clickPickFolder();

    expect(await screen.findByText('test-project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Config is in dev' })).toBeInTheDocument();
  });

  it('leaves the bound folder unchanged when the picker is canceled', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      nextPick: null,
    });

    renderWithProviders(<App />);
    await openSync();

    expect(await screen.findByText('test-project')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change folder' }));

    expect(screen.getByText('test-project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
  });

  it('scans the picked folder and lists unfiled skills in Inbox without creating commands', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/ui/styling/SKILL.md', '# styling\n');
    installTestBridge(engine);

    renderWithProviders(<App />);

    expect(await screen.findByText('No commands yet')).toBeInTheDocument();
    expect(screen.queryByText('tdd')).not.toBeInTheDocument();

    await clickPickFolder();
    await userEvent.click(screen.getByRole('tab', { name: 'Commands' }));

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText('tdd')).toBeInTheDocument();
    expect(screen.getByText('ui/styling')).toBeInTheDocument();
    expect(engine.inbox()).toEqual(['tdd', 'ui/styling']);
    expect(engine.list()).toEqual([]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled());
  });

  it('opens a help dialog from the rail', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('dialog', { name: 'How can we help?' })).toBeInTheDocument();
  });
});
