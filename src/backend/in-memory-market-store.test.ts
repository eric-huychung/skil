import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { SkillScore } from './market-types.js';

function listing(id: string, overrides: Partial<{ name: string; installs: number }> = {}) {
  return {
    id,
    name: overrides.name ?? id,
    slug: id,
    source: 'github.com/example/example',
    installs: overrides.installs ?? 0,
    installUrl: `https://skills.sh/${id}`,
    url: `https://github.com/example/${id}`,
  };
}

describe('InMemoryMarketStore.upsertListing', () => {
  it('creates a new row with installs, name, and last_seen_at', async () => {
    const store = new InMemoryMarketStore();

    await store.upsertListing(listing('a/skill', { name: 'Skill', installs: 10 }), '2026-01-01T00:00:00.000Z');
    const hash = await store.getHash('a/skill');

    expect(isOk(hash)).toBe(true);
    if (isOk(hash)) {
      expect(hash.value).toBeNull();
    }
  });

  it('updates installs/name/last_seen_at on re-upsert without clobbering description/hash', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/skill', { installs: 10 }), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/skill', { description: 'A skill', hash: 'hash-1' });

    await store.upsertListing(listing('a/skill', { name: 'Renamed', installs: 20 }), '2026-01-02T00:00:00.000Z');

    const hash = await store.getHash('a/skill');
    expect(isOk(hash) && hash.value).toBe('hash-1');
  });
});

describe('InMemoryMarketStore.listTopListings', () => {
  it('returns active rows by installs descending and includes description', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/low', { name: 'Low', installs: 1 }), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listing('a/high', { name: 'High', installs: 50 }), '2026-01-02T00:00:00.000Z');
    await store.upsertListing(listing('a/mid', { name: 'Mid', installs: 10 }), '2026-01-02T00:00:00.000Z');
    await store.setDetail('a/high', { description: 'A popular skill', hash: 'h1' });
    await store.markInactiveBefore('2026-01-02T00:00:00.000Z');

    const top = await store.listTopListings(2);

    expect(isOk(top) && top.value).toEqual([
      { id: 'a/high', name: 'High', slug: 'a/high', installs: 50, description: 'A popular skill', hash: 'h1' },
      { id: 'a/mid', name: 'Mid', slug: 'a/mid', installs: 10, description: null, hash: null },
    ]);
  });
});

describe('InMemoryMarketStore.listShelves', () => {
  it('returns roles -> fields -> skills by rank, capped at shelf_size', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 2,
      active: true,
    });

    await store.upsertListing(listing('a/one', { name: 'One', installs: 5 }), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listing('a/two', { name: 'Two', installs: 8 }), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listing('a/three', { name: 'Three', installs: 1 }), '2026-01-01T00:00:00.000Z');
    // Highest installs (Two) ranked first.
    await store.replaceShelves(
      [{ fieldSlug: 'frontend', entries: ['a/two', 'a/one', 'a/three'].map((id) => ({ id, moreCount: 0 })) }],
      'v1',
    );

    const shelves = await store.listShelves();

    expect(isOk(shelves)).toBe(true);
    if (!isOk(shelves)) return;
    expect(shelves.value).toEqual([
      {
        slug: 'swe',
        label: 'SWE',
        fields: [
          {
            slug: 'frontend',
            label: 'Frontend',
            skills: [
              { id: 'a/two', name: 'Two', installs: 8, rank: 1 },
              { id: 'a/one', name: 'One', installs: 5, rank: 2 },
            ],
          },
        ],
      },
    ]);
  });

  it('omits an inactive role', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: false });
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });

    const shelves = await store.listShelves();

    expect(isOk(shelves) && shelves.value).toEqual([]);
  });

  it('omits an inactive field but keeps the active role', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: false,
    });

    const shelves = await store.listShelves();

    expect(isOk(shelves) && shelves.value).toEqual([{ slug: 'swe', label: 'SWE', fields: [] }]);
  });
});

async function seedTwoFields(store: InMemoryMarketStore): Promise<void> {
  await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
  for (const [sortOrder, slug] of ['frontend', 'testing'].entries()) {
    await store.upsertField({ slug, roleSlug: 'swe', label: slug, q: slug, sortOrder, shelfSize: 30, active: true });
  }
  for (const id of ['a/one', 'a/two', 'a/three']) {
    await store.upsertListing(listing(id), '2026-01-01T00:00:00.000Z');
  }
}

function shelfIds(shelves: Awaited<ReturnType<InMemoryMarketStore['listShelves']>>): Record<string, string[]> {
  if (!isOk(shelves)) throw shelves.error;
  return Object.fromEntries(
    shelves.value.flatMap((role) => role.fields.map((field) => [field.slug, field.skills.map((s) => s.id)])),
  );
}

describe('InMemoryMarketStore.replaceShelves', () => {
  it('replaces every shelf at once: fields left out of the payload become empty', async () => {
    const store = new InMemoryMarketStore();
    await seedTwoFields(store);
    await store.replaceShelves(
      [
        { fieldSlug: 'frontend', entries: [{ id: 'a/one', moreCount: 0 }] },
        { fieldSlug: 'testing', entries: [{ id: 'a/two', moreCount: 0 }] },
      ],
      'v1',
    );

    const replaced = await store.replaceShelves(
      [{ fieldSlug: 'frontend', entries: [{ id: 'a/three', moreCount: 0 }, { id: 'a/one', moreCount: 0 }] }],
      'v2',
    );

    expect(isOk(replaced)).toBe(true);
    expect(shelfIds(await store.listShelves())).toEqual({ frontend: ['a/three', 'a/one'], testing: [] });
  });

  it('lists moreCount on a collapsed lead row and omits it when 0', async () => {
    const store = new InMemoryMarketStore();
    await seedTwoFields(store);
    await store.replaceShelves(
      [{ fieldSlug: 'frontend', entries: [{ id: 'a/one', moreCount: 4 }, { id: 'a/two', moreCount: 0 }] }],
      'v1',
    );

    const shelves = await store.listShelves();

    expect(isOk(shelves) && shelves.value[0]?.fields[0]?.skills).toEqual([
      { id: 'a/one', name: 'a/one', installs: 0, rank: 1, moreCount: 4 },
      { id: 'a/two', name: 'a/two', installs: 0, rank: 2 },
    ]);
  });

  it('a failure mid-replace (unknown skill on the second shelf) leaves the old shelves and meta', async () => {
    const store = new InMemoryMarketStore();
    await seedTwoFields(store);
    await store.replaceShelves(
      [
        { fieldSlug: 'frontend', entries: [{ id: 'a/one', moreCount: 0 }] },
        { fieldSlug: 'testing', entries: [{ id: 'a/two', moreCount: 0 }] },
      ],
      'v1',
    );
    const metaBefore = await store.getShelfMeta();

    const replaced = await store.replaceShelves(
      [
        { fieldSlug: 'frontend', entries: [{ id: 'a/three', moreCount: 0 }] },
        { fieldSlug: 'testing', entries: [{ id: 'not/a-skill', moreCount: 0 }] },
      ],
      'v2',
    );

    expect(isOk(replaced)).toBe(false);
    expect(shelfIds(await store.listShelves())).toEqual({ frontend: ['a/one'], testing: ['a/two'] });
    expect(await store.getShelfMeta()).toEqual(metaBefore);
  });

  it('rejects an unknown field slug without touching the old shelves', async () => {
    const store = new InMemoryMarketStore();
    await seedTwoFields(store);
    await store.replaceShelves([{ fieldSlug: 'frontend', entries: [{ id: 'a/one', moreCount: 0 }] }], 'v1');

    const replaced = await store.replaceShelves([{ fieldSlug: 'nope', entries: [] }], 'v2');

    expect(isOk(replaced)).toBe(false);
    expect(shelfIds(await store.listShelves()).frontend).toEqual(['a/one']);
  });
});

describe('InMemoryMarketStore.getShelfMeta', () => {
  it('is null before any replace', async () => {
    const store = new InMemoryMarketStore();

    const meta = await store.getShelfMeta();

    expect(isOk(meta) && meta.value).toBeNull();
  });

  it('records generatedAt and the taxonomy version of the last successful replace', async () => {
    const store = new InMemoryMarketStore();
    await seedTwoFields(store);

    await store.replaceShelves([], 'v7');
    const meta = await store.getShelfMeta();

    expect(isOk(meta)).toBe(true);
    if (!isOk(meta) || meta.value === null) throw new Error('expected meta');
    expect(meta.value.taxonomyVersion).toBe('v7');
    expect(Number.isNaN(Date.parse(meta.value.generatedAt))).toBe(false);
  });
});

describe('InMemoryMarketStore.markInactiveBefore', () => {
  it('marks rows last seen before seenAt as inactive, and rows seen at/after as active', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('gone'), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listing('present'), '2026-01-02T00:00:00.000Z');

    await store.markInactiveBefore('2026-01-02T00:00:00.000Z');

    // No direct getter for `inactive` on the interface; verify indirectly via a shelf:
    // an inactive skill drops out even though it is still ranked on the shelf.
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    await store.replaceShelves(
      [{ fieldSlug: 'frontend', entries: [{ id: 'gone', moreCount: 0 }, { id: 'present', moreCount: 0 }] }],
      'v1',
    );
    const shelves = await store.listShelves();

    expect(isOk(shelves) && shelves.value[0]?.fields[0]?.skills.map((s) => s.id)).toEqual(['present']);
  });
});

function ownedListing(source: string, name: string, installs: number) {
  return { ...listing(`${source}/${name}`, { name, installs }), source };
}

describe('InMemoryMarketStore owners (T5)', () => {
  const seen = '2026-01-02T00:00:00.000Z';

  async function seeded() {
    const store = new InMemoryMarketStore();
    await store.upsertListing(ownedListing('vercel-labs/agent-skills', 'next', 100), seen);
    await store.upsertListing(ownedListing('vercel-labs/agent-skills', 'ai', 40), seen);
    await store.upsertListing(ownedListing('vercel/skills', 'deploy', 70), seen);
    await store.upsertListing(ownedListing('acme/tools', 'lint', 500), seen);
    await store.upsertListing(ownedListing('acme/tools', 'old', 9000), '2026-01-01T00:00:00.000Z');
    await store.markInactiveBefore(seen);
    return store;
  }

  it('listOwnerStats returns per-owner rows (active only, unknown omitted) that sum into an alias group', async () => {
    const store = await seeded();

    const stats = await store.listOwnerStats(['vercel-labs', 'vercel', 'nobody']);

    expect(isOk(stats)).toBe(true);
    if (!isOk(stats)) return;
    expect(stats.value).toEqual([
      { owner: 'vercel-labs', skillCount: 2, totalInstalls: 140, bestInstalls: 100 },
      { owner: 'vercel', skillCount: 1, totalInstalls: 70, bestInstalls: 70 },
    ]);
    // One creator with two owner aliases: card numbers are the sum over its owners.
    const group = stats.value.reduce(
      (sum, row) => ({ skillCount: sum.skillCount + row.skillCount, totalInstalls: sum.totalInstalls + row.totalInstalls }),
      { skillCount: 0, totalInstalls: 0 },
    );
    expect(group).toEqual({ skillCount: 3, totalInstalls: 210 });
  });

  it('listOwnerStats with no owners returns []', async () => {
    const store = await seeded();
    const stats = await store.listOwnerStats([]);
    expect(isOk(stats) && stats.value).toEqual([]);
  });

  it('listTopOwners orders by bestInstalls descending, ignores inactive skills, and caps at limit', async () => {
    const store = await seeded();

    const top = await store.listTopOwners(2);

    expect(isOk(top) && top.value).toEqual([
      { owner: 'acme', skillCount: 1, totalInstalls: 500, bestInstalls: 500 },
      { owner: 'vercel-labs', skillCount: 2, totalInstalls: 140, bestInstalls: 100 },
    ]);
  });

  it('listSkillsByOwners returns active skills of the owners with topics [] (no labels yet)', async () => {
    const store = await seeded();

    const skills = await store.listSkillsByOwners(['vercel-labs', 'acme'], 'v1');

    expect(isOk(skills) && skills.value).toEqual([
      { id: 'acme/tools/lint', name: 'lint', source: 'acme/tools', owner: 'acme', installs: 500, topics: [] },
      { id: 'vercel-labs/agent-skills/next', name: 'next', source: 'vercel-labs/agent-skills', owner: 'vercel-labs', installs: 100, topics: [] },
      { id: 'vercel-labs/agent-skills/ai', name: 'ai', source: 'vercel-labs/agent-skills', owner: 'vercel-labs', installs: 40, topics: [] },
    ]);
  });

  it('listSkillsByOwners pages past the 1,000-row page size', async () => {
    const store = new InMemoryMarketStore();
    for (let i = 0; i < 2345; i += 1) {
      await store.upsertListing(ownedListing('big/repo', `s${i}`, i), seen);
    }
    await store.upsertListing(ownedListing('other/repo', 'x', 1), seen);

    const skills = await store.listSkillsByOwners(['big'], 'v1');

    expect(isOk(skills)).toBe(true);
    if (!isOk(skills)) return;
    expect(skills.value).toHaveLength(2345);
    expect(new Set(skills.value.map((row) => row.id)).size).toBe(2345);
    expect(skills.value[0]?.installs).toBe(2344);
    expect(skills.value.every((row) => row.owner === 'big')).toBe(true);
  });
});

function score(id: string, overrides: Partial<SkillScore> = {}): SkillScore {
  return {
    id,
    status: 'ok',
    probabilities: { frontend: 0.9 },
    stateHash: `hash-${id}`,
    modelVersion: 'jev@1',
    ...overrides,
  };
}

describe('InMemoryMarketStore labels', () => {
  it('listLabelPool returns active rows with owner from source, ordered by id', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(
      { ...listing('b/two', { installs: 5 }), source: 'vercel-labs/agent-skills' },
      '2026-01-02T00:00:00.000Z',
    );
    await store.upsertListing(listing('a/one', { installs: 9 }), '2026-01-02T00:00:00.000Z');
    await store.upsertListing(listing('c/gone'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/one', { description: 'One', hash: 'h1' });
    await store.markInactiveBefore('2026-01-02T00:00:00.000Z');

    const pool = await store.listLabelPool();

    expect(isOk(pool) && pool.value).toEqual([
      {
        id: 'a/one',
        name: 'a/one',
        source: 'github.com/example/example',
        installs: 9,
        description: 'One',
        labelExcerpt: null,
        owner: 'github.com',
      },
      {
        id: 'b/two',
        name: 'b/two',
        source: 'vercel-labs/agent-skills',
        installs: 5,
        description: null,
        labelExcerpt: null,
        owner: 'vercel-labs',
      },
    ]);
  });

  it('list methods page past 1,000 rows', async () => {
    const store = new InMemoryMarketStore();
    const ids = Array.from({ length: 2_345 }, (_, i) => `o/s${String(i).padStart(5, '0')}`);
    for (const id of ids) {
      await store.upsertListing(listing(id), '2026-01-01T00:00:00.000Z');
    }
    await store.saveLabels('v1', ids.map((id) => score(id)));

    const pool = await store.listLabelPool();
    const keys = await store.listLabelKeys('v1');
    const labels = await store.listLabels('v1');

    expect(isOk(pool) && pool.value.map((row) => row.id)).toEqual(ids);
    expect(isOk(keys) && keys.value.size).toBe(2_345);
    expect(isOk(labels) && labels.value.map((row) => row.id)).toEqual(ids);
  });

  it.each([4, 5])('pages with a simulated page size of 2 (%i rows)', async (count) => {
    const store = new InMemoryMarketStore();
    store.labelPageSize = 2;
    const ids = Array.from({ length: count }, (_, i) => `o/s${i}`);
    for (const id of ids) {
      await store.upsertListing(listing(id), '2026-01-01T00:00:00.000Z');
    }
    await store.saveLabels('v1', ids.map((id) => score(id)));

    const pool = await store.listLabelPool();
    const keys = await store.listLabelKeys('v1');
    const labels = await store.listLabels('v1');

    expect(isOk(pool) && pool.value.map((row) => row.id)).toEqual(ids);
    expect(isOk(keys) && [...keys.value.keys()]).toEqual(ids);
    expect(isOk(labels) && labels.value.map((row) => row.id)).toEqual(ids);
  });

  it('saveLabels upserts on (skill_id, taxonomy_version)', async () => {
    const store = new InMemoryMarketStore();
    await store.saveLabels('v1', [score('a/one'), score('b/two')]);
    await store.saveLabels('v2', [score('a/one', { stateHash: 'v2-hash' })]);

    await store.saveLabels('v1', [score('a/one', { status: 'error', probabilities: {}, stateHash: 'new-hash' })]);

    const v1 = await store.listLabels('v1');
    const v1Keys = await store.listLabelKeys('v1');
    const v2 = await store.listLabels('v2');
    expect(isOk(v1) && v1.value).toEqual([
      score('a/one', { status: 'error', probabilities: {}, stateHash: 'new-hash' }),
      score('b/two'),
    ]);
    expect(isOk(v1Keys) && Object.fromEntries(v1Keys.value)).toEqual({
      'a/one': { stateHash: 'new-hash', status: 'error' },
      'b/two': { stateHash: 'hash-b/two', status: 'ok' },
    });
    expect(isOk(v2) && v2.value).toEqual([score('a/one', { stateHash: 'v2-hash' })]);
  });

  it('listLabelKeys is empty for an unknown version', async () => {
    const store = new InMemoryMarketStore();
    await store.saveLabels('v1', [score('a/one')]);

    const keys = await store.listLabelKeys('v9');

    expect(isOk(keys) && keys.value.size).toBe(0);
  });
});
