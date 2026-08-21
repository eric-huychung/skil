import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runList } from './list.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runList', () => {
  it('shows a friendly message when no collections exist', () => {
    const engine = buildEngine();

    const outcome = runList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe('No collections yet');
  });

  it('lists collection names and skill counts', () => {
    const engine = buildEngine();
    engine.create('frontend', ['a', 'b']);
    engine.create('backend', ['c']);

    const outcome = runList(engine);

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('frontend');
    expect(outcome.message).toContain('backend');
    expect(outcome.message).toContain('2');
    expect(outcome.message).toContain('1');
  });

  it('shows a placeholder for a collection with no command template', () => {
    const engine = buildEngine();
    engine.create('frontend', []);

    const outcome = runList(engine);

    expect(outcome.message).toContain('—');
  });

  it("shows a collection's command template", () => {
    const engine = buildEngine();
    engine.create('frontend', [], 'npm run dev');

    const outcome = runList(engine);

    expect(outcome.message).toContain('npm run dev');
  });
});
