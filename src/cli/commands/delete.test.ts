import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runDelete } from './delete.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runDelete', () => {
  it('deletes a command by name', () => {
    const engine = buildEngine();
    engine.create('frontend', ['obra/react-patterns']);

    const outcome = runDelete(engine, 'frontend');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Deleted command 'frontend'");
    expect(engine.list()).toEqual([]);
  });

  it('reports an error for a missing command', () => {
    const engine = buildEngine();

    const outcome = runDelete(engine, 'missing');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'missing' not found");
    expect(outcome.message.toLowerCase()).not.toContain('collection');
  });
});
