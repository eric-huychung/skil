import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import {
  createInMemoryEngine,
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
  it('mounts on Collections with the empty collections UI, not a pick-folder wall', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByText('ContextKit')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Collections' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No collections yet')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a project folder' })).not.toBeInTheDocument();
  });

  it('reflects collections created through the engine without connecting a folder first', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', ['obra/react-patterns']);

    renderWithProviders(<App />);

    expect(await screen.findByRole('listitem', { name: 'Collection frontend' })).toBeInTheDocument();
  });

  it('always shows Discover search without connecting a folder', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));

    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Search skills')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a project folder' })).not.toBeInTheDocument();
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

  it('opens a help dialog from the rail', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('dialog', { name: 'How can we help?' })).toBeInTheDocument();
  });
});
