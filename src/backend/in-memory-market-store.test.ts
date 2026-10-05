import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { CreatorCheck, SkillScore } from './market-types.js';
import { TAXONOMY_VERSION, TOPIC_THRESHOLD } from './topic-taxonomy.js';

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

  it('listSkillsByOwners joins labels of the given version: threshold, max and order from topicsFor', async () => {
    const store = await seeded();
    const label = (id: string, probabilities: Record<string, number>, status: 'ok' | 'error' = 'ok') => ({
      id,
      status,
      probabilities,
      stateHash: `hash-${id}`,
      modelVersion: 'jev@1',
    });
    await store.saveLabels('v1', [
      label('acme/tools/lint', { testing: 0.7, frontend: 0.9, docs: 0.8, cloud: 0.65, chat: 0.1 }),
      label('vercel-labs/agent-skills/ai', { frontend: 0.9 }, 'error'),
    ]);
    await store.saveLabels('v0', [label('vercel-labs/agent-skills/next', { frontend: 0.99 })]);

    const skills = await store.listSkillsByOwners(['vercel-labs', 'acme'], 'v1');

    expect(isOk(skills) && skills.value.map((row) => [row.id, row.topics])).toEqual([
      ['acme/tools/lint', ['frontend', 'docs', 'testing']],
      ['vercel-labs/agent-skills/next', []],
      ['vercel-labs/agent-skills/ai', []],
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

describe('InMemoryMarketStore detail (T15b)', () => {
  it('getDetailState reports null hash and no excerpt for an unknown or unhydrated id', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/new'), '2026-01-01T00:00:00.000Z');

    expect(await store.getDetailState('a/new')).toEqual({ ok: true, value: { hash: null, hasExcerpt: false } });
    expect(await store.getDetailState('a/missing')).toEqual({ ok: true, value: { hash: null, hasExcerpt: false } });
  });

  it('setDetail stores the excerpt; omitting it leaves the stored excerpt unchanged', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/skill'), '2026-01-01T00:00:00.000Z');

    await store.setDetail('a/skill', { description: 'd', hash: 'hash-1', labelExcerpt: 'Body text.' });
    expect(await store.getDetailState('a/skill')).toEqual({ ok: true, value: { hash: 'hash-1', hasExcerpt: true } });

    await store.setDetail('a/skill', { description: 'd', hash: 'hash-2' });
    expect(await store.getDetailState('a/skill')).toEqual({ ok: true, value: { hash: 'hash-2', hasExcerpt: true } });

    await store.setDetail('a/skill', { description: 'd', hash: 'hash-3', labelExcerpt: null });
    expect(await store.getDetailState('a/skill')).toEqual({ ok: true, value: { hash: 'hash-3', hasExcerpt: false } });
  });

  it('upsertListing keeps the stored excerpt', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/skill'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/skill', { description: 'd', hash: 'hash-1', labelExcerpt: 'Body.' });

    await store.upsertListing(listing('a/skill', { installs: 5 }), '2026-01-02T00:00:00.000Z');

    expect(await store.getDetailState('a/skill')).toEqual({ ok: true, value: { hash: 'hash-1', hasExcerpt: true } });
  });

  it('listIdsMissingExcerpt returns active rows with no excerpt, sorted by id', async () => {
    const store = new InMemoryMarketStore();
    for (const id of ['a/c', 'a/has', 'a/b', 'a/gone']) {
      await store.upsertListing(listing(id), id === 'a/gone' ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z');
    }
    await store.setDetail('a/has', { description: null, hash: 'h', labelExcerpt: 'Body.' });
    await store.markInactiveBefore('2026-01-02T00:00:00.000Z');

    expect(await store.listIdsMissingExcerpt()).toEqual({ ok: true, value: ['a/b', 'a/c'] });
  });

  it('listLabelPool returns the stored excerpt', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/skill'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/skill', { description: 'd', hash: 'h', labelExcerpt: 'Body.' });

    const pool = await store.listLabelPool();

    expect(isOk(pool) && pool.value[0]?.labelExcerpt).toBe('Body.');
  });
});

describe('InMemoryMarketStore creator checks', () => {
  function check(creatorKey: string, overrides: Partial<CreatorCheck> = {}): CreatorCheck {
    return {
      creatorKey,
      stateHash: `hash-${creatorKey}`,
      techProbability: 0.9,
      domain: 'software-dev',
      modelVersion: 'jev-1',
      ...overrides,
    };
  }

  it('getCreatorChecks returns saved rows for the asked keys and omits missing ones', async () => {
    const store = new InMemoryMarketStore();
    await store.saveCreatorCheck(check('antfu'));
    await store.saveCreatorCheck(check('larksuite+open.feishu.cn'));

    const rows = await store.getCreatorChecks(['antfu', 'nobody']);

    expect(isOk(rows) && rows.value).toEqual([check('antfu')]);
  });

  it('saveCreatorCheck replaces the row for the same creatorKey', async () => {
    const store = new InMemoryMarketStore();
    await store.saveCreatorCheck(check('antfu'));
    await store.saveCreatorCheck(check('antfu', { stateHash: 'new-hash', techProbability: 0.2, domain: 'other' }));

    const rows = await store.getCreatorChecks(['antfu']);

    expect(isOk(rows) && rows.value).toEqual([
      check('antfu', { stateHash: 'new-hash', techProbability: 0.2, domain: 'other' }),
    ]);
  });

  it('getCreatorChecks with no keys returns []', async () => {
    const store = new InMemoryMarketStore();
    await store.saveCreatorCheck(check('antfu'));

    const rows = await store.getCreatorChecks([]);

    expect(isOk(rows) && rows.value).toEqual([]);
  });
});

describe('InMemoryMarketStore.searchListings (T21 relevance-first)', () => {
  async function seed(rows: Array<{ id: string; installs: number; description?: string }>) {
    const store = new InMemoryMarketStore();
    for (const row of rows) {
      await store.upsertListing(listing(row.id, { installs: row.installs }), '2026-01-01T00:00:00.000Z');
      if (row.description) await store.setDetail(row.id, { description: row.description, hash: null });
    }
    return store;
  }

  async function searchIds(store: InMemoryMarketStore, q: string, limit = 25) {
    const result = await store.searchListings(q, { limit });
    if (!isOk(result)) throw result.error;
    return result.value.map((row) => row.id);
  }

  it('ranks an exact name above prefix and text matches with more installs (shadcn)', async () => {
    const store = await seed([
      { id: 'ui-kit', installs: 9000, description: 'Components built on shadcn and Tailwind' },
      { id: 'shadcn-ui-blocks', installs: 5000 },
      { id: 'shadcn', installs: 10 },
      { id: 'react-forms', installs: 8000, description: 'Form helpers' },
    ]);

    expect(await searchIds(store, 'shadcn')).toEqual(['shadcn', 'shadcn-ui-blocks', 'ui-kit']);
    expect(await searchIds(store, 'ShadCN')).toEqual(['shadcn', 'shadcn-ui-blocks', 'ui-kit']);
  });

  it('finds a name from a typo and keeps exact > prefix > text for the correct spelling (tdd / tddd)', async () => {
    const store = await seed([
      { id: 'test-runner', installs: 7000, description: 'Run tests in a tdd loop' },
      { id: 'tdd-workflow', installs: 3000 },
      { id: 'tdd', installs: 100 },
      { id: 'docs-writer', installs: 9000, description: 'Write docs' },
    ]);

    expect(await searchIds(store, 'tdd')).toEqual(['tdd', 'tdd-workflow', 'test-runner']);
    expect(await searchIds(store, 'tddd')).toEqual(['tdd']);
  });

  it('answers a concept query from descriptions, every word required, installs as the tie-break', async () => {
    const store = await seed([
      { id: 'jest-helper', installs: 200, description: 'Write tests with Jest' },
      { id: 'pytest-pro', installs: 900, description: 'Generate and write tests for Python code' },
      { id: 'docs-writer', installs: 5000, description: 'Write docs for a project' },
      { id: 'flaky-hunter', installs: 9000, description: 'Find flaky tests' },
    ]);

    expect(await searchIds(store, 'write tests')).toEqual(['pytest-pro', 'jest-helper']);
  });

  it('puts close trigram matches above text-only matches, most similar first', async () => {
    const store = await seed([
      { id: 'notes', installs: 9000, description: 'Keeps a changelog of your notes' },
      { id: 'chnagelog', installs: 500 },
      { id: 'change-log', installs: 10 },
    ]);

    // Neither name contains `changelog`; both are typo-close (trigram), and
    // the closer one wins over installs. The description match comes last.
    expect(await searchIds(store, 'changelog')).toEqual(['change-log', 'chnagelog', 'notes']);
  });

  it('excludes inactive rows, honors the limit, and returns nothing for a blank query', async () => {
    const store = await seed([
      { id: 'shadcn', installs: 10 },
      { id: 'shadcn-old', installs: 99999 },
      { id: 'shadcn-forms', installs: 50 },
    ]);
    await store.upsertListing(listing('shadcn', { installs: 10 }), '2026-02-01T00:00:00.000Z');
    await store.upsertListing(listing('shadcn-forms', { installs: 50 }), '2026-02-01T00:00:00.000Z');
    await store.markInactiveBefore('2026-02-01T00:00:00.000Z');

    expect(await searchIds(store, 'shadcn')).toEqual(['shadcn', 'shadcn-forms']);
    expect(await searchIds(store, 'shadcn', 1)).toEqual(['shadcn']);
    expect(await searchIds(store, '   ')).toEqual([]);
  });
});

describe('InMemoryMarketStore.searchListings (T22 owner and topic)', () => {
  async function seed(rows: Array<{ id: string; source?: string; installs: number; description?: string }>) {
    const store = new InMemoryMarketStore();
    for (const row of rows) {
      const name = row.id.split('/').pop() ?? row.id;
      await store.upsertListing(
        { ...listing(row.id, { name, installs: row.installs }), source: row.source ?? 'github.com/example/example' },
        '2026-01-01T00:00:00.000Z',
      );
      if (row.description) await store.setDetail(row.id, { description: row.description, hash: null });
    }
    return store;
  }

  async function searchIds(store: InMemoryMarketStore, q: string, limit = 25) {
    const result = await store.searchListings(q, { limit });
    if (!isOk(result)) throw result.error;
    return result.value.map((row) => row.id);
  }

  it("returns an owner's skills first when the query is an owner name (vercel-labs)", async () => {
    const store = await seed([
      { id: 'acme/tools/deploy', source: 'acme/tools', installs: 9000, description: 'Deploy to vercel-labs style previews' },
      { id: 'vercel-labs/agent-skills/next', source: 'vercel-labs/agent-skills', installs: 100 },
      { id: 'vercel-labs/agent-skills/ai', source: 'vercel-labs/agent-skills', installs: 400 },
      { id: 'vercel/other/edge', source: 'vercel/other', installs: 5000 },
    ]);

    expect(await searchIds(store, 'vercel-labs')).toEqual([
      'vercel-labs/agent-skills/ai',
      'vercel-labs/agent-skills/next',
      'acme/tools/deploy',
    ]);
    expect(await searchIds(store, 'Vercel-Labs')).toEqual([
      'vercel-labs/agent-skills/ai',
      'vercel-labs/agent-skills/next',
      'acme/tools/deploy',
    ]);
  });

  it('returns skills labelled with a topic first (testing): current version, topicsFor threshold and cap', async () => {
    const store = await seed([
      { id: 'a/x/flaky-hunter', installs: 9000, description: 'Find flaky testing setups' },
      { id: 'a/x/jest-helper', installs: 200 },
      { id: 'a/x/pytest-pro', installs: 900 },
      { id: 'a/x/below-threshold', installs: 8000 },
      { id: 'a/x/over-cap', installs: 7000 },
      { id: 'a/x/old-version', installs: 6000 },
      { id: 'a/x/errored', installs: 5000 },
    ]);
    const label = (id: string, probabilities: Record<string, number>, status: 'ok' | 'error' = 'ok') =>
      score(id, { probabilities, status });
    await store.saveLabels(TAXONOMY_VERSION, [
      label('a/x/jest-helper', { testing: 0.95 }),
      label('a/x/pytest-pro', { testing: 0.8, backend: 0.7 }),
      label('a/x/below-threshold', { testing: TOPIC_THRESHOLD - 0.01 }),
      // Fourth-highest field: topicsFor keeps only MAX_TOPICS_PER_SKILL.
      label('a/x/over-cap', { frontend: 0.99, api: 0.98, backend: 0.97, testing: 0.96 }),
      label('a/x/errored', { testing: 0.99 }, 'error'),
    ]);
    await store.saveLabels('old-version', [label('a/x/old-version', { testing: 0.99 })]);

    expect(await searchIds(store, 'testing')).toEqual(['a/x/pytest-pro', 'a/x/jest-helper', 'a/x/flaky-hunter']);
  });

  it('matches a multi-word topic query against the hyphenated field slug (design system)', async () => {
    const store = await seed([{ id: 'a/x/tokens', installs: 10 }, { id: 'a/x/other', installs: 99 }]);
    await store.saveLabels(TAXONOMY_VERSION, [score('a/x/tokens', { probabilities: { 'design-system': 0.9 } })]);

    expect(await searchIds(store, 'design system')).toEqual(['a/x/tokens']);
  });

  it('keeps exact name and name prefix above owner and topic hits, and those above typo and text', async () => {
    const store = await seed([
      { id: 'a/x/testing', installs: 1 },
      { id: 'a/x/testing-kit', installs: 2 },
      { id: 'a/x/labelled', installs: 3 },
      { id: 'a/x/testin', installs: 10_000 },
      { id: 'a/x/notes', installs: 20_000, description: 'testing notes' },
    ]);
    await store.saveLabels(TAXONOMY_VERSION, [score('a/x/labelled', { probabilities: { testing: 0.9 } })]);

    expect(await searchIds(store, 'testing')).toEqual([
      'a/x/testing',
      'a/x/testing-kit',
      'a/x/labelled',
      'a/x/testin',
      'a/x/notes',
    ]);
  });
});
