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
    await store.setFieldShelf('frontend', ['a/two', 'a/one', 'a/three']);

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
    await store.setFieldShelf('frontend', ['gone', 'present']);
    const shelves = await store.listShelves();

    expect(isOk(shelves) && shelves.value[0]?.fields[0]?.skills.map((s) => s.id)).toEqual(['present']);
  });
});
