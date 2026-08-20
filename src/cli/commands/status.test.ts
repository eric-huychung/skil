import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runStatus } from './status.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runStatus', () => {
  it('reports no active collection when none is active', () => {
    const engine = buildEngine();

    const outcome = runStatus(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe('No active collection');
  });

  it('reports the active collection name', () => {
    const engine = buildEngine();
    engine.create('frontend', []);
    engine.activate('frontend');

    const outcome = runStatus(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Active collection: 'frontend'");
  });
});
