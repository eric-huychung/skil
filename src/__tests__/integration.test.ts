import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOk } from '../core/result.js';
import { CollectionEngine } from '../core/collection-engine.js';
import { RealFileSystemAdapter } from '../adapters/real-fs-adapter.js';
import { ConfigAdapter } from '../adapters/config-adapter.js';
import { InMemoryConfigAdapter } from '../adapters/in-memory-config.js';
import { InMemorySkillsAdapter } from '../adapters/in-memory-skills.js';

describe('CollectionEngine + RealFileSystemAdapter integration', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'contextkit-integration-'));
    // CollectionEngine resolves its state path relative to cwd,
    // matching how the real CLI is invoked from within a project root.
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildEngine(): CollectionEngine {
    return new CollectionEngine(new RealFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
  }

  it('persists collection state to .contextkit/state.json on disk', () => {
    const engine = buildEngine();

    engine.create('frontend', ['react-patterns']);

    const persisted = JSON.parse(readFileSync(join(tmpDir, '.contextkit', 'state.json'), 'utf-8'));
    expect(persisted.collections).toEqual([
      expect.objectContaining({ name: 'frontend', skills: ['react-patterns'] }),
    ]);
  });

  it('reloads persisted state when a new engine instance is constructed', () => {
    buildEngine().create('frontend', ['react-patterns']);

    const reloaded = buildEngine();

    expect(reloaded.list().map((c) => c.name)).toEqual(['frontend']);
  });

  it('persists an added skill across engine instances', () => {
    buildEngine().create('frontend', ['react-patterns']);

    buildEngine().addSkill('frontend', 'performance-review');
    const reloaded = buildEngine();

    expect(reloaded.list()[0]?.skills).toEqual(['react-patterns', 'performance-review']);
  });

  it('syncs collections from a real .contextkit.yml file on disk', () => {
    const configPath = join(tmpDir, '.contextkit.yml');
    writeFileSync(
      configPath,
      ['version: "1.0"', 'collections:', '  frontend:', '    - react-patterns'].join('\n')
    );
    const engine = new CollectionEngine(new RealFileSystemAdapter(), new ConfigAdapter(), new InMemorySkillsAdapter());

    const result = engine.sync(configPath);

    expect(isOk(result)).toBe(true);
    expect(engine.list().map((c) => c.name)).toEqual(['frontend']);
    const persisted = JSON.parse(readFileSync(join(tmpDir, '.contextkit', 'state.json'), 'utf-8'));
    expect(persisted.collections).toEqual([
      expect.objectContaining({ name: 'frontend', skills: ['react-patterns'] }),
    ]);
  });
});
