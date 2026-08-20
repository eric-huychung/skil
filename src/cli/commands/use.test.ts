import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runUse } from './use.js';

function buildEngine(): { engine: CollectionEngine; fs: InMemoryFileSystemAdapter } {
  const fs = new InMemoryFileSystemAdapter();
  const engine = new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
  return { engine, fs };
}

describe('runUse', () => {
  it('activates an existing collection and reports its skill count', () => {
    const { engine } = buildEngine();
    engine.create('frontend', ['obra/react-patterns', 'addyosmani/perf']);

    const outcome = runUse(engine, 'frontend');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Activated collection 'frontend' (2 skills)");
    expect(engine.status().activeCollection).toBe('frontend');
  });

  it('surfaces warnings for skills missing their source directory', () => {
    const { engine, fs } = buildEngine();
    engine.create('frontend', ['obra/react-patterns']);
    fs.setMissing('.contextkit/skills/obra/react-patterns');

    const outcome = runUse(engine, 'frontend');

    expect(outcome.isError).toBe(false);
    expect(outcome.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('obra/react-patterns')])
    );
  });

  it('reports an error for a non-existent collection', () => {
    const { engine } = buildEngine();

    const outcome = runUse(engine, 'missing');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Collection 'missing' not found");
  });
});
