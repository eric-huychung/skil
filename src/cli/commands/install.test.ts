import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { createProgram } from '../program.js';
import { runInstall } from './install.js';

function buildEngine(skills: InMemorySkillsAdapter = new InMemorySkillsAdapter()): {
  engine: CollectionEngine;
  skills: InMemorySkillsAdapter;
} {
  const engine = new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), skills);
  return { engine, skills };
}

describe('runInstall', () => {
  it('installs a skill and reports success', async () => {
    const { engine } = buildEngine();

    const outcome = await runInstall(engine, 'obra/react-patterns', 'cursor');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Installed skill 'obra/react-patterns'");
    expect(engine.skills()[0]?.deployedTo).toEqual([expect.objectContaining({ ide: 'cursor' })]);
  });

  it('reports an error when install fails', async () => {
    const skills = new InMemorySkillsAdapter();
    skills.setInstallError(new Error('npx: command failed'));
    const { engine } = buildEngine(skills);

    const outcome = await runInstall(engine, 'obra/react-patterns', 'cursor');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('command failed');
    expect(engine.skills()).toEqual([]);
  });
});

describe('registerInstallCommand', () => {
  it('requires --to and does not call the engine without it', () => {
    const { engine, skills } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['install', 'obra/x'], { from: 'user' })).toThrow();
    expect(skills.getInstalls()).toEqual([]);
    expect(engine.skills()).toEqual([]);
  });

  it('rejects an unknown IDE before the engine', () => {
    const { engine, skills } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['install', 'obra/x', '--to', 'vscode'], { from: 'user' })).toThrow();
    expect(skills.getInstalls()).toEqual([]);
    expect(engine.skills()).toEqual([]);
  });
});
