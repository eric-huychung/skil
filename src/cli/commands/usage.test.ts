import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { InMemoryUsageCollector } from '../../adapters/in-memory-usage.js';
import { createProgram } from '../program.js';
import { runUsage } from './usage.js';

function buildEngine(usage = new InMemoryUsageCollector()): CollectionEngine {
  const fs = new InMemoryFileSystemAdapter();
  fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
  const engine = new CollectionEngine(fs, new InMemorySkillsAdapter(), usage);
  engine.scan();
  return engine;
}

describe('runUsage', () => {
  it('prints count 2 for two events without calling search', async () => {
    const usage = new InMemoryUsageCollector();
    usage.seed([
      { skillId: 'tdd', source: 'claude' },
      { skillId: 'tdd', source: 'claude' },
    ]);
    const engine = buildEngine(usage);

    const outcome = await runUsage(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('tdd');
    expect(outcome.message).toContain('2');
  });

  it('prints a friendly empty message when there are no counts', async () => {
    const outcome = await runUsage(buildEngine());

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/no usage/i);
  });
});

describe('registerUsageCommand', () => {
  it('registers usage on the program', () => {
    const program = createProgram(buildEngine());
    expect(program.commands.some((command) => command.name() === 'usage')).toBe(true);
  });
});
