import { describe, expect, it } from 'vitest';
import {
  isSkilStamped,
  parseStampedSkills,
  writeCommandFile,
} from './command-file.js';

function stamp(body: string, skills: string[] = ['tdd']): string {
  const skillLines =
    skills.length === 0 ? 'skills: []' : `skills:\n${skills.map((id) => `  - ${id}`).join('\n')}`;
  return `---
name: /build
${skillLines}
generated_by: skil
generated_at: 2026-08-22T23:00:00.000Z
---

${body}`;
}

describe('writeCommandFile', () => {
  it('writes Goal, Sequence, and Rules as one-line comments plus a Skills list', () => {
    const written = writeCommandFile('build', ['tdd', 'design']);

    expect(written).toContain('name: /build');
    expect(written).toContain('generated_by: skil');
    expect(written).toMatch(/generated_at: \d{4}-\d{2}-\d{2}T/);
    expect(written).toContain('  - tdd');
    expect(written).toContain('  - design');
    expect(written).toContain('## Goal');
    expect(written).toContain('<!-- Describe what this command is for. -->');
    expect(written).toContain('## Sequence');
    expect(written).toContain(
      '<!-- Ordered must-follow steps. Skills below are extras, not extra phases. -->'
    );
    expect(written).toContain('## Rules');
    expect(written).toContain('<!-- Constraints the agent must not break. -->');
    expect(written).toContain('## Skills');
    expect(written).toContain('- `tdd`');
    expect(written).toContain('- `design`');
    expect(written).not.toContain('1. Use the skills listed in frontmatter when they apply.');
  });

  it('keeps a Skills section when nothing is filed', () => {
    const written = writeCommandFile('plan', []);

    expect(written).toContain('skills: []');
    expect(written).toContain('## Skills');
    expect(written).toContain('None filed yet.');
  });

  it('preserves a customized Goal, Sequence, and Rules when skills change', () => {
    const existing = stamp(`## Goal
Ship the checkout flow.

## Sequence
1. Read the spec.
2. Stop.

## Rules
No extra phases.

## Skills
When they apply, read and follow:
- \`tdd\`
`);

    const written = writeCommandFile('build', ['tdd', 'design'], existing);

    expect(written).toContain('  - design');
    expect(written).toContain('Ship the checkout flow.');
    expect(written).toContain('1. Read the spec.');
    expect(written).toContain('No extra phases.');
    expect(written).toContain('- `design`');
    expect(written).not.toContain('<!-- Describe what this command is for. -->');
  });

  it('upgrades the old numbered stub into the comment placeholders', () => {
    const existing = stamp(`1. Use the skills listed in frontmatter when they apply.
2. Do not invent extra required steps.
`);

    const written = writeCommandFile('build', ['tdd'], existing);

    expect(written).toContain('<!-- Describe what this command is for. -->');
    expect(written).not.toContain('1. Use the skills listed in frontmatter when they apply.');
  });

  it('keeps extra user sections that sit above Skills', () => {
    const existing = stamp(`## Goal
<!-- Describe what this command is for. -->

## Output
docs/plan.md

## Skills
When they apply, read and follow:
- \`tdd\`
`);

    const written = writeCommandFile('build', ['tdd'], existing);

    expect(written).toContain('## Output');
    expect(written).toContain('docs/plan.md');
  });

  it('resets Goal, Sequence, and Rules when reset is set', () => {
    const existing = stamp(`## Goal
Ship the checkout flow.

## Sequence
1. Read the spec.

## Rules
No extra phases.
`);

    const written = writeCommandFile('build', ['tdd'], existing, { reset: true });

    expect(written).toContain('<!-- Describe what this command is for. -->');
    expect(written).not.toContain('Ship the checkout flow.');
  });
});

describe('isSkilStamped', () => {
  it('is true only when frontmatter has generated_by: skil', () => {
    expect(isSkilStamped(stamp('## Goal\n'))).toBe(true);
    expect(isSkilStamped('# their old /build\n')).toBe(false);
  });
});

describe('parseStampedSkills', () => {
  it('reads the skills list from a stamped file', () => {
    expect(parseStampedSkills(stamp('## Goal\n', ['tdd', 'design']))).toEqual(['tdd', 'design']);
  });

  it('returns null for an unstamped file', () => {
    expect(parseStampedSkills('# their old /build\n')).toBeNull();
  });
});
