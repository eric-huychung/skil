import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { FakeSkillClassifier } from './skill-classifier.js';
import type { MarketClassifyRow, MarketField } from './market-types.js';

const skill = (id: string): MarketClassifyRow => ({
  id,
  name: id,
  slug: id,
  installs: 1,
  description: null,
  hash: null,
});

const field = (slug: string): MarketField => ({
  slug,
  roleSlug: 'swe',
  label: slug,
  q: slug,
  sortOrder: 1,
  shelfSize: 30,
  active: true,
});

describe('FakeSkillClassifier', () => {
  it('returns seeded slugs and empty slugs for unknown ids', async () => {
    const classifier = new FakeSkillClassifier(new Map([['a/known', ['frontend']]]));

    const result = await classifier.classify([skill('a/known'), skill('a/missing')], [field('frontend')]);

    expect(isOk(result) && result.value).toEqual([
      { id: 'a/known', fieldSlugs: ['frontend'] },
      { id: 'a/missing', fieldSlugs: [] },
    ]);
  });
});
