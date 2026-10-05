import { describe, expect, it } from 'vitest';
import { parseSkillDescription, parseSkillExcerpt } from './parse-skill-description.js';

describe('parseSkillDescription', () => {
  it('returns the trimmed description from frontmatter', () => {
    const contents = `---\nname: react-patterns\ndescription:   Patterns for React hooks.  \n---\n\nBody text.`;

    expect(parseSkillDescription(contents)).toBe('Patterns for React hooks.');
  });

  it('returns null when frontmatter has no description', () => {
    const contents = `---\nname: react-patterns\n---\n\nBody text.`;

    expect(parseSkillDescription(contents)).toBeNull();
  });

  it('returns null when there is no frontmatter', () => {
    const contents = `# react-patterns\n\nBody text.`;

    expect(parseSkillDescription(contents)).toBeNull();
  });

  it('returns null when description is not a string', () => {
    const contents = `---\nname: react-patterns\ndescription:\n  - one\n  - two\n---\n`;

    expect(parseSkillDescription(contents)).toBeNull();
  });

  it('returns null when frontmatter YAML is malformed', () => {
    const contents = `---\nname: [unclosed\ndescription: test\n---\n`;

    expect(parseSkillDescription(contents)).toBeNull();
  });

  it('returns null when description is blank', () => {
    const contents = `---\nname: react-patterns\ndescription: "   "\n---\n`;

    expect(parseSkillDescription(contents)).toBeNull();
  });

  it('trims a description over 500 characters', () => {
    const longDescription = 'a'.repeat(600);
    const contents = `---\nname: react-patterns\ndescription: "${longDescription}"\n---\n`;

    const result = parseSkillDescription(contents);

    expect(result).not.toBeNull();
    expect(result?.length).toBe(500);
  });

  it('keeps a description exactly at 500 characters intact', () => {
    const description = 'a'.repeat(500);
    const contents = `---\nname: react-patterns\ndescription: "${description}"\n---\n`;

    expect(parseSkillDescription(contents)).toBe(description);
  });
});

describe('parseSkillExcerpt', () => {
  it('strips frontmatter and collapses whitespace', () => {
    const contents = `---\nname: react-patterns\ndescription: Hooks.\n---\n\n# React   patterns\n\nUse hooks\n  well.\n`;

    expect(parseSkillExcerpt(contents)).toBe('# React patterns Use hooks well.');
  });

  it('works when there is no frontmatter', () => {
    expect(parseSkillExcerpt('# Title\n\nBody text.')).toBe('# Title Body text.');
  });

  it('drops fenced code blocks', () => {
    const contents = 'Before.\n\n```ts\nconst secret = 1;\n```\n\nMiddle.\n\n~~~\nmore code\n~~~\nAfter.';

    expect(parseSkillExcerpt(contents)).toBe('Before. Middle. After.');
  });

  it('drops an unclosed code fence through the end', () => {
    expect(parseSkillExcerpt('Intro.\n\n```bash\nrm -rf /\nmore')).toBe('Intro.');
  });

  it('drops long tables but keeps short ones', () => {
    const shortTable = '| a | b |\n|---|---|\n| 1 | 2 |';
    const longTable = ['| k | v |', '|---|---|', ...Array.from({ length: 10 }, (_, i) => `| row${i} | x |`)].join('\n');
    const contents = `Start.\n\n${shortTable}\n\nMid.\n\n${longTable}\n\nEnd.`;

    expect(parseSkillExcerpt(contents)).toBe('Start. | a | b | |---|---| | 1 | 2 | Mid. End.');
  });

  it('caps at 1,000 characters, cut at a word boundary', () => {
    const contents = 'word '.repeat(300);

    const result = parseSkillExcerpt(contents);

    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(1000);
    expect(result!.endsWith('word')).toBe(true);
    expect(result!.length).toBe(999);
  });

  it('hard-cuts a single unbroken token over the cap', () => {
    expect(parseSkillExcerpt('x'.repeat(1500))).toBe('x'.repeat(1000));
  });

  it('keeps text exactly at the cap intact', () => {
    const contents = `${'a'.repeat(995)} bcde`;

    expect(parseSkillExcerpt(contents)).toBe(contents);
  });

  it('returns null when nothing is left', () => {
    expect(parseSkillExcerpt('---\nname: x\n---\n\n```\ncode\n```\n')).toBeNull();
    expect(parseSkillExcerpt('   ')).toBeNull();
  });
});
