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

    expect(output).toContain('contextkit');
    expect(output).toContain('inbox');
    expect(output).toContain('delete');
    expect(output.toLowerCase()).not.toContain('staging');
  });
});
