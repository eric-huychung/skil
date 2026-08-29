import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RulesPanel from './RulesPanel';
import { createInMemoryWorkspace, createTestBridge, renderWithProviders } from '../test-utils';
import { err, isOk } from '../../../../../src/core/result.js';
import type { Result, RuleRecord } from '../../../shared/ipc.js';

async function selectDock(label: string) {
  await userEvent.click(screen.getByRole('button', { name: /^Pick format:/ }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: label }));
}

describe('RulesPanel', () => {
  it('lists every scanned rule as a name card with an Always on toggle', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile(
      '.cursor/rules/pair-programming/behavior.mdc',
      '---\nalwaysApply: true\n---\n# behavior\n'
    );
    fs.writeFile('.cursor/rules/optional.mdc', '---\nalwaysApply: false\n---\n# optional\n');
    fs.writeFile('CLAUDE.md', '# claude root\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Pick format:/ })).toBeInTheDocument();

    const folder = screen.getByText('pair-programming').closest('.command-stage');
    expect(folder).not.toBeNull();
    const behavior = within(folder as HTMLElement).getByRole('listitem', { name: 'Rule pair-programming/behavior' });
    expect(within(behavior).getByText('behavior')).toBeInTheDocument();
    expect(behavior).not.toHaveTextContent('pair-programming/behavior');
    expect(behavior).not.toHaveTextContent('Cursor');
    expect(behavior).not.toHaveTextContent('.cursor/rules');
    expect(within(behavior).getByRole('button', { name: 'Always on', pressed: true })).toBeInTheDocument();

    const other = screen.getByText('Other').closest('.command-stage');
    expect(other).not.toBeNull();
    expect(other).not.toBe(folder);

    const optional = within(other as HTMLElement).getByRole('listitem', { name: 'Rule optional' });
    expect(within(optional).getByRole('button', { name: 'Always on', pressed: false })).toBeInTheDocument();

    const claude = within(other as HTMLElement).getByRole('listitem', { name: 'Rule CLAUDE' });
    expect(within(claude).getByText('Always on')).toBeInTheDocument();
    expect(within(claude).queryByRole('button', { name: 'Always on' })).not.toBeInTheDocument();

    expect(screen.queryByRole('dialog', { name: 'pair-programming/behavior' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /details/ })).not.toBeInTheDocument();
  });

  it('opens a preview modal when a rule card is clicked', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# Hello rule\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    await userEvent.click(await screen.findByRole('button', { name: 'Details for behavior' }));

    const preview = await screen.findByRole('dialog', { name: 'behavior' });
    expect(await within(preview).findByRole('heading', { name: 'Hello rule' })).toBeInTheDocument();
    expect(preview).not.toHaveTextContent('alwaysApply');
    expect(preview).toHaveTextContent('.cursor/rules/behavior.mdc');

    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog', { name: 'behavior' })).not.toBeInTheDocument();
  });

  it('opens a preview for always-on root files that cannot toggle', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('CLAUDE.md', '# claude root\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    await userEvent.click(await screen.findByRole('button', { name: 'Details for CLAUDE' }));

    const preview = await screen.findByRole('dialog', { name: 'CLAUDE' });
    expect(await within(preview).findByRole('heading', { name: 'claude root' })).toBeInTheDocument();
    expect(preview).toHaveTextContent('CLAUDE.md');
  });

  it('does not open the preview when Always on is toggled', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# body\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Always on', pressed: true }));

    expect(await screen.findByRole('button', { name: 'Always on', pressed: false })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'behavior' })).not.toBeInTheDocument();
    const written = fs.readFile('.cursor/rules/behavior.mdc');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('alwaysApply: false');
    }
  });

  it('toggles always-on on every dock copy of the rule', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# body\n');
    fs.writeFile('.claude/rules/behavior.md', '---\nalwaysApply: true\n---\n# body\n');
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Always on', pressed: true }));

    expect(await screen.findByRole('button', { name: 'Always on', pressed: false })).toBeInTheDocument();
    expect(fs.readFile('.cursor/rules/behavior.mdc')).toEqual({
      ok: true,
      value: '---\nalwaysApply: false\n---\n# body\n',
    });
    expect(fs.readFile('.claude/rules/behavior.md')).toEqual({
      ok: true,
      value: '---\nalwaysApply: false\n---\n# body\n',
    });
  });

  it('exports listed rules to the picked dock', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    const bridge = createTestBridge(engine, { projectRoot: '/tmp/test-project' });

    renderWithProviders(<RulesPanel />, { bridge });
    await screen.findByRole('listitem', { name: 'Rule behavior' });
    await selectDock('Claude Code');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported rules to Claude Code in test-project'
    );
    const dest = fs.readFile('.claude/rules/behavior.md');
    expect(isOk(dest)).toBe(true);
    if (isOk(dest)) {
      expect(dest.value).toContain('generated_by: skil');
      expect(dest.value).toContain('# behavior');
    }
    expect(screen.getAllByRole('listitem', { name: 'Rule behavior' })).toHaveLength(1);
  });

  it('exports folder rules to Codex by writing AGENTS.md', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    const bridge = createTestBridge(engine, { projectRoot: '/tmp/test-project' });

    renderWithProviders(<RulesPanel />, { bridge });
    await screen.findByRole('listitem', { name: 'Rule behavior' });
    await selectDock('Codex');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported rules to Codex in test-project'
    );
    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent('.codex/rules/behavior.md');
    const folder = fs.readFile('.codex/rules/behavior.md');
    expect(isOk(folder)).toBe(true);
    if (isOk(folder)) {
      expect(folder.value).toContain('generated_by: skil');
      expect(folder.value).toContain('# behavior');
    }
    const dest = fs.readFile('AGENTS.md');
    expect(isOk(dest)).toBe(true);
    if (isOk(dest)) {
      expect(dest.value).toContain('<!-- skil:rule behavior -->');
      expect(dest.value).toContain('generated_by: skil');
    }
  });

  it('exports folder rules to Agents under .agents/rules', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    const bridge = createTestBridge(engine, { projectRoot: '/tmp/test-project' });

    renderWithProviders(<RulesPanel />, { bridge });
    await screen.findByRole('listitem', { name: 'Rule behavior' });
    await selectDock('Agents');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('dialog', { name: 'Exported' })).toHaveTextContent(
      'Exported rules to Agents in test-project'
    );
    expect(screen.getByRole('dialog', { name: 'Exported' })).toHaveTextContent('.agents/rules/behavior.md');
    const folder = fs.readFile('.agents/rules/behavior.md');
    expect(isOk(folder)).toBe(true);
    if (isOk(folder)) {
      expect(folder.value).toContain('# behavior');
    }
  });

  it('refreshes after a watcher scan when a root file appears', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();

    fs.writeFile('CLAUDE.md', '# claude root\n');
    bridge.emitScan();

    expect(await screen.findByRole('listitem', { name: 'Rule CLAUDE' })).toBeInTheDocument();
  });

  it('shows an empty state when the project has no rules', async () => {
    const { engine } = createInMemoryWorkspace();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('groups nested rules under the parent folder from disk, not a hardcoded list', async () => {
    const { engine, fs } = createInMemoryWorkspace();
    fs.writeFile('.cursor/rules/team/security/auth.mdc', '# auth\n');
    fs.writeFile('.cursor/rules/team/security/secrets.mdc', '# secrets\n');
    fs.writeFile('.claude/rules/ship.md', '# ship\n');
    engine.scan();
    const bridge = createTestBridge(engine);

    renderWithProviders(<RulesPanel />, { bridge });

    const folder = (await screen.findByText('team/security')).closest('.command-stage');
    expect(folder).not.toBeNull();
    expect(within(folder as HTMLElement).getByRole('listitem', { name: 'Rule team/security/auth' })).toBeInTheDocument();
    expect(within(folder as HTMLElement).getByRole('listitem', { name: 'Rule team/security/secrets' })).toBeInTheDocument();
    expect(within(folder as HTMLElement).queryByRole('listitem', { name: 'Rule ship' })).not.toBeInTheDocument();
    const other = screen.getByText('Other').closest('.command-stage');
    expect(within(other as HTMLElement).getByRole('listitem', { name: 'Rule ship' })).toBeInTheDocument();
    expect(screen.queryByText('Planning')).not.toBeInTheDocument();
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
    fs.writeFile('CLAUDE.md', '# claude root\n');
    engine.scan();
    const bridge = {
      ...createTestBridge(engine),
      readRule: async (): Promise<Result<string>> => err(new Error('ENOENT: no such file, open /tmp/CLAUDE.md')),
    };

    renderWithProviders(<RulesPanel />, { bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Details for CLAUDE' }));

    const preview = await screen.findByRole('dialog', { name: 'CLAUDE' });
    expect(await within(preview).findByRole('alert')).toHaveTextContent(/Couldn't load this rule/);
    expect(preview).not.toHaveTextContent('ENOENT');
    expect(preview).not.toHaveTextContent('/tmp/CLAUDE.md');
  });
});

