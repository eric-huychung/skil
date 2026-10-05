import { describe, expect, it } from 'vitest';
import {
  formatScannedAt,
  groupInboxSkills,
  shortSkillDescription,
  skillFileName,
  skillParentFolder,
} from './skill-sources';

describe('formatScannedAt', () => {
  it('says Never when the workspace has not been scanned', () => {
    expect(formatScannedAt(null)).toBe('Never');
  });
});

describe('skillParentFolder', () => {
  it('returns the parent path and leaves root names ungrouped', () => {
    expect(skillParentFolder('build/increment')).toBe('build');
    expect(skillParentFolder('build/ui/banner-design')).toBe('build/ui');
    expect(skillParentFolder('tdd')).toBeNull();
  });
});

describe('skillFileName', () => {
  it('returns the last path segment', () => {
    expect(skillFileName('build/increment')).toBe('increment');
    expect(skillFileName('build/ui/banner-design')).toBe('banner-design');
    expect(skillFileName('tdd')).toBe('tdd');
  });
});

describe('shortSkillDescription', () => {
  it('returns empty when there is no description', () => {
    expect(shortSkillDescription('')).toBe('');
    expect(shortSkillDescription('   ')).toBe('');
  });

  it('keeps a short description intact', () => {
    expect(shortSkillDescription('Write tests first.')).toBe('Write tests first.');
  });

  it('collapses whitespace and cuts a long description on a word', () => {
    const text = 'A'.repeat(80) + ' extra words that should not all appear on the card.';
    const result = shortSkillDescription(text, 90);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(91);
    expect(result).not.toContain('appear');
  });
});

describe('groupInboxSkills', () => {
  it('splits Discover pulls from skills scanned on disk', () => {
    expect(
      groupInboxSkills(['obra/react-patterns', 'tdd', 'ui/styling'], [
        { id: 'tdd', source: 'local' },
        { id: 'ui/styling', source: 'local' },
      ])
    ).toEqual([
      { key: 'market', label: 'Market', skills: ['obra/react-patterns'] },
      {
        key: 'project',
        label: 'Project',
        skills: ['tdd', 'ui/styling'],
        sections: [
          { key: 'ui', label: 'ui', skills: ['ui/styling'] },
          { key: '', label: 'Other', skills: ['tdd'] },
        ],
      },
    ]);
  });

  it('keeps an installed market skill under Market even though it is on disk', () => {
    expect(
      groupInboxSkills(['obra/react-patterns', 'addyosmani/api-design'], [
        { id: 'obra/react-patterns', source: 'skills.sh' },
      ])
    ).toEqual([{ key: 'market', label: 'Market', skills: ['obra/react-patterns', 'addyosmani/api-design'] }]);
  });

  it('omits empty groups and skips a project heading when every skill is at the root', () => {
    expect(groupInboxSkills(['tdd'], [{ id: 'tdd', source: 'local' }])).toEqual([
      {
        key: 'project',
        label: 'Project',
        skills: ['tdd'],
        sections: [{ key: '', label: null, skills: ['tdd'] }],
      },
    ]);
  });

  it('groups nested project skills under the parent folder and lifts a parent SKILL.md into that section', () => {
    const groups = groupInboxSkills(['tdd', 'build', 'build/increment', 'build/ui/shadcn'], [
      { id: 'tdd', source: 'local' },
      { id: 'build', source: 'local' },
      { id: 'build/increment', source: 'local' },
      { id: 'build/ui/shadcn', source: 'local' },
    ]);

    expect(groups).toEqual([
      {
        key: 'project',
        label: 'Project',
        skills: ['tdd', 'build', 'build/increment', 'build/ui/shadcn'],
        sections: [
          { key: 'build', label: 'build', skills: ['build', 'build/increment'] },
          { key: 'build/ui', label: 'build/ui', skills: ['build/ui/shadcn'] },
          { key: '', label: 'Other', skills: ['tdd'] },
        ],
      },
    ]);
  });
});
