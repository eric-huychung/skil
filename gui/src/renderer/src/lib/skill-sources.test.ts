import { describe, expect, it } from 'vitest';
import { countSkillsBySource, formatScannedAt } from './skill-sources';

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
      { source: '.windsurf', count: 1 },
      { source: '.agents', count: 0 },
    ]);
  });
});

describe('formatScannedAt', () => {
  it('says Never when the workspace has not been scanned', () => {
    expect(formatScannedAt(null)).toBe('Never');
  });
});
