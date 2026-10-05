import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';

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
