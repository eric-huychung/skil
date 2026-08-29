import { describe, expect, it } from 'vitest';
import {
  conflictLabels,
  isImportConflict,
  isRuleExportConflict,
  isUnstampedConflict,
  matchingCommandNames,
} from './command-conflicts';

describe('conflict codes', () => {
  it('reads unstamped command labels from the result', () => {
    expect(isUnstampedConflict({ code: 'UNSTAMPED_COMMAND' })).toBe(true);
    expect(conflictLabels({ labels: ['testing', 'review'] })).toEqual(['testing', 'review']);
    expect(isUnstampedConflict({ code: 'IMPORT_CONFLICT' })).toBe(false);
  });

  it('reads import labels from the result', () => {
    expect(isImportConflict({ code: 'IMPORT_CONFLICT' })).toBe(true);
    expect(conflictLabels({ labels: ['tdd', 'ui/styling', '/build'] })).toEqual([
      'tdd',
      'ui/styling',
      '/build',
    ]);
    expect(isImportConflict({})).toBe(false);
  });

  it('reads rule export labels from the result', () => {
    expect(isRuleExportConflict({ code: 'RULE_EXPORT_CONFLICT' })).toBe(true);
    expect(conflictLabels({ labels: ['behavior', 'review'] })).toEqual(['behavior', 'review']);
    expect(isRuleExportConflict({ code: 'UNSTAMPED_COMMAND' })).toBe(false);
  });
});

describe('matchingCommandNames', () => {
  it('returns source names that already exist on the dest workspace', () => {
    expect(
      matchingCommandNames(
        [{ name: 'build' }, { name: 'review' }, { name: 'testing' }],
        [{ name: 'build' }, { name: 'testing' }]
      )
    ).toEqual(['build', 'testing']);
  });
});
