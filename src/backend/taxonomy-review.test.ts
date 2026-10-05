import { describe, expect, it, vi } from 'vitest';
import { ok } from '../core/result.js';
import type { LabelPoolRow, SkillScore } from './market-types.js';
import { buildTaxonomyReview, formatTaxonomyReview, readTaxonomyReview } from './taxonomy-review.js';

const pool: LabelPoolRow[] = [
  { id: 'a/clear', name: 'Clear', source: 'a', installs: 10, description: null, labelExcerpt: null, owner: 'a' },
  { id: 'a/review', name: 'Review', source: 'a', installs: 30, description: null, labelExcerpt: null, owner: 'a' },
  { id: 'a/missing', name: 'Missing', source: 'a', installs: 20, description: null, labelExcerpt: null, owner: 'a' },
];

const scores: SkillScore[] = [
  { id: 'a/clear', status: 'ok', probabilities: { frontend: 0.9 }, stateHash: '1', modelVersion: 'test' },
  { id: 'a/review', status: 'ok', probabilities: { frontend: 0.5 }, stateHash: '2', modelVersion: 'test' },
];

describe('taxonomy review', () => {
  it('reports unlabeled, review-band, and missing rows without dropping their scores', () => {
    expect(buildTaxonomyReview(pool, scores)).toEqual([
      expect.objectContaining({ id: 'a/review', flags: ['review-band'] }),
      expect.objectContaining({ id: 'a/missing', flags: ['unlabeled'], status: 'missing' }),
    ]);
  });

  it('flags a below-threshold score in the band as both unlabeled and review-band', () => {
    expect(buildTaxonomyReview(pool, scores, { threshold: 0.6 })).toEqual([
      expect.objectContaining({ id: 'a/review', flags: ['unlabeled', 'review-band'] }),
      expect.objectContaining({ id: 'a/missing', flags: ['unlabeled'], status: 'missing' }),
    ]);
  });

  it('reads labels without calling a shelf mutation', async () => {
    const store = {
      listLabelPool: async () => ok(pool),
      listLabels: vi.fn(async () => ok(scores)),
    };
    const result = await readTaxonomyReview(store, 'test-version');
    expect(result.ok).toBe(true);
    expect(store.listLabels).toHaveBeenCalledWith('test-version');
  });

  it('formats an operator-readable report', () => {
    expect(formatTaxonomyReview(buildTaxonomyReview(pool, scores))).toContain('review-band\ta/review\t30');
  });
});
