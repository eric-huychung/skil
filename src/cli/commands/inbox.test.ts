import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isErr } from '../../core/result.js';
import { runInboxAdd, runInboxDelete, runInboxFile, runInboxList } from './inbox.js';

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
  it('files an Inbox ID into a named command', () => {
    const engine = buildEngine();
    engine.create('frontend', []);
    engine.addToInbox('obra/react-patterns');

    const outcome = runInboxFile(engine, 'obra/react-patterns', 'frontend');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('obra/react-patterns');
    expect(outcome.message).toContain('frontend');
    expect(engine.inbox()).toEqual(['obra/react-patterns']);
    expect(engine.list()[0]?.skills).toEqual(['obra/react-patterns']);
  });

  it('reports an error when the command is missing', () => {
    const engine = buildEngine();
    engine.addToInbox('obra/react-patterns');

    const outcome = runInboxFile(engine, 'obra/react-patterns', 'frontend');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Command 'frontend' not found");
    expect(outcome.message.toLowerCase()).not.toContain('collection');
  });
});

describe('runInboxDelete', () => {
  it('deletes a scanned skill from disk and Inbox', () => {
    const fs = new InMemoryFileSystemAdapter();
    const engine = new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', 'echo hi\n');
    engine.scan();

    const outcome = runInboxDelete(engine, 'tdd');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('tdd');
    expect(engine.inbox()).toEqual([]);
    expect(engine.skills()).toEqual([]);
    expect(isErr(fs.readFile('.cursor/skills/tdd/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/tdd/scripts/run.sh'))).toBe(true);
  });

  it('keeps a nested skill when deleting the parent', () => {
    const fs = new InMemoryFileSystemAdapter();
    const engine = new CollectionEngine(fs, new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
    fs.writeFile('.cursor/skills/build/SKILL.md', '# build\n');
    fs.writeFile('.cursor/skills/build/ui/shadcn/SKILL.md', '# shadcn\n');
    engine.scan();

    const outcome = runInboxDelete(engine, 'build');

    expect(outcome.isError).toBe(false);
    expect(engine.inbox()).toEqual(['build/ui/shadcn']);
    expect(fs.readFile('.cursor/skills/build/ui/shadcn/SKILL.md')).toEqual({
      ok: true,
      value: '# shadcn\n',
    });
  });
});
