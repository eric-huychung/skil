import { describe, expect, it } from 'vitest';
import { CollectionEngine, STATE_PATH } from '../../core/collection-engine.js';
import { InMemoryFileSystemAdapter } from '../../adapters/in-memory-fs.js';
import { InMemorySkillsAdapter } from '../../adapters/in-memory-skills.js';
import { isOk } from '../../core/result.js';
import { createProgram } from '../program.js';
import { runScan } from './scan.js';

function buildEngine(fs: InMemoryFileSystemAdapter = new InMemoryFileSystemAdapter()): CollectionEngine {
  return new CollectionEngine(fs, new InMemorySkillsAdapter());
}

describe('runScan', () => {
  it('prints a friendly empty message when nothing is found', () => {
    const outcome = runScan(buildEngine());

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/no skills found/i);
    expect(outcome.message).toMatch(/SKILL\.md/i);
  });

  it('prints added ids from a first scan', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

    const outcome = runScan(buildEngine(fs));

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/added/i);
    expect(outcome.message).toContain('tdd');
  });

  it('prints gone ids on re-scan', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/design/SKILL.md', '# design\n');
    buildEngine(fs).scan();

    const persisted = fs.readJSON(STATE_PATH);
    expect(isOk(persisted)).toBe(true);
    if (!isOk(persisted)) {
      return;
    }

    fs.reset();
    fs.writeJSON(STATE_PATH, persisted.value);
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');

    const outcome = runScan(buildEngine(fs));

    expect(outcome.isError).toBe(false);
    expect(outcome.message).toMatch(/gone/i);
    expect(outcome.message).toContain('design');
  });
});

describe('registerScanCommand', () => {
  it('does not call scan when given an invalid extra flag', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    const engine = buildEngine(fs);
    const program = createProgram(engine);
    program.exitOverride();

    expect(() => program.parse(['scan', '--import-from-ide'], { from: 'user' })).toThrow();
    expect(engine.skills()).toEqual([]);
  });

  it('documents pull of skills only and does not mention import', () => {
    const program = createProgram(buildEngine());
    program.exitOverride();

    let output = '';
    program.configureOutput({ writeOut: (text) => { output += text; } });
    expect(() => program.parse(['scan', '--help'], { from: 'user' })).toThrow();

    expect(output).toMatch(/pull/i);
    expect(output).toMatch(/SKILL\.md|skills/i);
    expect(output.toLowerCase()).not.toContain('import');
    expect(output.toLowerCase()).not.toContain('collection-from-ide');
  });
});
