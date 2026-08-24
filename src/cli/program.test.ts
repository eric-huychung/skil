import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTEXTKIT_VERSION } from '../index.js';
import { CollectionEngine } from '../core/collection-engine.js';
import { InMemoryConfigAdapter } from '../adapters/in-memory-config.js';
import { InMemoryFileSystemAdapter } from '../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../adapters/in-memory-skills.js';
import { createProgram } from './program.js';

function buildEngine(): CollectionEngine {
  return new CollectionEngine(new InMemoryFileSystemAdapter(), new InMemoryConfigAdapter(), new InMemorySkillsAdapter());
}

function captureOutput(run: (write: (text: string) => void) => void): string {
  let output = '';
  run((text) => {
    output += text;
  });
  return output;
}

describe('createProgram', () => {
  it('reports the contextkit version', () => {
    const program = createProgram(buildEngine());
    program.exitOverride();

    const output = captureOutput((writeOut) => {
      program.configureOutput({ writeOut });
      expect(() => program.parse(['--version'], { from: 'user' })).toThrow();
    });

    expect(output.trim()).toBe(CONTEXTKIT_VERSION);
  });

  it('shows help text naming the CLI', () => {
    const program = createProgram(buildEngine());
    program.exitOverride();

    const output = captureOutput((writeOut) => {
      program.configureOutput({ writeOut });
      expect(() => program.parse(['--help'], { from: 'user' })).toThrow();
    });

    expect(program.name()).toBe('skil');
    expect(output).toContain('Usage: skil');
    expect(output).toContain('inbox');
    expect(output).toContain('delete');
    expect(output).toContain('scan');
    expect(output).toContain('copy');
    expect(output.toLowerCase()).not.toContain('staging');
    expect(output.toLowerCase()).not.toContain('collection');
  });

  it('rejects an unknown --ide before creating a command', () => {
    const engine = buildEngine();
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['create', 'build', '--ide', 'nope'], { from: 'user' })).toThrow();
    expect(engine.list()).toEqual([]);
  });

  it('exposes skil as the primary bin and keeps contextkit as an alias', () => {
    const pkg = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf-8')
    ) as { bin: Record<string, string> };

    expect(pkg.bin.skil).toBe('dist/cli/index.js');
    expect(pkg.bin.contextkit).toBe('dist/cli/index.js');
  });
});
