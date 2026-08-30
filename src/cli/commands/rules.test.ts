import { describe, expect, it, vi } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isOk } from '../../core/result.js';
import { createProgram } from '../program.js';
import { runRulesList, runRulesSetEnabled, runRulesShow } from './rules.js';

function buildEngine(): { engine: CollectionEngine; fs: InMemoryFileSystemAdapter } {
  const fs = new InMemoryFileSystemAdapter();
  const engine = new CollectionEngine(fs, new InMemorySkillsAdapter());
  return { engine, fs };
}

function sharedRuleSection(id: string, body: string): string {
  return `<!-- skil:rule ${id} -->\n${body}\n<!-- /skil:rule ${id} -->\n`;
}

describe('runRulesList', () => {
  it('shows a friendly message when no rules exist', () => {
    const { engine } = buildEngine();

    const outcome = runRulesList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/no rules/i);
  });

  it('lists a shared AGENTS.md section as enabled', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('AGENTS.md', sharedRuleSection('behavior', 'Be kind.'));

    const outcome = runRulesList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('behavior');
    expect(outcome.message).toContain('shared');
    expect(outcome.message).toContain('AGENTS.md');
  });

  it('lists a glob rule file as read-only (no enabled column value)', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/pair-programming/behavior.mdc', '---\nalwaysApply: true\n---\n# body\n');

    const outcome = runRulesList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('glob');
    expect(outcome.message).toContain('.cursor/rules/pair-programming/behavior.mdc');
  });
});

describe('runRulesShow', () => {
  it('prints a shared rule section body', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('AGENTS.md', sharedRuleSection('behavior', 'Be kind.'));

    const outcome = runRulesShow(engine, 'behavior');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('Be kind.');
  });

  it('reports a missing rule', () => {
    const { engine } = buildEngine();

    const outcome = runRulesShow(engine, 'nope');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/not found/i);
  });
});

describe('runRulesSetEnabled', () => {
  it('turns off a shared rule: section leaves AGENTS.md and parks the body', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('AGENTS.md', sharedRuleSection('behavior', 'Be kind.'));

    const outcome = runRulesSetEnabled(engine, 'behavior', false);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/off/i);
    const agents = fs.readFile('AGENTS.md');
    expect(isOk(agents) && agents.value.includes('skil:rule behavior')).toBe(false);
    const parked = fs.readFile('.skil/parked/rules/behavior');
    expect(isOk(parked)).toBe(true);
  });

  it('refuses to toggle a glob rule file', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# body\n');

    const outcome = runRulesSetEnabled(engine, '.cursor/rules/behavior.mdc', false);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/path-scoped/i);
  });
});

describe('registerRulesCommand', () => {
  it('lists rules from the CLI entrypoint', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('AGENTS.md', sharedRuleSection('behavior', 'Be kind.'));
    const program = createProgram(engine);
    program.exitOverride();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['rules'], { from: 'user' });

    expect(log.mock.calls.flat().join('\n')).toContain('behavior');
    log.mockRestore();
  });

  it('enables and disables a shared rule from the CLI entrypoint', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('AGENTS.md', sharedRuleSection('behavior', 'Be kind.'));
    const program = createProgram(engine);
    program.exitOverride();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['rules', 'disable', 'behavior'], { from: 'user' });
    expect(isOk(fs.readFile('.skil/parked/rules/behavior'))).toBe(true);

    await program.parseAsync(['rules', 'enable', 'behavior'], { from: 'user' });
    const agents = fs.readFile('AGENTS.md');
    expect(isOk(agents) && agents.value.includes('skil:rule behavior')).toBe(true);

    log.mockRestore();
  });
});
