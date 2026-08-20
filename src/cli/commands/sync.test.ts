import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runSync } from './sync.js';

function buildEngine(): { engine: CollectionEngine; config: InMemoryConfigAdapter } {
  const config = new InMemoryConfigAdapter();
  const engine = new CollectionEngine(new InMemoryFileSystemAdapter(), config, new InMemorySkillsAdapter());
  return { engine, config };
}

describe('runSync', () => {
  it('reports the number of collections synced from the config file', () => {
    const { engine, config } = buildEngine();
    config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['a'], backend: ['b'] } });

    const outcome = runSync(engine, '.contextkit.yml');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toContain('Synced 2 collections from config');
  });

  it('includes warnings for local-only collections', () => {
    const { engine, config } = buildEngine();
    engine.create('local-only', []);
    config.write('.contextkit.yml', { version: '1.0', collections: { frontend: ['a'] } });

    const outcome = runSync(engine, '.contextkit.yml');

    expect(outcome.isError).toBe(false);
    expect(outcome.warnings?.join(' ')).toContain('local-only');
  });

  it('reports an error when the config file is missing', () => {
    const { engine } = buildEngine();

    const outcome = runSync(engine, '.contextkit.yml');

    expect(outcome.isError).toBe(true);
  });
});
