import { describe, expect, it } from 'vitest';
import { InMemoryFileSystemAdapter } from '../adapters/in-memory-fs.js';
import { isErr, isOk } from './result.js';
import { hashSkillTree, relocateSkillFolder, skillFolderPath } from './skill-folder.js';

describe('skillFolderPath', () => {
  it('returns the folder when given a skill root', () => {
    expect(skillFolderPath('.cursor/skills/testing/debug')).toBe('.cursor/skills/testing/debug');
  });

  it('strips a trailing SKILL.md', () => {
    expect(skillFolderPath('.cursor/skills/testing/debug/SKILL.md')).toBe('.cursor/skills/testing/debug');
  });
});

describe('hashSkillTree', () => {
  it('changes when an extra file is present', () => {
    const fs = new InMemoryFileSystemAdapter();
    const body = '# debug\n';
    fs.writeFile('.agents/skills/tdd/SKILL.md', body);
    fs.writeFile('.cursor/skills/tdd/SKILL.md', body);
    const base = hashSkillTree(fs, '.cursor/skills/tdd');

    fs.writeFile('.cursor/skills/tdd/scripts/run.sh', '#!/bin/sh\n');
    const withExtra = hashSkillTree(fs, '.cursor/skills/tdd');

    expect(base).toBeDefined();
    expect(withExtra).toBeDefined();
    expect(base).not.toBe(withExtra);
    expect(hashSkillTree(fs, '.agents/skills/tdd')).toBe(base);
  });
});

describe('relocateSkillFolder', () => {
  it('moves every file under the skill folder', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/skills/testing/debug/SKILL.md', '# debug\n');
    fs.writeFile('.cursor/skills/testing/debug/agents/openai.yaml', 'x: 1\n');
    fs.writeFile('.cursor/skills/testing/debug/scripts/a.sh', '#!/bin/sh\n');

    const result = relocateSkillFolder(fs, '.cursor/skills/testing/debug', '.skil/deprecated/.cursor/skills/testing/debug');

    expect(isOk(result)).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/testing/debug/SKILL.md'))).toBe(true);
    expect(isErr(fs.readFile('.cursor/skills/testing/debug/agents/openai.yaml'))).toBe(true);
    expect(isOk(fs.readFile('.skil/deprecated/.cursor/skills/testing/debug/SKILL.md'))).toBe(true);
    expect(isOk(fs.readFile('.skil/deprecated/.cursor/skills/testing/debug/agents/openai.yaml'))).toBe(true);
    expect(isOk(fs.readFile('.skil/deprecated/.cursor/skills/testing/debug/scripts/a.sh'))).toBe(true);
  });

  it('accepts a path ending in SKILL.md', () => {
    const fs = new InMemoryFileSystemAdapter();
    fs.writeFile('.cursor/skills/tdd/SKILL.md', '# tdd\n');
    fs.writeFile('.cursor/skills/tdd/extra.md', '# extra\n');

    const result = relocateSkillFolder(
      fs,
      '.cursor/skills/tdd/SKILL.md',
      '.skil/deprecated/.cursor/skills/tdd'
    );

    expect(isOk(result)).toBe(true);
    expect(isOk(fs.readFile('.skil/deprecated/.cursor/skills/tdd/extra.md'))).toBe(true);
  });
});
