import { describe, expect, it } from 'vitest';
import { buildLabelState, stateHash } from './label-state.js';
import type { LabelPoolRow } from './market-types.js';

const row: LabelPoolRow = {
  id: 'acme/skills/pdf',
  name: 'pdf',
  source: 'acme/skills',
  installs: 42,
  description: 'Read and edit PDFs.',
  labelExcerpt: 'Use this skill to merge PDFs.',
  owner: 'acme',
};

describe('buildLabelState', () => {
  it('renders name, repo, description and excerpt in a stable order', () => {
    expect(buildLabelState(row)).toBe(
      'name: pdf\nrepo: acme/skills\ndescription: Read and edit PDFs.\nexcerpt: Use this skill to merge PDFs.',
    );
  });

  it('uses empty strings for null description and excerpt', () => {
    expect(buildLabelState({ ...row, description: null, labelExcerpt: null })).toBe(
      'name: pdf\nrepo: acme/skills\ndescription: \nexcerpt: ',
    );
  });

  it('ignores fields Jev does not read', () => {
    expect(buildLabelState({ ...row, id: 'x', installs: 1, owner: 'y' })).toBe(buildLabelState(row));
  });
});

describe('stateHash', () => {
  it('is the sha256 hex of the state', () => {
    expect(stateHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(stateHash(buildLabelState(row))).toBe(stateHash(buildLabelState({ ...row })));
  });

  it.each([
    ['name', { name: 'pdf2' }],
    ['repo', { source: 'acme/other' }],
    ['description', { description: 'Different.' }],
    ['excerpt', { labelExcerpt: 'Different.' }],
    ['null description', { description: null }],
    ['null excerpt', { labelExcerpt: null }],
  ] as const)('changes when %s changes', (_label, patch) => {
    expect(stateHash(buildLabelState({ ...row, ...patch }))).not.toBe(stateHash(buildLabelState(row)));
  });
});
