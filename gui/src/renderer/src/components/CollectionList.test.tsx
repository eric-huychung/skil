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
import { InMemoryUsageCollector } from '../../../../../src/adapters/in-memory-usage.js';
import { err, isOk, ok, type Result } from '../../../../../src/core/result.js';
import type { ExportResult } from '../../../../../src/types/index.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function selectDock(label: string) {
  await userEvent.click(screen.getByRole('button', { name: /^Pick format:/ }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: label }));
}

describe('CollectionList', () => {
  it('shows one command list with no IDE workspace cards', async () => {
    const engine = createInMemoryEngine();
    engine.create('build', ['tdd', 'design']);
    engine.create('review', ['tdd']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toBeInTheDocument());
    expect(screen.getByRole('listitem', { name: 'Command review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Cursor workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to IDEs' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Pick format:/ })).toBeInTheDocument();
  });

  it('shows filed skill counts on the command list, not on-disk catalog', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/ui/SKILL.md', '# ui\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('1 skill'));
    expect(screen.queryByRole('button', { name: 'Open Cursor workspace' })).not.toBeInTheDocument();
  });

  it('updates the command skill count after filing and removing a skill', async () => {
    const engine = createInMemoryEngine();
    engine.create('build', []);
    engine.addToInbox('tdd');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('0 skills'));

    const detail = await screen.findByRole('region', { name: 'Command build details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Add tdd to build' }));

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('1 skill'));

    await userEvent.click(within(screen.getByRole('region', { name: 'Command build details' })).getByRole('button', { name: 'Remove tdd' }));

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('0 skills'));
  });

  it('copies the map to the selected dock without asking which IDE to file onto', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('frontend', ['tdd']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
    expect(isOk(fs.readFile('.claude/commands/frontend.md'))).toBe(true);
    expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('files from Inbox onto the one list without asking which IDE', async () => {
    const engine = createInMemoryEngine();
    engine.create('build', ['tdd']);
    engine.addToInbox('design');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command build details' });
    expect(within(detail).getByText('tdd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Claude Code workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /which IDE/i })).not.toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('button', { name: 'Add design to build' }));

    await waitFor(() => expect(engine.list()[0]?.skills).toEqual(['tdd', 'design']));
  });

  it('shows the empty state when there are no commands', async () => {
    const bridge = createTestBridge(createInMemoryEngine());

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByText('No commands yet')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Pick format:/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Format')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inbox' })).not.toBeInTheDocument();
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

  it('keeps Inbox inventory off the Commands list and files from the picker', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const heading = await screen.findByRole('heading', { name: 'Commands' });
    const panel = heading.closest('section');
    if (!panel) throw new Error('expected commands panel');

    expect(within(panel as HTMLElement).queryByRole('heading', { name: 'Inbox' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Command Inbox' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('File into')).not.toBeInTheDocument();
    const detail = screen.getByRole('region', { name: 'Command frontend details' });
    expect(within(detail).getByRole('button', { name: 'From Inbox, 1 skill' })).toBeInTheDocument();
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

  it('copies every command file and local skills to the selected dock', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('frontend', ['tdd']);
    engine.create('backend', []);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    const workspace = await screen.findByRole('heading', { name: 'Commands' });
    expect(workspace).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export frontend' })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    const dialog = await screen.findByRole('dialog', { name: 'Exported' });
    expect(dialog).toHaveTextContent('Exported all commands to Claude Code in test-project');
    expect(dialog).toHaveTextContent('.claude/commands/frontend.md');
    expect(dialog).toHaveClass('status-success');
    const written = fs.readFile('.claude/commands/frontend.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
      expect(written.value).toContain('- tdd');
    }
    expect(isOk(fs.readFile('.claude/commands/backend.md'))).toBe(true);
    expect(fs.readFile('.claude/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
    expect(fs.readFile('.cursor/skills/tdd/SKILL.md')).toEqual({ ok: true, value: '# tdd\n' });
  });

  it('shows an unstamped conflict and replaces only after confirm', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', ['obra/react-patterns']);
    fs.writeFile('.cursor/commands/frontend.md', '# their old /frontend\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Replace existing commands?' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Replace existing commands?' })).getByText('/frontend')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Export failed' })).not.toBeInTheDocument();
    expect(fs.readFile('.cursor/commands/frontend.md')).toEqual({
      ok: true,
      value: '# their old /frontend\n',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported all commands to Cursor in test-project'
    );
    const written = fs.readFile('.cursor/commands/frontend.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
      expect(written.value).not.toContain('their old /frontend');
    }
  });

  it('leaves an unstamped file alone when replace is canceled', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', ['obra/react-patterns']);
    fs.writeFile('.cursor/commands/frontend.md', '# their old /frontend\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(fs.readFile('.cursor/commands/frontend.md')).toEqual({
      ok: true,
      value: '# their old /frontend\n',
    });
    expect(screen.queryByRole('dialog', { name: 'Exported' })).not.toBeInTheDocument();
  });

  it('copies to a picked destination when no folder is connected', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine, { nextDestination: '/tmp/other-project' });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    const destDialog = await screen.findByRole('dialog', { name: 'Exported' });
    expect(destDialog).toHaveTextContent('Exported all commands to Claude Code in other-project');
    expect(destDialog).toHaveTextContent('/tmp/other-project/.claude/commands/frontend.md');
    const written = fs.readFile('/tmp/other-project/.claude/commands/frontend.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
    }
    expect(isOk(fs.readFile('.claude/commands/frontend.md'))).toBe(false);
    expect(await bridge.getProjectRoot()).toBe('/tmp/other-project');
  });

  it('binds the picked folder after export so later saves skip the picker', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', ['obra/react-patterns']);
    const destinations = ['/tmp/first-dest', '/tmp/second-dest'];
    let pickCount = 0;
    const exportedDests: Array<string | undefined> = [];
    const base = createTestBridge(engine);
    const bridge = {
      ...base,
      pickDestinationFolder: async () => destinations[pickCount++] ?? null,
      exportAll: async (...args: Parameters<typeof base.exportAll>) => {
        exportedDests.push(args[1]?.dest);
        return base.exportAll(...args);
      },
    };

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    expect(await bridge.getProjectRoot()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported all commands to Cursor in first-dest'
    );
    expect(await bridge.getProjectRoot()).toBe('/tmp/first-dest');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const secondDialog = await screen.findByRole('dialog', { name: 'Exported' });
    expect(secondDialog).toHaveTextContent('Exported all commands to Cursor in first-dest');
    expect(secondDialog).toHaveTextContent('.cursor/commands/frontend.md');
    expect(pickCount).toBe(1);
    expect(exportedDests).toEqual(['/tmp/first-dest', undefined]);
    expect(isOk(fs.readFile('/tmp/first-dest/.cursor/commands/frontend.md'))).toBe(true);
    expect(await bridge.getProjectRoot()).toBe('/tmp/first-dest');
  });

  it('reuses the picked dest when replacing an unstamped file with no folder connected', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', ['obra/react-patterns']);
    fs.writeFile('/tmp/first-dest/.cursor/commands/frontend.md', '# their old /frontend\n');
    let pickCount = 0;
    const base = createTestBridge(engine);
    const bridge = {
      ...base,
      pickDestinationFolder: async () => {
        pickCount += 1;
        return '/tmp/first-dest';
      },
    };

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('dialog', { name: 'Replace existing commands?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported all commands to Cursor in first-dest'
    );
    expect(pickCount).toBe(1);
    const written = fs.readFile('/tmp/first-dest/.cursor/commands/frontend.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
    }
  });

  it('does not export when destination pick is canceled', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine, { nextDestination: null });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.queryByRole('dialog', { name: 'Exported' })).not.toBeInTheDocument();
    expect(isOk(fs.readFile('.cursor/commands/frontend.md'))).toBe(false);
    expect(isOk(fs.readFile('/tmp/other-project/.cursor/commands/frontend.md'))).toBe(false);
  });

  it('shows a loading dialog while export is pending', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const deferred = createDeferred<Result<ExportResult>>();
    const bridge = {
      ...createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT }),
      exportAll: () => deferred.promise,
    };

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(screen.getByRole('dialog', { name: 'Exporting…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();

    deferred.resolve(ok({ succeeded: ['.cursor/commands/frontend.md'], failures: [] }));
    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
  });

  it('shows an export error modal with collapsed details', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = {
      ...createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT }),
      exportAll: async () => err(new Error('network down\nstderr: boom')),
    };

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    const dialog = await screen.findByRole('dialog', { name: 'Export failed' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not export commands to Cursor in test-project'
    );
    expect(dialog).toHaveClass('status-error');
    const details = within(dialog).getByText('Details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(within(dialog).getByText(/stderr: boom/)).not.toBeVisible();

    await userEvent.click(within(dialog).getByText('Details'));
    expect(details).toHaveAttribute('open');
    expect(within(dialog).getByText(/stderr: boom/)).toBeVisible();
  });

  it('filters the From Inbox picker as you type', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');
    engine.addToInbox('addyosmani/api-design');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).getByText('addyosmani/api-design')).toBeInTheDocument();

    await userEvent.type(within(detail).getByLabelText('Filter inbox'), 'react');

    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).queryByText('addyosmani/api-design')).not.toBeInTheDocument();
  });

  it('pages the From Inbox picker when there are more than 10 matches', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    for (let index = 0; index < 11; index += 1) {
      engine.addToInbox(`skill/${index}`);
    }
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    expect(await within(detail).findByText('skill/0')).toBeInTheDocument();
    expect(within(detail).getByText('skill/9')).toBeInTheDocument();
    expect(within(detail).queryByText('skill/10')).not.toBeInTheDocument();
    expect(within(detail).getByText('Page 1 of 2')).toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('button', { name: 'Next inbox page' }));

    expect(within(detail).getByText('skill/10')).toBeInTheDocument();
    expect(within(detail).queryByText('skill/0')).not.toBeInTheDocument();
  });

  it('places Export on the workspace, then Included skills, then From Inbox on the command', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['addyosmani/api-design']);
    engine.addToInbox('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const heading = await screen.findByRole('heading', { name: 'Commands' });
    const workspace = heading.closest('section');
    if (!workspace) throw new Error('expected commands panel');
    const detail = screen.getByRole('region', { name: 'Command frontend details' });

    const exportButton = within(workspace as HTMLElement).getByRole('button', { name: 'Export' });
    expect(within(detail).queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    const included = within(detail).getByText('Included skills');
    const inboxToggle = within(detail).getByRole('button', { name: 'From Inbox, 1 skill' });
    expect(exportButton.compareDocumentPosition(included) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(included.compareDocumentPosition(inboxToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('groups planning, build, and testing under SDLC headings', async () => {
    const engine = createInMemoryEngine();
    engine.create('planning', ['a', 'b']);
    engine.create('build', ['c']);
    engine.create('testing', []);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    expect(await screen.findByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Command planning' })).toHaveTextContent('2 skills');
    expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('1 skill');
    expect(screen.getByRole('listitem', { name: 'Command testing' })).toHaveTextContent('0 skills');
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

  it('does not show Install on filed skills', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', ['obra/react-patterns']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    expect(await within(detail).findByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: 'Install obra/react-patterns' })).not.toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Remove obra/react-patterns' })).toBeInTheDocument();
    const included = within(detail).getByText('obra/react-patterns').closest('.included-skill');
    if (!included) throw new Error('expected included skill row');
    expect(included.querySelector('.checkmark')).toBeNull();
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

  it('picks a dest format from a dropdown and exports with one button', async () => {
    const engine = createInMemoryEngine();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Pick format: Cursor' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pick format: Cursor' }));
    const menu = screen.getByRole('menu', { name: 'Pick format' });
    expect(within(menu).getByRole('menuitemradio', { name: 'Cursor' })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitemradio', { name: 'Claude Code' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Codex' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Copilot' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Agents' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitemradio', { name: 'Windsurf' })).not.toBeInTheDocument();

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'Claude Code' }));
    expect(screen.getByRole('button', { name: 'Pick format: Claude Code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  });

  it('copies every command to the selected dock', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
    expect(engine.list()[0]?.skills).toEqual(['tdd']);
    expect(isOk(fs.readFile('.claude/commands/build.md'))).toBe(true);
  });

  it('lists every unstamped command before save', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('frontend', []);
    engine.create('backend', []);
    fs.writeFile('.cursor/commands/frontend.md', '# their old /frontend\n');
    fs.writeFile('.cursor/commands/backend.md', '# their old /backend\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    const dialog = await screen.findByRole('dialog', { name: 'Replace existing commands?' });
    expect(within(dialog).getByText('/frontend')).toBeInTheDocument();
    expect(within(dialog).getByText('/backend')).toBeInTheDocument();
    expect(fs.readFile('.cursor/commands/frontend.md')).toEqual({
      ok: true,
      value: '# their old /frontend\n',
    });
  });

  it('copies all to Claude without rewriting the Cursor stamp', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('build', ['tdd']);
    const cursorStamp = fs.readFile('.cursor/commands/build.md');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
    expect(engine.list()[0]?.skills).toEqual(['tdd']);
    expect(fs.readFile('.cursor/commands/build.md')).toEqual(cursorStamp);
    const claudeFile = fs.readFile('.claude/commands/build.md');
    expect(isOk(claudeFile)).toBe(true);
    if (isOk(claudeFile)) {
      expect(claudeFile.value).toContain('generated_by: skil');
    }
  });

  it('asks to replace an unstamped dest file on copy', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('build', ['tdd']);
    fs.writeFile('.claude/commands/build.md', '# leftover\n');
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    const dialog = await screen.findByRole('dialog', { name: 'Replace existing commands?' });
    expect(within(dialog).getByText('/build')).toBeInTheDocument();
    expect(fs.readFile('.claude/commands/build.md')).toEqual({ ok: true, value: '# leftover\n' });
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
    const written = fs.readFile('.claude/commands/build.md');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('generated_by: skil');
    }
  });

  it('shows a usage count on a filed skill', async () => {
    const usage = new InMemoryUsageCollector();
    usage.seed([
      { skillId: 'tdd', source: 'claude' },
      { skillId: 'tdd', source: 'claude' },
    ]);
    const { engine, fs } = createInMemoryWorkspace(usage);
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });

    const detail = await screen.findByRole('region', { name: 'Command build details' });
    expect(await within(detail).findByText('2 reads')).toBeInTheDocument();
  });

  it('still exports when usage fails', async () => {
    const usage = new InMemoryUsageCollector();
    usage.setCollectError(new Error('log unreadable'));
    const { engine, fs } = createInMemoryWorkspace(usage);
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine, { projectRoot: DEFAULT_TEST_PROJECT_ROOT });

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toBeInTheDocument();
    expect(isOk(fs.readFile('.cursor/commands/build.md'))).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
