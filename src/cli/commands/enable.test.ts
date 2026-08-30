import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isOk } from '../../core/result.js';
import { createProgram } from '../program.js';
import { runSetCommandEnabled } from './enable.js';

function buildEngine(): { engine: CollectionEngine; fs: InMemoryFileSystemAdapter } {
  const fs = new InMemoryFileSystemAdapter();
  const engine = new CollectionEngine(fs, new InMemorySkillsAdapter());
  return { engine, fs };
}

describe('runSetCommandEnabled', () => {
  it('turns a command on: writes both live command-skill folders', async () => {
    const { engine, fs } = buildEngine();
    engine.create('build', ['tdd']);

    const outcome = await runSetCommandEnabled(engine, 'build', true);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('now on');
    expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.claude/skills/build/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.agents/skills/build/agents/openai.yaml'))).toBe(true);
  });

  it('turns a command off: parks the live folders', async () => {
    const { engine, fs } = buildEngine();
    engine.create('build', ['tdd']);
    await runSetCommandEnabled(engine, 'build', true);

    const outcome = await runSetCommandEnabled(engine, 'build', false);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('now off');
    expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(false);
    expect(isOk(fs.readFile('.skil/parked/commands/build/SKILL.md'))).toBe(true);
  });

  it('reports an error for a missing command', async () => {
    const { engine } = buildEngine();

    const outcome = await runSetCommandEnabled(engine, 'missing', true);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'missing' not found");
  });
});

describe('registerEnableCommand / registerDisableCommand', () => {
  it('enables and disables a command from the CLI entrypoint', async () => {
    const { engine, fs } = buildEngine();
    engine.create('build', ['tdd']);
    const program = createProgram(engine);
    program.exitOverride();

    await program.parseAsync(['enable', 'build'], { from: 'user' });
    expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(true);

    await program.parseAsync(['disable', 'build'], { from: 'user' });
    expect(isOk(fs.readFile('.agents/skills/build/SKILL.md'))).toBe(false);
    expect(isOk(fs.readFile('.skil/parked/commands/build/SKILL.md'))).toBe(true);
  });
});
