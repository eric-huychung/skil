import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runCreate } from './create.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemorySkillsAdapter());
}

describe('runCreate', () => {
  it('creates a command and reports the skill count', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'frontend', ['obra/react-patterns']);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Created command 'frontend' with 1 skill");
    expect(engine.list().map((c) => c.name)).toEqual(['frontend']);
  });

  it('pluralizes the skill count for zero or multiple skills', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'empty', []);

    expect(outcome.message).toBe("Created command 'empty' with 0 skills");
  });

  it('reports an error for a duplicate command name', () => {
    const engine = buildEngine();
    engine.create('frontend', []);

    const outcome = runCreate(engine, 'frontend', []);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'frontend' already exists");
    expect(outcome.message.toLowerCase()).not.toContain('collection');
  });

  it('strips a leading slash so /build is stored as build', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, '/build', []);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain("command 'build'");
    expect(engine.list().map((c) => c.name)).toEqual(['build']);
  });

  it('rejects creating a command named inbox', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'inbox', []);

    expect(outcome.isError).toBe(true);
    expect(outcome.message.toLowerCase()).toMatch(/inbox/);
    expect(outcome.message.toLowerCase()).not.toContain('collection');
    expect(engine.list()).toEqual([]);
  });

  it('stores a command template when provided', () => {
    const engine = buildEngine();

    const outcome = runCreate(engine, 'frontend', [], 'npm run dev');

    expect(outcome.isError).toBe(false);
    expect(engine.list()[0]?.command).toBe('npm run dev');
  });

  it('rejects a second create of the same name', () => {
    const engine = buildEngine();
    engine.create('build', ['tdd']);

    const outcome = runCreate(engine, 'build', ['design']);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'build' already exists");
    expect(engine.list()[0]?.skills).toEqual(['tdd']);
  });
});
