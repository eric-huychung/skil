import { describe, expect, it } from 'vitest';
import { groupRulesByFolder, ruleFileName, ruleParentFolder } from './rule-folders';
import type { RuleRecord } from '../../../shared/ipc';

function rule(name: string, path = `${name}.mdc`): RuleRecord {
  return { id: path, name, path, dock: 'cursor', alwaysApply: false, canToggle: true };
}

describe('ruleParentFolder', () => {
  it('returns the parent path and leaves root names ungrouped', () => {
    expect(ruleParentFolder('pair-programming/behavior')).toBe('pair-programming');
    expect(ruleParentFolder('team/security/auth')).toBe('team/security');
    expect(ruleParentFolder('optional')).toBeNull();
    expect(ruleParentFolder('CLAUDE')).toBeNull();
  });
});

describe('ruleFileName', () => {
  it('returns the last path segment', () => {
    expect(ruleFileName('pair-programming/behavior')).toBe('behavior');
    expect(ruleFileName('team/security/auth')).toBe('auth');
    expect(ruleFileName('optional')).toBe('optional');
  });
});

describe('groupRulesByFolder', () => {
  it('groups nested rules under their parent folder and keeps root rules unlabeled', () => {
    const groups = groupRulesByFolder([
      rule('pair-programming/behavior'),
      rule('optional'),
      rule('pair-programming/format'),
      rule('team/security/auth'),
      rule('CLAUDE', 'CLAUDE.md'),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['pair-programming', 'team/security', 'Other']);
    expect(groups[0]?.rules.map((item) => item.name)).toEqual([
      'pair-programming/behavior',
      'pair-programming/format',
    ]);
    expect(groups[1]?.rules.map((item) => item.name)).toEqual(['team/security/auth']);
    expect(groups[2]?.rules.map((item) => item.name)).toEqual(['optional', 'CLAUDE']);
  });

  it('skips a heading when every rule is at the rules root', () => {
    const groups = groupRulesByFolder([rule('optional'), rule('CLAUDE', 'CLAUDE.md')]);

    expect(groups).toEqual([
      {
        key: '',
        label: null,
        rules: [rule('optional'), rule('CLAUDE', 'CLAUDE.md')],
      },
    ]);
  });

  it('omits empty folders and keeps input order inside a group', () => {
    const groups = groupRulesByFolder([
      rule('zeta/one'),
      rule('alpha/two'),
      rule('zeta/three'),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['alpha', 'zeta']);
    expect(groups[1]?.rules.map((item) => item.name)).toEqual(['zeta/one', 'zeta/three']);
  });
});
