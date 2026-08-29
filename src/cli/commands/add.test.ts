import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runAdd } from './add.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemorySkillsAdapter());
}

describe('runAdd', () => {
  it('adds a skill to a collection and reports success', () => {
    const engine = buildEngine();
    engine.create('frontend', []);

    const outcome = runAdd(engine, 'frontend', 'obra/react-patterns');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Added 'obra/react-patterns' to 'frontend'");
    expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
  });

  it('reports an error for a non-existent collection', () => {
    const engine = buildEngine();

    const outcome = runAdd(engine, 'missing', 'obra/react-patterns');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'missing' not found");
  });
});
