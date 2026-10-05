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
    expect(screen.queryByText('pair-programming')).not.toBeInTheDocument();

    const behavior = await screen.findByRole('listitem', { name: 'Rule behavior' });
    expect(within(behavior).getByText('behavior')).toBeInTheDocument();
    expect(behavior).not.toHaveTextContent('pair-programming/behavior');
    expect(within(behavior).getByRole('button', { name: 'Turn off behavior', pressed: true })).toBeInTheDocument();

    const optional = screen.getByRole('listitem', { name: 'Rule optional' });
    expect(within(optional).getByText('Path-scoped')).toBeInTheDocument();
    expect(within(optional).queryByRole('button', { name: /Always apply/ })).not.toBeInTheDocument();

    expect(screen.queryByRole('dialog', { name: 'behavior' })).not.toBeInTheDocument();
  });

  it('hides a glob copy after it is imported into AGENTS.md', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile(
      'AGENTS.md',
      '<!-- skil:rule behavior -->\n# behavior\n<!-- /skil:rule behavior -->\n'
    );
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    expect(await screen.findByRole('listitem', { name: 'Rule behavior' })).toBeInTheDocument();
    expect(screen.queryByText('Path-scoped')).not.toBeInTheDocument();
  });

  it('shows a health warning on a rule row named by a doctor finding', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile(
      'AGENTS.md',
      '<!-- skil:rule pair-programming/behavior -->\n# behavior\n<!-- /skil:rule pair-programming/behavior -->\n'
    );
    const bridge = createTestBridge(engine);
    bridge.health = async () => ({
      ok: true,
      value: [
        {
          name: 'build',
          tokenEstimate: 10,
          warnCount: 1,
          usedLlm: false,
          findings: [{ type: 'secret', skillId: 'pair-programming/behavior', message: 'looks risky' }],
        },
      ],
    });

    renderWithProviders(<RulesPanel />, { bridge });

    expect(await screen.findByLabelText('behavior has a health warning')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'behavior has a health warning' })).not.toBeInTheDocument();
    expect(screen.queryByText('Finding')).not.toBeInTheDocument();
  });

  it('opens the doctor modal from the rule preview warning banner', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile(
      'AGENTS.md',
      '<!-- skil:rule pair-programming/behavior -->\n---\ndescription: abcd\n---\n# behavior\n<!-- /skil:rule pair-programming/behavior -->\n'
    );
    const bridge = createTestBridge(engine);
    bridge.health = async () => ({
      ok: true,
      value: [
        {
          name: 'build',
          tokenEstimate: 10,
          warnCount: 1,
          usedLlm: false,
          findings: [{ type: 'secret', skillId: 'pair-programming/behavior', message: 'looks risky' }],
        },
      ],
    });

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for behavior' }));

    const preview = await screen.findByRole('dialog', { name: 'behavior' });
    expect(await within(preview).findByText(/token/)).toBeInTheDocument();
    expect(within(preview).queryByText('Secret leak')).not.toBeInTheDocument();

    await userEvent.click(within(preview).getByRole('button', { name: '1 warning' }));
    const health = await screen.findByRole('dialog', { name: 'Health' });
    expect(within(health).getByText('Secret leak')).toBeInTheDocument();
    expect(within(health).getByText('looks risky')).toBeInTheDocument();
  });

  it('opens a preview modal for a shared rule when its card is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# Hello rule\n<!-- /skil:rule behavior -->\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    await userEvent.click(await screen.findByRole('button', { name: 'Details for Hello rule' }));

    const preview = await screen.findByRole('dialog', { name: 'Hello rule' });
    expect(await within(preview).findByRole('heading', { level: 2, name: 'Hello rule' })).toBeInTheDocument();
    expect(preview).toHaveTextContent('AGENTS.md');
    expect(preview).toHaveTextContent('Shared law');
    expect(within(preview).getByRole('button', { name: 'Turn off Hello rule', pressed: true })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog', { name: 'Hello rule' })).not.toBeInTheDocument();
  });

  it('opens a preview modal for a glob rule and strips frontmatter', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\ndescription: test\n---\n# Hello rule\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    await userEvent.click(await screen.findByRole('button', { name: 'Details for Hello rule' }));

    const preview = await screen.findByRole('dialog', { name: 'Hello rule' });
    expect(await within(preview).findByRole('heading', { level: 2, name: 'Hello rule' })).toBeInTheDocument();
    expect(preview).not.toHaveTextContent('description: test');
    expect(preview).toHaveTextContent('.cursor/rules/behavior.mdc');
    expect(preview).toHaveTextContent('Path-scoped');
  });

  it('does not open the preview when the toggle is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# body\n<!-- /skil:rule behavior -->\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off body', pressed: true }));

    expect(await screen.findByRole('button', { name: 'Always apply body', pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'body' })).not.toBeInTheDocument();
  });

  it('turns a shared rule off, parking it, and back on, restoring the AGENTS.md section', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('AGENTS.md', '<!-- skil:rule behavior -->\n# body\n<!-- /skil:rule behavior -->\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off body', pressed: true }));

    expect(await screen.findByRole('button', { name: 'Always apply body', pressed: false })).toBeInTheDocument();
    expect(fs.readFile('AGENTS.md')).toEqual({ ok: true, value: '' });
    expect(isOk(fs.readFile('.skil/parked/rules/behavior'))).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Always apply body', pressed: false }));

    expect(await screen.findByRole('button', { name: 'Turn off body', pressed: true })).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off body', pressed: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update this rule");
    expect(screen.getByRole('button', { name: 'Turn off body', pressed: true })).toBeInTheDocument();
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
    expect(within(folder as HTMLElement).getByRole('listitem', { name: 'Rule auth' })).toBeInTheDocument();
    expect(within(folder as HTMLElement).getByRole('listitem', { name: 'Rule secrets' })).toBeInTheDocument();
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
