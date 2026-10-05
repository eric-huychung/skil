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
