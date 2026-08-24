import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
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

    const outcome = await runCopy(engine, 'build', 'cursor', 'claude');

    expect(outcome.isError).toBe(false);
    expect(engine.list('claude')[0]?.skills).toEqual(['tdd']);
  });
});

describe('registerCopyCommand', () => {
  it('rejects an unknown --from before calling the engine', () => {
    const { engine } = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['copy', 'build', '--from', 'nope', '--to', 'claude'], { from: 'user' })).toThrow();
    expect(engine.list('claude')).toEqual([]);
  });
});
