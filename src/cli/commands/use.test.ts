import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runUse } from './use.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runUse', () => {
  it('activates an existing collection and reports its skill count', () => {
    const engine = buildEngine();
    engine.create('frontend', ['obra/react-patterns', 'addyosmani/perf']);

    const outcome = runUse(engine, 'frontend');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Activated collection 'frontend' (2 skills)");
    expect(engine.status().activeCollection).toBe('frontend');
  });

  it('reports an error for a non-existent collection', () => {
    const engine = buildEngine();

    const outcome = runUse(engine, 'missing');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toBe("Collection 'missing' does not exist");
  });
});
