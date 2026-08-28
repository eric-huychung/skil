import { describe, expect, it } from 'vitest';
import { countSkillsBySource, filedSkillCount, formatScannedAt, groupInboxSkills, skillCountForIde } from './skill-sources';

describe('countSkillsBySource', () => {
  it('counts each catalog skill under every IDE folder it was found in', () => {
    expect(
      countSkillsBySource([
        { paths: ['.cursor/skills/tdd'] },
        { paths: ['.cursor/skills/ui', '.claude/skills/ui'] },
        { paths: ['.windsurf/skills/lint'] },
      ])
    ).toEqual([
      { source: '.cursor', count: 2 },
      { source: '.claude', count: 1 },
      { source: '.codex', count: 0 },
      { source: '.github', count: 0 },
      { source: '.agents', count: 0 },
      { source: '.windsurf', count: 1 },
    ]);
  });

  it('counts on-disk skills for one IDE even when that IDE has no commands', () => {
    expect(
      skillCountForIde(
        [{ paths: ['.cursor/skills/tdd'] }, { paths: ['.cursor/skills/ui', '.claude/skills/ui'] }],
        'cursor'
      )
    ).toBe(2);
    expect(skillCountForIde([{ paths: ['.cursor/skills/tdd'] }], 'windsurf')).toBe(0);
  });
});

describe('filedSkillCount', () => {
  it('counts unique skills filed onto commands, not disk catalog', () => {
    expect(filedSkillCount([{ skills: ['tdd'] }, { skills: ['tdd', 'ui'] }])).toBe(2);
    expect(filedSkillCount([{ skills: [] }])).toBe(0);
  });
});

describe('formatScannedAt', () => {
  it('says Never when the workspace has not been scanned', () => {
    expect(formatScannedAt(null)).toBe('Never');
  });
});

describe('groupInboxSkills', () => {
  it('splits Discover pulls from skills scanned on disk', () => {
    expect(
      groupInboxSkills(['obra/react-patterns', 'tdd', 'ui/styling'], [
        { id: 'tdd', paths: ['.cursor/skills/tdd'] },
        { id: 'ui/styling', paths: ['.cursor/skills/ui/styling'] },
      ])
    ).toEqual([
      { key: 'market', label: 'Market', skills: ['obra/react-patterns'] },
      { key: 'project', label: 'Project', skills: ['tdd', 'ui/styling'] },
    ]);
  });

  it('moves an installed market skill into Project even when source is skills.sh', () => {
    expect(
      groupInboxSkills(['obra/react-patterns', 'addyosmani/api-design'], [
        {
          id: 'obra/react-patterns',
          paths: ['.cursor/skills/obra/react-patterns'],
        },
      ])
    ).toEqual([
      { key: 'market', label: 'Market', skills: ['addyosmani/api-design'] },
      { key: 'project', label: 'Project', skills: ['obra/react-patterns'] },
    ]);
  });

  it('omits empty groups', () => {
    expect(
      groupInboxSkills(['tdd'], [{ id: 'tdd', paths: ['.cursor/skills/tdd'] }])
    ).toEqual([{ key: 'project', label: 'Project', skills: ['tdd'] }]);
  });
});
