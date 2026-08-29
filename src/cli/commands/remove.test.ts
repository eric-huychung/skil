import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runRemove } from './remove.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemorySkillsAdapter());
}

describe('runRemove', () => {
  it('removes a skill from a collection and reports success', () => {
    const engine = buildEngine();
    engine.create('frontend', ['obra/react-patterns']);

    const outcome = runRemove(engine, 'frontend', 'obra/react-patterns');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Removed 'obra/react-patterns' from 'frontend'");
    expect(engine.list()[0]?.skills).toEqual([]);
  });

  it('reports an error for a non-existent collection', () => {
    const engine = buildEngine();

    const outcome = runRemove(engine, 'missing', 'obra/react-patterns');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'missing' not found");
  });
});
