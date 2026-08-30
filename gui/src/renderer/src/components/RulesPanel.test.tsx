import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RulesPanel from './RulesPanel';
import { createInMemoryWorkspace, createTestBridge, renderWithProviders } from '../test-utils';
import { err, isOk } from '../../../../../src/core/result.js';
import type { Result, RuleRecord } from '../../../shared/ipc.js';

describe('RulesPanel', () => {
  it('lists a shared rule with an On/Off toggle and a glob rule as read-only', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile(
      'AGENTS.md',
      '<!-- skil:rule pair-programming/behavior -->\n# behavior\n<!-- /skil:rule pair-programming/behavior -->\n'
    );
    fs.writeFile('.cursor/rules/optional.mdc', '# optional\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pick format:/ })).not.toBeInTheDocument();

    const folder = screen.getByText('pair-programming').closest('.command-stage');
    expect(folder).not.toBeNull();
    const behavior = within(folder as HTMLElement).getByRole('listitem', { name: 'Rule pair-programming/behavior' });
    expect(within(behavior).getByText('behavior')).toBeInTheDocument();
    expect(behavior).not.toHaveTextContent('pair-programming/behavior');
    expect(within(behavior).getByRole('button', { name: 'On', pressed: true })).toBeInTheDocument();

    const other = screen.getByText('Other').closest('.command-stage');
    expect(other).not.toBeNull();
    expect(other).not.toBe(folder);
    const optional = within(other as HTMLElement).getByRole('listitem', { name: 'Rule optional' });
    expect(within(optional).getByText('Path-scoped')).toBeInTheDocument();
    expect(within(optional).queryByRole('button', { name: /^(On|Off)$/ })).not.toBeInTheDocument();

    expect(screen.queryByRole('dialog', { name: 'pair-programming/behavior' })).not.toBeInTheDocument();
  });

  it('opens a preview modal for a shared rule when its card is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# Hello rule\n<!-- /skil:rule behavior -->\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    await userEvent.click(await screen.findByRole('button', { name: 'Details for behavior' }));

    const preview = await screen.findByRole('dialog', { name: 'behavior' });
    expect(await within(preview).findByRole('heading', { name: 'Hello rule' })).toBeInTheDocument();
    expect(preview).toHaveTextContent('AGENTS.md');
    expect(preview).toHaveTextContent('Shared law');

    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog', { name: 'behavior' })).not.toBeInTheDocument();
  });

  it('opens a preview modal for a glob rule and strips frontmatter', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\ndescription: test\n---\n# Hello rule\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    await userEvent.click(await screen.findByRole('button', { name: 'Details for behavior' }));

    const preview = await screen.findByRole('dialog', { name: 'behavior' });
    expect(await within(preview).findByRole('heading', { name: 'Hello rule' })).toBeInTheDocument();
    expect(preview).not.toHaveTextContent('description: test');
    expect(preview).toHaveTextContent('.cursor/rules/behavior.mdc');
    expect(preview).toHaveTextContent('Path-scoped');
  });

  it('does not open the preview when the toggle is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# body\n<!-- /skil:rule behavior -->\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'On', pressed: true }));

    expect(await screen.findByRole('button', { name: 'Off', pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'behavior' })).not.toBeInTheDocument();
  });

  it('turns a shared rule off, parking it, and back on, restoring the AGENTS.md section', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# body\n<!-- /skil:rule behavior -->\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'On', pressed: true }));

    expect(await screen.findByRole('button', { name: 'Off', pressed: false })).toBeInTheDocument();
    expect(fs.readFile('AGENTS.md')).toEqual({ ok: true, value: '' });
    expect(isOk(fs.readFile('.skil/parked/rules/behavior'))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Off', pressed: false }));

    expect(await screen.findByRole('button', { name: 'On', pressed: true })).toBeInTheDocument();
    const agents = fs.readFile('AGENTS.md');
    expect(isOk(agents)).toBe(true);
    if (isOk(agents)) {
      expect(agents.value).toContain('<!-- skil:rule behavior -->');
      expect(agents.value).toContain('# body');
    }
  });

  it('shows an inline error when toggling fails, without dropping the row', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# body\n<!-- /skil:rule behavior -->\n');
    const real = createTestBridge(engine);
    const bridge = { ...real, setSharedRuleEnabled: async () => err(new Error('EACCES: permission denied')) };

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'On', pressed: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update this rule");
    expect(screen.getByRole('button', { name: 'On', pressed: true })).toBeInTheDocument();
  });

  it('refreshes after a watcher scan when a new rule appears', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();

    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    bridge.emitScan();

    expect(await screen.findByRole('listitem', { name: 'Rule behavior' })).toBeInTheDocument();
  });

  it('shows an empty state when the project has no rules', async () => {
    const { engine } = createInMemoryWorkspace();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
  });

  it('groups nested rules under the parent folder from disk, not a hardcoded list', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/team/security/auth.mdc', '# auth\n');
    fs.writeFile('.cursor/rules/team/security/secrets.mdc', '# secrets\n');
    fs.writeFile('.claude/rules/ship.md', '# ship\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    const folder = (await screen.findByText('team/security')).closest('.command-stage');
    expect(folder).not.toBeNull();
    expect(within(folder as HTMLElement).getByRole('listitem', { name: 'Rule team/security/auth' })).toBeInTheDocument();
    expect(within(folder as HTMLElement).getByRole('listitem', { name: 'Rule team/security/secrets' })).toBeInTheDocument();
    expect(within(folder as HTMLElement).queryByRole('listitem', { name: 'Rule ship' })).not.toBeInTheDocument();
    const other = screen.getByText('Other').closest('.command-stage');
    expect(within(other as HTMLElement).getByRole('listitem', { name: 'Rule ship' })).toBeInTheDocument();
  });

  it('shows a card skeleton while rules are loading', async () => {
    const { engine } = createInMemoryWorkspace();
    let resolveRules!: (value: RuleRecord[]) => void;
    const rulesPromise = new Promise<RuleRecord[]>((resolve) => {
      resolveRules = resolve;
    });
    const bridge = { ...createTestBridge(engine), listRules: () => rulesPromise };

    renderWithProviders(<RulesPanel />, { bridge });

    expect(screen.getByRole('status', { name: 'Loading rules' })).toBeInTheDocument();
    expect(screen.queryByText('Loading\u2026')).not.toBeInTheDocument();

    resolveRules([]);
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
  });

  it('shows a friendly error when a rule preview fails, not the raw failure', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    const bridge = {
      ...createTestBridge(engine),
      readRule: async (): Promise<Result<string>> => err(new Error('ENOENT: no such file, open /tmp/behavior.mdc')),
    };

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for behavior' }));

    const preview = await screen.findByRole('dialog', { name: 'behavior' });
    expect(await within(preview).findByRole('alert')).toHaveTextContent(/Couldn't load this rule/);
    expect(preview).not.toHaveTextContent('ENOENT');
    expect(preview).not.toHaveTextContent('/tmp/behavior.mdc');
  });
});
