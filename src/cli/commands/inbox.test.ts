import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runInboxAdd, runInboxFile, runInboxList } from './inbox.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runInboxList', () => {
  it('shows a friendly empty message when Inbox has no IDs', () => {
    const engine = buildEngine();

    const outcome = runInboxList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/empty/i);
    expect(outcome.message).toMatch(/holding list/i);
  });

  it('lists Inbox IDs', () => {
    const engine = buildEngine();
    engine.addToInbox('obra/react-patterns');
    engine.addToInbox('addyosmani/performance-review');

    const outcome = runInboxList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(outcome.message).toContain('addyosmani/performance-review');
  });
});

describe('runInboxAdd', () => {
  it('adds a skill ID to Inbox', () => {
    const engine = buildEngine();

    const outcome = runInboxAdd(engine, 'obra/react-patterns');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
  });

  it('reports persist errors from the engine', () => {
    const fs = new InMemoryFileSystemAdapter();
    const engine = new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
    fs.setWriteError(new Error('Disk full'));

    const outcome = runInboxAdd(engine, 'obra/react-patterns');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('Disk full');
  });
});

describe('runInboxFile', () => {
  it('files an Inbox ID into a named collection', () => {
    const engine = buildEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');

    const outcome = runInboxFile(engine, 'obra/react-patterns', 'frontend');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(outcome.message).toContain('frontend');
    expect(engine.inbox()).toEqual([]);
    expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
  });

  it('reports an error when the collection is missing', () => {
    const engine = buildEngine();
    engine.addToInbox('obra/react-patterns');

    const outcome = runInboxFile(engine, 'obra/react-patterns', 'frontend');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Collection 'frontend' not found");
  });
});
