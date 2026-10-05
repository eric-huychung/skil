import { describe, expect, it } from 'vitest';
import type { AssembledShelfEntries, MarketField } from './market-types.js';
import { GOLD_LABELS, GOLD_LISTINGS } from './shelf-gold.fixture.js';
import { AZURE_LABELS, AZURE_LISTINGS, LARK_LABELS, LARK_LISTINGS } from './shelf-suite.fixture.js';
import { buildShelves, dedupByName } from './shelf-assembler.js';

function idsOn(shelves: AssembledShelfEntries[], slug: string): string[] | undefined {
  return shelves.find((shelf) => shelf.fieldSlug === slug)?.entries.map((entry) => entry.id);
}

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
    const byField = Object.fromEntries(shelves.map((shelf) => [shelf.fieldSlug, shelf.entries.map((entry) => entry.id)]));

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

    expect(idsOn(shelves, 'frontend')).toEqual(['a/big']);
    expect(idsOn(shelves, 'integrations')).toEqual(['a/mystery']);
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

    const on = shelves.filter((shelf) => shelf.entries.some((entry) => entry.id === 'a/one')).map((shelf) => shelf.fieldSlug);
    expect(on).toEqual(['frontend', 'testing']);
  });
});

describe('buildShelves suite collapse and owner cap', () => {
  const ownerOf = (id: string) => id.split('/')[0];

  function ownerCounts(shelf: AssembledShelfEntries): Map<string, number> {
    const counts = new Map<string, number>();
    for (const entry of shelf.entries) {
      const owner = ownerOf(entry.id)!;
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
  }

  it('Azure: collapses each repo suite under its best-installed row and caps Microsoft at 5', () => {
    const shelves = buildShelves({ listings: AZURE_LISTINGS, labels: AZURE_LABELS, fields: [field('cloud')] });
    const cloud = shelves.find((shelf) => shelf.fieldSlug === 'cloud')!;

    expect(cloud.entries).toEqual([
      { id: 'microsoft/github-copilot-for-azure/azure-deploy', moreCount: 4 },
      { id: 'vercel-labs/agent-skills/vercel-deploy', moreCount: 0 },
      { id: 'hashicorp/agent-skills/terraform-style-guide', moreCount: 0 },
      { id: 'microsoft/skills/azure-ai-projects-py', moreCount: 2 },
      { id: 'microsoft/skills/copilot-sdk', moreCount: 0 },
      { id: 'microsoft/skills/m365-agents-ts', moreCount: 0 },
      { id: 'microsoft/skills/fabric-notebooks', moreCount: 0 },
    ]);
    expect(Math.max(...ownerCounts(cloud).values())).toBeLessThanOrEqual(5);
  });

  it('Lark: collapses the lark-* suite; a two-row prefix group stays expanded', () => {
    const shelves = buildShelves({ listings: LARK_LISTINGS, labels: LARK_LABELS, fields: [field('chat')] });
    const chat = shelves.find((shelf) => shelf.fieldSlug === 'chat')!;

    expect(chat.entries).toEqual([
      { id: 'larksuite/cli/lark-calendar', moreCount: 5 },
      { id: 'slackapi/agent-skills/slack-messaging', moreCount: 0 },
      { id: 'larksuite/openclaw-lark/feishu-bitable', moreCount: 0 },
      { id: 'larksuite/openclaw-lark/feishu-calendar', moreCount: 0 },
    ]);
    expect(Math.max(...ownerCounts(chat).values())).toBeLessThanOrEqual(5);
  });

  it('collapses per shelf: suite members labeled elsewhere still count on their own shelf', () => {
    const labels = AZURE_LABELS.map((label) =>
      label.id === 'microsoft/github-copilot-for-azure/azure-rbac' ? { id: label.id, fieldSlugs: ['security'] } : label,
    );
    const shelves = buildShelves({ listings: AZURE_LISTINGS, labels, fields: [field('cloud'), field('security')] });

    expect(shelves.find((shelf) => shelf.fieldSlug === 'cloud')?.entries[0]).toEqual({
      id: 'microsoft/github-copilot-for-azure/azure-deploy',
      moreCount: 3,
    });
    expect(shelves.find((shelf) => shelf.fieldSlug === 'security')?.entries).toEqual([
      { id: 'microsoft/github-copilot-for-azure/azure-rbac', moreCount: 0 },
    ]);
  });

  it('applies the owner cap before cutting to shelfSize', () => {
    const shelves = buildShelves({
      listings: AZURE_LISTINGS,
      labels: AZURE_LABELS,
      fields: [field('cloud', 3)],
      ownerCap: 1,
    });

    expect(idsOn(shelves, 'cloud')).toEqual([
      'microsoft/github-copilot-for-azure/azure-deploy',
      'vercel-labs/agent-skills/vercel-deploy',
      'hashicorp/agent-skills/terraform-style-guide',
    ]);
  });
});
