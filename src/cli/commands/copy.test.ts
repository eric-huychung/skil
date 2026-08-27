import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isOk } from '../../core/result.js';
import { createProgram } from '../program.js';
import { runCopy } from './copy.js';

function buildEngine(): { engine: CollectionEngine; fs: InMemoryFileSystemAdapter } {
  const fs = new InMemoryFileSystemAdapter();
  return {
    fs,
    engine: new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter()),
  };
}

describe('runCopy', () => {
  it('copies a command from Cursor to Claude', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('build', ['tdd']);

    const outcome = await runCopy(engine, 'build', 'claude');

    expect(outcome.isError).toBe(false);
    expect(engine.list()[0]?.skills).toEqual(['tdd']);
  });
});

describe('registerCopyCommand', () => {
  it('rejects an unknown --to before calling the engine', () => {
    const { engine } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['copy', 'build', '--to', 'nope'], { from: 'user' })).toThrow();
    expect(engine.list()).toEqual([]);
  });

  it('rejects leftover --from before calling the engine', () => {
    const { engine } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() =>
      program.parse(['copy', 'build', '--from', 'cursor', '--to', 'claude'], { from: 'user' })
    ).toThrow();
    expect(engine.list()).toEqual([]);
  });

  it('copies a command with --to claude', async () => {
    const { engine, fs } = buildEngine();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    engine.scan();
    engine.create('build', ['tdd']);
    const program = createProgram(engine);
    program.exitOverride();

    await program.parseAsync(['copy', 'build', '--to', 'claude'], { from: 'user' });

    expect(isOk(fs.readFile('.claude/commands/build.md'))).toBe(true);
  });

  it('documents --to as a dock and has no --from', () => {
    const { engine } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();
    let output = '';
    program.configureOutput({ writeOut: (text) => { output += text; } });
    expect(() => program.parse(['copy', '--help'], { from: 'user' })).toThrow();

    expect(output).toMatch(/--to/);
    expect(output.toLowerCase()).toMatch(/dock/);
    expect(output).not.toMatch(/\s--from\b/);
    expect(output).not.toMatch(/\s--ide\b/);
  });
});
