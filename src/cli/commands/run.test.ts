import { describe, expect, it, vi } from 'vitest';
import { CollectionEngine } from '../../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { runRun } from './run.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

describe('runRun', () => {
  it("executes the collection's command template and reports success", async () => {
    const engine = buildEngine();
    engine.create('frontend', [], 'npm run dev');
    const executor = vi.fn().mockResolvedValue({ exitCode: 0 });

    const outcome = await runRun(engine, 'frontend', executor);

    expect(executor).toHaveBeenCalledWith('npm run dev');
    expect(outcome.isError).toBe(false);
  });

  it('reports an error when the collection has no command defined', async () => {
    const engine = buildEngine();
    engine.create('frontend', []);
    const executor = vi.fn();

    const outcome = await runRun(engine, 'frontend', executor);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('no command defined');
    expect(executor).not.toHaveBeenCalled();
  });

  it('reports an error when the command exits non-zero', async () => {
    const engine = buildEngine();
    engine.create('frontend', [], 'npm run dev');
    const executor = vi.fn().mockResolvedValue({ exitCode: 1 });

    const outcome = await runRun(engine, 'frontend', executor);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('exited with code 1');
  });

  it('reports an error when the executor throws', async () => {
    const engine = buildEngine();
    engine.create('frontend', [], 'not-a-real-command');
    const executor = vi.fn().mockRejectedValue(new Error('spawn not-a-real-command ENOENT'));

    const outcome = await runRun(engine, 'frontend', executor);

    expect(outcome.isError).toBe(true);
    expect(outcome.message).toContain('ENOENT');
  });
});
