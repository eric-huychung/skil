import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runConvert } from './convert.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runConvert', () => {
  it('converts a skill and reports success', async () => {
    const engine = buildEngine();

    const outcome = await runConvert(engine, 'obra/react-patterns', 'cursor');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Converted 'obra/react-patterns' for cursor");
  });

  it('reports an error when conversion fails', async () => {
    const skills = new InMemorySkillsAdapter();
    skills.setConvertError(new Error('skillsmith: unsupported format'));
    const engine = new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), skills);

    const outcome = await runConvert(engine, 'obra/react-patterns', 'cursor');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('unsupported format');
  });
});
