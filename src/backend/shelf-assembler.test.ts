import { describe, expect, it } from 'vitest';
import type { MarketField } from './market-types.js';
import { GOLD_LABELS, GOLD_LISTINGS } from './shelf-gold.fixture.js';
import { buildShelves, dedupByName } from './shelf-assembler.js';

function field(slug: string, shelfSize = 30): MarketField {
  return {
    slug,
    roleSlug: 'swe',
    label: slug,
    q: slug,
    sortOrder: 1,
    shelfSize,
    active: true,
  };
}

describe('dedupByName', () => {
  it('keeps the highest-installs id for a lowercase name', () => {
    const unique = dedupByName(GOLD_LISTINGS);
    const frontend = unique.filter((row) => row.name.toLowerCase() === 'frontend-design');
    expect(frontend).toEqual([expect.objectContaining({ id: 'anthropics/skills/frontend-design' })]);
  });
});

describe('buildShelves', () => {
  const fields = [
    field('frontend'),
    field('testing'),
    field('review'),
    field('workflow'),
    field('integrations'),
    field('prd'),
  ];

  it('places gold skills on the right shelves and drops the clone', () => {
    const shelves = buildShelves({ listings: GOLD_LISTINGS, labels: GOLD_LABELS, fields });
    const byField = Object.fromEntries(shelves.map((shelf) => [shelf.fieldSlug, shelf.skillIds]));

    expect(byField.frontend).toEqual([
      'anthropics/skills/frontend-design',
      'vercel-labs/agent-skills/vercel-react-best-practices',
    ]);
    expect(byField.testing).toEqual(['mattpocock/skills/tdd']);
    expect(byField.review).toEqual(['mattpocock/skills/code-review']);
    expect(byField.workflow).toEqual(['vercel-labs/skills/find-skills', 'mattpocock/skills/grill-me']);
    expect(byField.integrations).toEqual(['nexscope-ai/amazon-skills/amazon-product-research']);
    expect(byField.prd).toEqual([]);
    expect(byField.frontend).not.toContain('clone/frontend-design');
  });

  it('caps a field at shelfSize and keeps leftover unlabeled skills on integrations', () => {
    const listings = [
      { id: 'a/big', name: 'big', slug: 'big', installs: 50, description: null, hash: null },
      { id: 'a/small', name: 'small', slug: 'small', installs: 10, description: null, hash: null },
      { id: 'a/mystery', name: 'mystery', slug: 'mystery', installs: 5, description: null, hash: null },
    ];
    const shelves = buildShelves({
      listings,
      labels: [
        { id: 'a/big', fieldSlugs: ['frontend'] },
        { id: 'a/small', fieldSlugs: ['frontend'] },
        { id: 'a/mystery', fieldSlugs: [] },
      ],
      fields: [field('frontend', 1), field('integrations')],
    });

    expect(shelves.find((shelf) => shelf.fieldSlug === 'frontend')?.skillIds).toEqual(['a/big']);
    expect(shelves.find((shelf) => shelf.fieldSlug === 'integrations')?.skillIds).toEqual(['a/mystery']);
  });

  it('drops unknown slugs and keeps at most two fields per skill', () => {
    const listings = [
      { id: 'a/one', name: 'one', slug: 'one', installs: 1, description: null, hash: null },
    ];
    const shelves = buildShelves({
      listings,
      labels: [{ id: 'a/one', fieldSlugs: ['nope', 'frontend', 'testing', 'review'] }],
      fields: [field('frontend'), field('testing'), field('review'), field('integrations')],
    });

    const on = shelves.filter((shelf) => shelf.skillIds.includes('a/one')).map((shelf) => shelf.fieldSlug);
    expect(on).toEqual(['frontend', 'testing']);
  });
});
