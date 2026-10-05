import { describe, expect, it } from 'vitest';
import type { AssembledShelfEntries, MarketClassifyRow, MarketField } from './market-types.js';
import { GOLD_LABELS, GOLD_LISTINGS } from './shelf-gold.fixture.js';
import { AZURE_LABELS, AZURE_LISTINGS, LARK_LABELS, LARK_LISTINGS } from './shelf-suite.fixture.js';
import {
  buildShelves,
  CONFIDENT_PROBABILITY,
  dedupByName,
  OWNER_CAP,
  shelfTopics,
  type ShelfInputRow,
} from './shelf-assembler.js';

const THRESHOLD = 0.6;
const MAX_TOPICS = 3;

/** `owner/repo/skill` id → assembler row; source and owner come from the id like the real index. */
function input(id: string, installs: number, probabilities: Record<string, number>, name?: string): ShelfInputRow {
  const cut = id.lastIndexOf('/');
  return {
    id,
    name: name ?? id.slice(cut + 1),
    source: id.slice(0, cut),
    owner: id.split('/')[0]!,
    installs,
    probabilities,
  };
}

/** Listing + slug-label fixtures → rows with each labeled slug at a confident probability. */
function shelfRows(
  listings: MarketClassifyRow[],
  labels: Array<{ id: string; fieldSlugs: string[] }>,
  probability = 0.9,
): ShelfInputRow[] {
  const slugsById = new Map(labels.map((label) => [label.id, label.fieldSlugs]));
  return listings.map((row) =>
    input(
      row.id,
      row.installs,
      Object.fromEntries((slugsById.get(row.id) ?? []).map((slug) => [slug, probability])),
      row.name,
    ),
  );
}

function build(rows: ShelfInputRow[], fields: MarketField[], ownerCap = OWNER_CAP): AssembledShelfEntries[] {
  return buildShelves({ rows, fields, threshold: THRESHOLD, maxTopics: MAX_TOPICS, ownerCap });
}

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
    const shelves = build(shelfRows(GOLD_LISTINGS, GOLD_LABELS), fields);
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

  it('caps a field at shelfSize and never dumps unlabeled skills on integrations', () => {
    const rows = [
      input('a/r/big', 50, { frontend: 0.9 }),
      input('a/r/small', 10, { frontend: 0.9 }),
      input('a/r/mystery', 5, { frontend: 0.59, integrations: 0.4 }),
      input('a/r/blank', 1, {}),
    ];
    const shelves = build(rows, [field('frontend', 1), field('integrations')]);

    expect(idsOn(shelves, 'frontend')).toEqual(['a/r/big']);
    expect(idsOn(shelves, 'integrations')).toEqual([]);
  });

  it('uses the threshold inclusively and keeps at most maxTopics known fields, highest first', () => {
    const rows = [input('a/r/one', 1, { nope: 0.99, frontend: 0.7, testing: 0.95, review: 0.6, prd: 0.8, workflow: 0.2 })];
    const shelves = build(rows, [field('frontend'), field('testing'), field('review'), field('prd'), field('workflow')]);

    const on = shelves.filter((shelf) => shelf.entries.some((entry) => entry.id === 'a/r/one')).map((shelf) => shelf.fieldSlug);
    expect(on).toEqual(['frontend', 'testing', 'prd']);
    expect(on).not.toContain('review');
  });

  it('ranks confident (tier 0) rows above lower-confidence (tier 1) rows, then by installs', () => {
    const rows = [
      input('a/r/popular-unsure', 1_000_000, { frontend: 0.79 }),
      input('b/r/quiet-sure', 10, { frontend: 0.8 }),
      input('c/r/mid-sure', 500, { frontend: 0.95 }),
      input('d/r/mid-unsure', 900, { frontend: 0.65 }),
    ];
    const shelves = build(rows, [field('frontend')]);

    expect(idsOn(shelves, 'frontend')).toEqual(['c/r/mid-sure', 'b/r/quiet-sure', 'a/r/popular-unsure', 'd/r/mid-unsure']);
    expect(CONFIDENT_PROBABILITY).toBe(0.8);
  });

  it('dedups by name per shelf: the clone shows when the original is not on that shelf', () => {
    const rows = [
      input('a/r/tool', 100, { frontend: 0.9 }),
      input('b/r/tool', 5, { frontend: 0.9, testing: 0.9 }),
    ];
    const shelves = build(rows, [field('frontend'), field('testing')]);

    expect(idsOn(shelves, 'frontend')).toEqual(['a/r/tool']);
    expect(idsOn(shelves, 'testing')).toEqual(['b/r/tool']);
  });
});

describe('shelfTopics', () => {
  it('drops unknown fields before applying the threshold and the max', () => {
    expect(shelfTopics({ x: 0.99, a: 0.7, b: 0.65, c: 0.9, d: 0.61 }, new Set(['a', 'b', 'c', 'd']), 0.6, 3)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(shelfTopics({ a: 0.59 }, new Set(['a']), 0.6, 3)).toEqual([]);
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
    const shelves = build(shelfRows(AZURE_LISTINGS, AZURE_LABELS), [field('cloud')]);
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
    const shelves = build(shelfRows(LARK_LISTINGS, LARK_LABELS), [field('chat')]);
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
    const shelves = build(shelfRows(AZURE_LISTINGS, labels), [field('cloud'), field('security')]);

    expect(shelves.find((shelf) => shelf.fieldSlug === 'cloud')?.entries[0]).toEqual({
      id: 'microsoft/github-copilot-for-azure/azure-deploy',
      moreCount: 3,
    });
    expect(shelves.find((shelf) => shelf.fieldSlug === 'security')?.entries).toEqual([
      { id: 'microsoft/github-copilot-for-azure/azure-rbac', moreCount: 0 },
    ]);
  });

  it('applies the owner cap before cutting to shelfSize', () => {
    const shelves = build(shelfRows(AZURE_LISTINGS, AZURE_LABELS), [field('cloud', 3)], 1);

    expect(idsOn(shelves, 'cloud')).toEqual([
      'microsoft/github-copilot-for-azure/azure-deploy',
      'vercel-labs/agent-skills/vercel-deploy',
      'hashicorp/agent-skills/terraform-style-guide',
    ]);
  });

  it('a suite with any confident member ranks in tier 0', () => {
    const rows = [
      input('big/r/solo', 1_000_000, { cloud: 0.7 }),
      input('ms/az/az-a', 10, { cloud: 0.7 }),
      input('ms/az/az-b', 20, { cloud: 0.7 }),
      input('ms/az/az-c', 5, { cloud: 0.9 }),
    ];

    expect(build(rows, [field('cloud')])[0]?.entries).toEqual([
      { id: 'ms/az/az-b', moreCount: 2 },
      { id: 'big/r/solo', moreCount: 0 },
    ]);
  });
});
