import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runExport } from './export.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runExport', () => {
  it('exports comma-separated collections and reports success counts', async () => {
    const engine = buildEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('backend', ['vercel-labs/security-review']);

    const outcome = await runExport(engine, 'frontend,backend', 'cursor');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('2');
    expect(outcome.message).toContain('cursor');
  });

  it('reports as an error when every export fails', async () => {
    const engine = buildEngine();

    const outcome = await runExport(engine, 'missing', 'cursor');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain("Collection 'missing' not found");
  });

  it('reports success with warnings when some skills fail but others succeed', async () => {
    const engine = buildEngine();
    engine.create('frontend', ['obra/react-patterns']);
    engine.create('missing-collection', []);

    const outcome = await runExport(engine, 'frontend,does-not-exist', 'claude');

    expect(outcome.isError).toBe(false);
    expect(outcome.warnings).toEqual([expect.stringContaining("Collection 'does-not-exist' not found")]);
  });
});
