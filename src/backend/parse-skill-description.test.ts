import { describe, expect, it } from 'vitest';
import { parseSkillDescription } from './parse-skill-description.js';

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
