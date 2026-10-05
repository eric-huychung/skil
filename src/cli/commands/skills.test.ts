import { describe, expect, it, vi } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isOk } from '../../core/result.js';
import { createProgram } from '../program.js';
import { runSkillsList, runSkillsSetEnabled } from './skills.js';

function buildEngine(): { engine: CollectionEngine; fs: InMemoryFileSystemAdapter } {
  const fs = new InMemoryFileSystemAdapter();
  const engine = new CollectionEngine(fs, new InMemorySkillsAdapter());
  return { engine, fs };
}

describe('runSkillsList', () => {
  it('shows a friendly message when the catalog is empty', () => {
    const { engine } = buildEngine();

    const outcome = runSkillsList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe('No skills yet');
  });

  it('lists promoted leftover skills as on and parked skills as off', () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.skil/parked/skills/design/SKILL.md', '# design\n');
    fs.writeFile('.cursor/skills/react/SKILL.md', '# react\n');
    engine.scan();

    const outcome = runSkillsList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('tdd');
    expect(outcome.message).toContain('design');
    expect(outcome.message).toContain('react');
    expect(outcome.message).toContain('local');
    expect(outcome.message).toContain('on');
    expect(outcome.message).toContain('off');
    expect(outcome.message).toContain('.agents/skills/tdd');
    expect(outcome.message).toContain('.skil/parked/skills/design');
    expect(outcome.message).toContain('.cursor/skills/react');
  });
});

describe('runSkillsSetEnabled', () => {
  it('turns a skill on: writes the live pair', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();

    const outcome = await runSkillsSetEnabled(engine, 'tdd', true);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/on/i);
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.claude/skills/tdd/SKILL.md'))).toBe(true);
  });

  it('turns a skill off: parks under .skil/parked/skills/<id>', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();

    const outcome = await runSkillsSetEnabled(engine, 'tdd', false);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/off/i);
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(false);
    expect(isOk(fs.readFile('.skil/parked/skills/tdd/SKILL.md'))).toBe(true);
  });

  it('reports an error for an id that is not in the catalog', async () => {
    const { engine } = buildEngine();

    const outcome = await runSkillsSetEnabled(engine, 'nope', true);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toMatch(/not in the catalog/i);
  });
});

describe('registerSkillsCommand', () => {
  it('lists skills from the CLI entrypoint', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const program = createProgram(engine);
    program.exitOverride();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['skills'], { from: 'user' });

    expect(log.mock.calls.flat().join('\n')).toContain('tdd');
    log.mockRestore();
  });

  it('enables and disables a skill from the CLI entrypoint', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.agents/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.claude/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const program = createProgram(engine);
    program.exitOverride();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['skills', 'disable', 'tdd'], { from: 'user' });
    expect(isOk(fs.readFile('.skil/parked/skills/tdd/SKILL.md'))).toBe(true);

    await program.parseAsync(['skills', 'enable', 'tdd'], { from: 'user' });
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.claude/skills/tdd/SKILL.md'))).toBe(true);

    log.mockRestore();
  });

  it('lists enable and disable on skills --help', () => {
    const { engine } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();
    let output = '';
    program.configureOutput({ writeOut: (text) => { output += text; } });

    expect(() => program.parse(['skills', '--help'], { from: 'user' })).toThrow();

    expect(output).toMatch(/\benable\b/);
    expect(output).toMatch(/\bdisable\b/);
  });

  it('leaves top-level enable as commands-only', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.skil/parked/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    const program = createProgram(engine);
    program.exitOverride();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync(['enable', 'tdd'], { from: 'user' });

    expect(error.mock.calls.flat().join('\n')).toContain("Command 'tdd' not found");
    expect(isOk(fs.readFile('.agents/skills/tdd/SKILL.md'))).toBe(false);
    error.mockRestore();
  });
});
