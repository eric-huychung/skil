import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runCreate } from './create.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runCreate', () => {
  it('creates a collection and reports the skill count', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'frontend', ['obra/react-patterns']);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Created collection 'frontend' with 1 skill");
    expect(engine.list().map((c) => c.name)).toEqual(['frontend']);
  });

  it('pluralizes the skill count for zero or multiple skills', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'empty', []);

    expect(outcome.message).toBe("Created collection 'empty' with 0 skills");
  });

  it('reports an error for a duplicate collection name', () => {
    const engine = buildEngine();
    engine.create('frontend', []);

    const outcome = runCreate(engine, 'frontend', []);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Collection 'frontend' already exists");
  });

  it('stores a command template when provided', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'frontend', [], 'npm run dev');

    expect(outcome.isError).toBe(false);
    expect(engine.list()[0]?.command).toBe('npm run dev');
  });
});
