import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, lstatSync, readlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isOk } from '../core/result.js';
import { CollectionEngine } from '../core/collection-engine.js';
import { RealFileSystemAdapter } from '../adapters/real-fs-adapter.js';
import { InMemoryConfigAdapter } from '../adapters/in-memory-config.js';
import { InMemorySkillsAdapter } from '../adapters/in-memory-skills.js';

describe('CollectionEngine + RealFileSystemAdapter integration', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), 'contextkit-integration-'));
    // Simulate IDE-managed skill directories already existing in the project.
    mkdirSync(join(tmpDir, '.agents', 'skills'), { recursive: true });
    mkdirSync(join(tmpDir, '.claude', 'skills'), { recursive: true });
    // CollectionEngine resolves its state/skills paths relative to cwd,
    // matching how the real CLI is invoked from within a project root.
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function buildEngine(): CollectionEngine {
    return new CollectionEngine(
      new RealFileSystemAdapter(),
      new InMemoryConfigAdapter(),
      new InMemorySkillsAdapter(),
      tmpDir
    );
  }

  it('creates symlinks in every detected IDE directory on activate, and removes them on deactivate', () => {
    const engine = buildEngine();
    const cursorTarget = join(tmpDir, '.agents', 'skills', 'react-patterns');
    const claudeTarget = join(tmpDir, '.claude', 'skills', 'react-patterns');

    expect(isOk(engine.create('frontend', ['react-patterns']))).toBe(true);
    expect(isOk(engine.activate('frontend'))).toBe(true);

    expect(lstatSync(cursorTarget).isSymbolicLink()).toBe(true);
    expect(lstatSync(claudeTarget).isSymbolicLink()).toBe(true);
    expect(readlinkSync(cursorTarget)).toBe('.contextkit/skills/react-patterns');

    expect(isOk(engine.deactivate())).toBe(true);

    expect(() => lstatSync(cursorTarget)).toThrow();
    expect(() => lstatSync(claudeTarget)).toThrow();
  });

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

  it('swaps symlinks when activating a different collection', () => {
    const engine = buildEngine();
    engine.create('frontend', ['react-patterns']);
    engine.create('backend', ['api-design']);
    engine.activate('frontend');

    engine.activate('backend');

    const frontendTarget = join(tmpDir, '.agents', 'skills', 'react-patterns');
    const backendTarget = join(tmpDir, '.agents', 'skills', 'api-design');
    expect(() => lstatSync(frontendTarget)).toThrow();
    expect(lstatSync(backendTarget).isSymbolicLink()).toBe(true);
  });
});
