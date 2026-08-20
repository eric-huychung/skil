import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runDisable } from './disable.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runDisable', () => {
  it('deactivates the active collection', () => {
    const engine = buildEngine();
    engine.create('frontend', []);
    engine.activate('frontend');

    const outcome = runDisable(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe('Deactivated collection');
    expect(engine.status().activeCollection).toBeNull();
  });

  it('is idempotent when nothing is active', () => {
    const engine = buildEngine();

    const outcome = runDisable(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe('Deactivated collection');
  });
});
