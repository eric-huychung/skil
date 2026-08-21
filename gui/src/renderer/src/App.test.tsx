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

async function clickPickFolder() {
  const heading = await screen.findByRole('heading', { name: 'Pick a project folder' });
  const panel = heading.closest('section');
  if (!panel) throw new Error('expected pick-folder empty state');
  await userEvent.click(within(panel).getByRole('button', { name: 'Pick folder' }));
}

describe('App', () => {
  it('mounts without crashing and asks for a project folder before showing collections', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByText('ContextKit')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Pick a project folder' })).toBeInTheDocument();
    expect(screen.queryByText('No collections yet')).not.toBeInTheDocument();
  });

  it('shows the folder name in the header after a pick, then lists that project collections', async () => {
    const engine = installTestBridge(createInMemoryEngine());
    engine.create('frontend', ['obra/react-patterns']);

    renderWithProviders(<App />);
    await clickPickFolder();

    expect(await screen.findByText('test-project')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Collection frontend' })).toBeInTheDocument();
  });

  it('defaults to the Collections workspace; tools stay disabled until a folder is picked', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);

    expect(screen.getByRole('tab', { name: 'Collections' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Pick a project folder' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    await clickPickFolder();

    expect(await screen.findByText('test-project')).toBeInTheDocument();
    expect(await screen.findByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByText('No collections yet')).toBeInTheDocument();
  });

  it('shows the config placeholder when Sync is selected, not the folder picker', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Sync' }));

    expect(screen.getByRole('tab', { name: 'Sync' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Config is in dev' })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pick a project folder' })).not.toBeInTheDocument();
  });

  it('keeps Discover gated until a folder is picked', async () => {
    installTestBridge(createInMemoryEngine());

    renderWithProviders(<App />);
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));

    expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Pick a project folder' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Search skills')).not.toBeInTheDocument();

    await clickPickFolder();

    expect(await screen.findByLabelText('Search skills')).toBeInTheDocument();
  });

  it('leaves the bound folder unchanged when the picker is canceled', async () => {
    installTestBridge(createInMemoryEngine(), {
      projectRoot: DEFAULT_TEST_PROJECT_ROOT,
      nextPick: null,
    });

    renderWithProviders(<App />);

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
