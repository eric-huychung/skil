import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { createProgram } from '../program.js';
import { runInstall } from './install.js';

function buildEngine(skills: InMemorySkillsAdapter = new InMemorySkillsAdapter()): {
  engine: CollectionEngine;
  skills: InMemorySkillsAdapter;
} {
  const engine = new CollectionEngine(new InMemoryFileSystemAdapter(), skills);
  return { engine, skills };
}

describe('runInstall', () => {
  it('installs a skill into the live pair and reports success', async () => {
    const { engine } = buildEngine();

    const outcome = await runInstall(engine, 'obra/react-patterns');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Installed skill 'obra/react-patterns' into .agents/skills and .claude/skills");
    expect(engine.skills()[0]?.paths).toEqual([
      '.agents/skills/obra/react-patterns',
      '.claude/skills/obra/react-patterns',
    ]);
  });

  it('reports an error when install fails', async () => {
    const skills = new InMemorySkillsAdapter();
    skills.setInstallError(new Error('npx: command failed'));
    const { engine } = buildEngine(skills);

    const outcome = await runInstall(engine, 'obra/react-patterns');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('command failed');
    expect(engine.skills()).toEqual([]);
  });
});

describe('registerInstallCommand', () => {
  it('installs with no dock argument', () => {
    const { engine, skills } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    program.parse(['install', 'obra/x'], { from: 'user' });
    expect(skills.getInstalls()).toEqual([{ skillId: 'obra/x' }]);
  });

  it('rejects a --to flag: install always writes the live trees', () => {
    const { engine } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['install', 'obra/x', '--to', 'codex'], { from: 'user' })).toThrow();
  });
});
