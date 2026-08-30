import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectionList from './CollectionList';
import { createInMemoryEngine, createInMemoryWorkspace, createTestBridge, renderWithProviders } from '../test-utils';
import { InMemoryUsageCollector } from '../../../../../src/adapters/in-memory-usage.js';
import { isOk } from '../../../../../src/core/result.js';

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
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pick format:/ })).not.toBeInTheDocument();
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
    await engine.install('tdd');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('0 skills'));

    const detail = await screen.findByRole('region', { name: 'Command build details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Add tdd to build' }));

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('1 skill'));

    await userEvent.click(within(screen.getByRole('region', { name: 'Command build details' })).getByRole('button', { name: 'Remove tdd' }));

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'Command build' })).toHaveTextContent('0 skills'));
  });

  it('files from Skills onto the one list without asking which IDE', async () => {
    const engine = createInMemoryEngine();
    engine.create('build', ['tdd']);
    await engine.install('design');
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
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Format')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
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

  it('keeps Skills inventory off the Commands list and files from the picker', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    await engine.install('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const heading = await screen.findByRole('heading', { name: 'Commands' });
    const panel = heading.closest('section');
    if (!panel) throw new Error('expected commands panel');

    expect(within(panel as HTMLElement).queryByRole('heading', { name: 'Skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Command Inbox' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('File into')).not.toBeInTheDocument();
    const detail = screen.getByRole('region', { name: 'Command frontend details' });
    expect(within(detail).getByRole('button', { name: 'From Skills, 1 skill' })).toBeInTheDocument();
  });

  it('adds a Skills catalog id to the selected collection without removing it from the catalog', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    engine.create('backend', []);
    await engine.install('obra/react-patterns');
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
    expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
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
    expect(engine.skills().map((skill) => skill.id)).toEqual(['obra/react-patterns']);
  });

  it('collapses the From Skills picker on a collection', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    await engine.install('obra/react-patterns');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    const toggle = within(detail).getByRole('button', { name: 'From Skills, 1 skill' });

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

  it('filters the From Skills picker as you type', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    await engine.install('obra/react-patterns');
    await engine.install('addyosmani/api-design');
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });
    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).getByText('addyosmani/api-design')).toBeInTheDocument();

    await userEvent.type(within(detail).getByLabelText('Filter skills'), 'react');

    expect(within(detail).getByText('obra/react-patterns')).toBeInTheDocument();
    expect(within(detail).queryByText('addyosmani/api-design')).not.toBeInTheDocument();
  });

  it('pages the From Skills picker when there are more than 10 matches', async () => {
    const engine = createInMemoryEngine();
    engine.create('frontend', []);
    for (let index = 0; index < 11; index += 1) {
      await engine.install(`skill/${index}`);
    }
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command frontend details' });

    expect(await within(detail).findByText('skill/0')).toBeInTheDocument();
    expect(within(detail).getByText('skill/9')).toBeInTheDocument();
    expect(within(detail).queryByText('skill/10')).not.toBeInTheDocument();
    expect(within(detail).getByText('Page 1 of 2')).toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('button', { name: 'Next skills page' }));

    expect(within(detail).getByText('skill/10')).toBeInTheDocument();
    expect(within(detail).queryByText('skill/0')).not.toBeInTheDocument();
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
    const bridge = createTestBridge(engine);

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

  it('toggles a command on from the list, writing the human-only skill in both live trees', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const row = await screen.findByRole('listitem', { name: 'Command build' });
    const toggle = within(row).getByRole('button', { name: 'Turn on build' });

    await userEvent.click(toggle);

    await waitFor(() => expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true));
    expect(isOk(fs.readFile('.claude/skills/build/SKILL.md'))).toBe(true);
    expect(within(row).getByRole('button', { name: 'Turn off build' })).toBeInTheDocument();
  });

  it('toggles a command off from the detail panel, parking the live pair', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    engine.create('build', ['tdd']);
    await engine.setCommandEnabled('build', true);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command build details' });
    const toggle = within(detail).getByRole('button', { name: 'Turn off build' });

    await userEvent.click(toggle);

    await waitFor(() => expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(false));
    expect(isOk(fs.readFile('.skil/parked/commands/build/SKILL.md'))).toBe(true);
    expect(within(screen.getByRole('region', { name: 'Command build details' })).getByRole('button', { name: 'Turn on build' })).toBeInTheDocument();
  });

  it('shows a name-collision error and does not toggle on when a non-command skill already owns that live path', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.agents/skills/build/SKILL.md', '# not ours\n');
    engine.create('build', ['tdd']);
    const bridge = createTestBridge(engine);

    renderWithProviders(<CollectionList />, { bridge });
    const detail = await screen.findByRole('region', { name: 'Command build details' });
    await userEvent.click(within(detail).getByRole('button', { name: 'Turn on build' }));

    expect(await within(detail).findByRole('alert')).toHaveTextContent(/build/);
    expect(within(detail).getByRole('button', { name: 'Turn on build' })).toBeInTheDocument();
  });
});
