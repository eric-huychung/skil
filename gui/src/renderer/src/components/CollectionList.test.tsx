import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionList from './CollectionList';
import {
  createInMemoryEngine,
  createInMemoryWorkspace,
  createTestBridge,
  DEFAULT_TEST_PROJECT_ROOT,
  renderWithProviders,
} from '../test-utils';
import { err, ok } from '../../../../../src/core/result.js';
import type { ExportResult } from '../../../../../src/types/index.js';

describe('CollectionList', () => {
  it('shows the empty state when there are no commands', async () => {
    const bridge = createTestBridge(createInMemoryEngine());

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getByText('No commands yet')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Scan (connect a folder first)' })).toBeDisabled();
    expect(screen.getByText('Connect a project folder to scan')).toBeInTheDocument();
  });

  it('renders one card per command and shows the selected command skills in the detail panel', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('backend', ['addyosmani/api-design']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getAllByRole('listitem', { name: /^Command / })).toHaveLength(2));
    const detail = screen.getByRole('region', { name: 'Command frontend details' });
    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).queryByText('addyosmani/api-design')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('listitem', { name: 'Command backend' }));

    const backendDetail = screen.getByRole('region', { name: 'Command backend details' });
    expect(within(backendDetail).getByText('addyosmani/api-design')).toBeInTheDocument();
    expect(within(backendDetail).queryByText('obra/react-patterns')).not.toBeInTheDocument();
  });

  it('shows Inbox as unfiled inventory, not as a command card', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const heading = await screen.findByRole('heading', { name: 'Commands' });
    const panel = heading.closest('section');
    if (!panel) throw new Error('expected commands panel');

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Command Inbox' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('File into')).not.toBeInTheDocument();
  });

  it('adds an Inbox ID to the selected collection without removing it from Inbox', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.create('backend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await userEvent.click(await screen.findByRole('listitem', { name: 'Command backend' }));

    const detail = screen.getByRole('region', { name: 'Command backend details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Add obra/react-patterns to backend' }));

    await waitFor(() =>
      expect(engine.list().find((collection) => collection.name === 'backend')?.skills).toEqual([
        'obra/react-patterns',
      ])
    );
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
    expect(engine.list().find((collection) => collection.name === 'frontend')?.skills).toEqual([]);
    expect(within(detail).getByRole('button', { name: 'Added obra/react-patterns' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('listitem', { name: 'Command frontend' }));
    const frontendDetail = screen.getByRole('region', { name: 'Command frontend details' });
    await userEvent.click(within(frontendDetail).getByRole('button', { name: 'Add obra/react-patterns to frontend' }));

    await waitFor(() =>
      expect(engine.list().find((collection) => collection.name === 'frontend')?.skills).toEqual([
        'obra/react-patterns',
      ])
    );
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
  });

  it('collapses the Inbox picker on a collection', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    const toggle = within(detail).getByRole('button', { name: 'From Inbox, 1 skill' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(detail).getByRole('button', { name: 'Add obra/react-patterns to frontend' })).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(detail).queryByRole('button', { name: 'Add obra/react-patterns to frontend' })).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(detail).getByRole('button', { name: 'Add obra/react-patterns to frontend' })).toBeInTheDocument();
  });

  it('removes a skill from a collection when its remove button is clicked', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    await waitFor(() => expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument());

    await userEvent.click(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' }));

    await waitFor(() => expect(within(detail).queryByText('obra/react-patterns')).not.toBeInTheDocument());
    expect(engine.list()[0].skills).toEqual([]);
  });

  it('exports a collection to the selected IDE', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    await userEvent.selectOptions(within(detail).getByLabelText('Export frontend to'), 'claude');
    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByText('Exported to claude')).toBeInTheDocument());
  });

  it('shows an inline error when export fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const failureResult: ExportResult = { succeeded: [], failures: ["'frontend:obra/react-patterns': boom"] };
    const bridge = { ...createTestBridge(engine), exportCollections: async () => ok(failureResult) };

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByRole('alert')).toHaveTextContent(/boom/));
  });

  it('shows an inline error when the export call itself fails', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = { ...createTestBridge(engine), exportCollections: async () => err(new Error('network down')) };

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Export frontend' }));

    await waitFor(() => expect(within(detail).getByRole('alert')).toHaveTextContent(/network down/));
  });

  it('deletes the selected collection after confirm', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Delete frontend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete command' }));

    await waitFor(() => expect(engine.list()).toEqual([]));
    expect(screen.getByText('No commands yet')).toBeInTheDocument();
  });

  it('surfaces gone ids after Scan when a skill folder is removed', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
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

    renderWithProviders(<CollectionList />, { bridge });
    const inventory = (await screen.findByRole('heading', { name: 'Inbox' })).closest('.inbox-inventory');
    if (!inventory) throw new Error('expected inbox inventory');

    await waitFor(() =>
      expect(within(inventory as HTMLElement).getByRole('button', { name: 'Install obra/react-patterns' })).toBeEnabled()
    );
    await userEvent.selectOptions(
      within(inventory as HTMLElement).getByLabelText('Install obra/react-patterns to'),
      'claude'
    );
    await userEvent.click(within(inventory as HTMLElement).getByRole('button', { name: 'Install obra/react-patterns' }));

    await waitFor(() => {
      expect(engine.skills().find((skill) => skill.id === 'obra/react-patterns')?.deployedTo.map((row) => row.ide)).toEqual([
        'claude',
      ]);
    });
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
  });

  it('installs a filed skill from the command detail to the chosen IDE', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    await waitFor(() =>
      expect(within(detail).getByRole('button', { name: 'Install obra/react-patterns' })).toBeEnabled()
    );
    await userEvent.selectOptions(within(detail).getByLabelText('Install obra/react-patterns to'), 'windsurf');
    await userEvent.click(within(detail).getByRole('button', { name: 'Install obra/react-patterns' }));

    await waitFor(() => {
      expect(engine.skills()[0]?.deployedTo.map((row) => row.ide)).toEqual(['windsurf']);
    });
  });

  it('shows a visible error when install fails', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = {
      ...createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT }),
      install: async () => err(new Error('npx skills add failed')),
    };

    renderWithProviders(<CollectionList />, { bridge });
    const inventory = (await screen.findByRole('heading', { name: 'Inbox' })).closest('.inbox-inventory');
    if (!inventory) throw new Error('expected inbox inventory');

    await waitFor(() =>
      expect(within(inventory as HTMLElement).getByRole('button', { name: 'Install obra/react-patterns' })).toBeEnabled()
    );
    await userEvent.click(within(inventory as HTMLElement).getByRole('button', { name: 'Install obra/react-patterns' }));

    const alert = await within(inventory as HTMLElement).findByRole('alert');
    expect(alert).toHaveTextContent(/npx skills add failed/);
    expect(alert).not.toHaveClass('sr-only');
    expect(engine.skills()).toEqual([]);
  });

  it('disables Install until a folder is connected', async () => {
    const engine = createInMemoryEngine();
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    expect(
      await screen.findByRole('button', { name: 'Install obra/react-patterns (connect a folder first)' })
    ).toBeDisabled();
    expect(engine.skills()).toEqual([]);
  });

  it('does not delete when the confirm dialog is canceled', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    await userEvent.click(within(detail).getByRole('button', { name: 'Delete frontend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(engine.list()).toHaveLength(1);
    expect(screen.getByRole('listitem', { name: 'Command frontend' })).toBeInTheDocument();
  });
});
