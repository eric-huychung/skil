import { describe, expect, it, vi } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isOk } from '../../core/result.js';
import { createProgram } from '../program.js';
import { runRulesAlwaysApply, runRulesExport, runRulesList, runRulesShow } from './rules.js';

function buildEngine(): { engine: CollectionEngine; fs: InMemoryFileSystemAdapter } {
  const fs = new InMemoryFileSystemAdapter();
  const engine = new CollectionEngine(fs, new InMemorySkillsAdapter());
  return { engine, fs };
}

describe('runRulesList', () => {
  it('shows a friendly message when no rules exist', () => {
    const { engine } = buildEngine();

    const outcome = runRulesList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/no rules/i);
  });

  it('lists rule name, dock, always-apply, and path', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# body\n');
    fs.writeFile('CLAUDE.md', '# claude\n');

    const outcome = runRulesList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('behavior');
    expect(outcome.message).toContain('cursor');
    expect(outcome.message).toContain('yes');
    expect(outcome.message).toContain('.cursor/rules/behavior.mdc');
    expect(outcome.message).toContain('CLAUDE');
    expect(outcome.message).toContain('claude');
  });
});

describe('runRulesShow', () => {
  it('prints the rule body', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# hello\n');

    const outcome = runRulesShow(engine, '.cursor/rules/behavior.mdc');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('# hello');
  });

  it('reports a missing rule', () => {
    const { engine } = buildEngine();

    const outcome = runRulesShow(engine, '.cursor/rules/gone.mdc');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/not found/i);
  });
});

describe('runRulesAlwaysApply', () => {
  it('writes alwaysApply on a cursor rule', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '---\nalwaysApply: true\n---\n# body\n');

    const outcome = runRulesAlwaysApply(engine, '.cursor/rules/behavior.mdc', false);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/off/i);
    const written = fs.readFile('.cursor/rules/behavior.mdc');
    expect(isOk(written)).toBe(true);
    if (isOk(written)) {
      expect(written.value).toContain('alwaysApply: false');
    }
  });

  it('refuses root always-on files', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('CLAUDE.md', '# claude\n');

    const outcome = runRulesAlwaysApply(engine, 'CLAUDE.md', false);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/cannot toggle/i);
  });
});

describe('runRulesExport', () => {
  it('copies rules into the dest dock', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');

    const outcome = await runRulesExport(engine, 'claude');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('claude');
    const dest = fs.readFile('.claude/rules/behavior.md');
    expect(isOk(dest)).toBe(true);
    if (isOk(dest)) {
      expect(dest.value).toContain('generated_by: skil');
      expect(dest.value).toContain('# behavior');
    }
  });
});

describe('registerRulesCommand', () => {
  it('lists rules from the CLI entrypoint', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '# behavior\n');
    const program = createProgram(engine);
    program.exitOverride();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['rules'], { from: 'user' });

    expect(log.mock.calls.flat().join('\n')).toContain('behavior');
    log.mockRestore();
  });

  it('exports rules with --to and --replace', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/rules/behavior.mdc', '# new\n');
    fs.writeFile('.claude/rules/behavior.md', '# old\n');
    const program = createProgram(engine);
    program.exitOverride();

    await program.parseAsync(['rules', 'export', '--to', 'claude', '--replace'], { from: 'user' });

    const dest = fs.readFile('.claude/rules/behavior.md');
    expect(isOk(dest)).toBe(true);
    if (isOk(dest)) {
      expect(dest.value).toContain('generated_by: skil');
      expect(dest.value).toContain('# new');
    }
  });
});
