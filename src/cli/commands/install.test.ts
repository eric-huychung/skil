import { describe, expect, it } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runInstall } from './install.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runInstall', () => {
  it('installs a skill and reports success', async () => {
    const engine = buildEngine();

    const outcome = await runInstall(engine, 'obra/react-patterns');

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toBe("Installed skill 'obra/react-patterns'");
  });

  it('reports an error when install fails', async () => {
    const skills = new InMemorySkillsAdapter();
    skills.setInstallError(new Error('npx: command failed'));
    const engine = new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), skills);

    const outcome = await runInstall(engine, 'obra/react-patterns');

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('command failed');
  });
});
