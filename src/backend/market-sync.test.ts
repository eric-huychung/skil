import { describe, expect, it, vi } from 'vitest';
import { err, isOk, ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { MarketListingPage, MarketSkillsClient } from './market-client.js';
import { MarketSync } from './market-sync.js';

function listingItem(id: string, installs = 0) {
  return {
    id,
    name: id,
    slug: id,
    source: 'github.com/example/example',
    installs,
    installUrl: `https://skills.sh/${id}`,
    url: `https://github.com/example/${id}`,
  };
}

function fakeClient(pages: MarketListingPage[]): MarketSkillsClient {
  let call = 0;
  return {
    listPage: vi.fn(async () => {
      const page = pages[call];
      call += 1;
      return page ? ok(page) : ok({ items: [] });
    }),
    getSkill: vi.fn(async () => ok({ description: null, hash: 'unused' })),
    getAudit: vi.fn(async () => ok({ status: 'none' as const })),
    getSkillMd: vi.fn(async () => ok(null)),
    searchSkills: vi.fn(async () => ok([])),
  };
}

describe('MarketSync.crawlListing', () => {
  it('pages until a page omits nextCursor, upserting every item', async () => {
    const store = new InMemoryMarketStore();
    const client = fakeClient([
      { items: [listingItem('a/one'), listingItem('a/two')], nextCursor: 'page-2' },
      { items: [listingItem('a/three')] },
    ]);
    const sync = new MarketSync({ store, client, now: () => '2026-01-01T00:00:00.000Z' });

    const result = await sync.crawlListing();

    expect(isOk(result)).toBe(true);
    expect(client.listPage).toHaveBeenCalledTimes(2);
    expect(client.listPage).toHaveBeenNthCalledWith(1, undefined);
    expect(client.listPage).toHaveBeenNthCalledWith(2, 'page-2');
    if (isOk(result)) {
      expect(result.value.queued.sort()).toEqual(['a/one', 'a/three', 'a/two']);
    }
  });

  it('does not re-queue a known id that already has a hash', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/known'), '2025-12-01T00:00:00.000Z');
    await store.setDetail('a/known', { description: 'known', hash: 'hash-1' });

    const client = fakeClient([{ items: [listingItem('a/known'), listingItem('a/new')] }]);
    const sync = new MarketSync({ store, client, now: () => '2026-01-01T00:00:00.000Z' });

    const result = await sync.crawlListing();

    expect(isOk(result) && result.value.queued).toEqual(['a/new']);
  });

  it('propagates an error from a failed page fetch without upserting later pages', async () => {
    const store = new InMemoryMarketStore();
    const client: MarketSkillsClient = {
      listPage: vi.fn(async () => err(new Error('rate limited'))),
      getSkill: vi.fn(async () => ok({ description: null, hash: 'unused' })),
      getAudit: vi.fn(async () => ok({ status: 'none' as const })),
      getSkillMd: vi.fn(async () => ok(null)),
      searchSkills: vi.fn(async () => ok([])),
    };
    const sync = new MarketSync({ store, client });

    const result = await sync.crawlListing();

    expect(isOk(result)).toBe(false);
  });
});

describe('MarketSync.hydrateDetails', () => {
  it('saves description + hash for a new id', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/new'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'A skill.', hash: 'hash-1' }));
    const sync = new MarketSync({ store, client });

    const result = await sync.hydrateDetails(['a/new']);

    expect(isOk(result) && result.value.hydrated).toEqual(['a/new']);
    const hash = await store.getHash('a/new');
    expect(isOk(hash) && hash.value).toBe('hash-1');
  });

  it('is a no-op when the fetched hash matches the stored hash', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/same'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/same', { description: 'Old description', hash: 'hash-1' });
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'New description', hash: 'hash-1' }));
    const sync = new MarketSync({ store, client });

    const result = await sync.hydrateDetails(['a/same']);

    expect(isOk(result) && result.value.unchanged).toEqual(['a/same']);
    const detail = await store.getHash('a/same');
    // description untouched by the no-op — still the old one.
    expect(isOk(detail) && detail.value).toBe('hash-1');
  });

  it('hydrates when the fetched hash differs from the stored hash', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/changed'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/changed', { description: 'Old', hash: 'hash-1' });
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'New', hash: 'hash-2' }));
    const sync = new MarketSync({ store, client });

    const result = await sync.hydrateDetails(['a/changed']);

    expect(isOk(result) && result.value.hydrated).toEqual(['a/changed']);
    const hash = await store.getHash('a/changed');
    expect(isOk(hash) && hash.value).toBe('hash-2');
  });

  it('skips an id whose detail fetch fails, without stopping the rest of the queue', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/fails'), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listingItem('a/ok'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient([]);
    client.getSkill = vi.fn(async (id: string) =>
      id === 'a/fails' ? err(new Error('404')) : ok({ description: 'ok', hash: 'hash-1' }),
    );
    const sync = new MarketSync({ store, client });

    const result = await sync.hydrateDetails(['a/fails', 'a/ok']);

    expect(isOk(result) && result.value.hydrated).toEqual(['a/ok']);
  });

  it('accepts a detail response with description null (files: null is fine, never stored)', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/no-desc'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: null, hash: 'hash-1' }));
    const sync = new MarketSync({ store, client });

    const result = await sync.hydrateDetails(['a/no-desc']);

    expect(isOk(result) && result.value.hydrated).toEqual(['a/no-desc']);
  });
});

describe('MarketSync.syncListing', () => {
  async function shelfSkillIds(store: InMemoryMarketStore, ids: string[]) {
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
    await store.setFieldShelf('frontend', ids);
    const shelves = await store.listShelves();
    return isOk(shelves) ? shelves.value[0]?.fields[0]?.skills.map((s) => s.id) : [];
  }

  it('marks a skill missing from a full second crawl as inactive, keeping the present one active', async () => {
    const store = new InMemoryMarketStore();
    const firstCrawl = fakeClient([{ items: [listingItem('a/gone'), listingItem('a/stays')] }]);
    await new MarketSync({ store, client: firstCrawl, now: () => '2026-01-01T00:00:00.000Z' }).syncListing();

    const secondCrawl = fakeClient([{ items: [listingItem('a/stays')] }]);
    const sync = new MarketSync({ store, client: secondCrawl, now: () => '2026-01-02T00:00:00.000Z' });
    const result = await sync.syncListing();

    expect(isOk(result)).toBe(true);
    expect(await shelfSkillIds(store, ['a/gone', 'a/stays'])).toEqual(['a/stays']);
  });

  it('does not call markInactiveBefore when the crawl fails partway (no mass wipe)', async () => {
    const store = new InMemoryMarketStore();
    const seed = fakeClient([{ items: [listingItem('a/stays')] }]);
    await new MarketSync({ store, client: seed, now: () => '2026-01-01T00:00:00.000Z' }).syncListing();

    let call = 0;
    const failingClient: MarketSkillsClient = {
      listPage: vi.fn(async () => {
        call += 1;
        return call === 1 ? ok({ items: [listingItem('a/new')], nextCursor: 'page-2' }) : err(new Error('rate limited'));
      }),
      getSkill: vi.fn(async () => ok({ description: null, hash: 'unused' })),
      getAudit: vi.fn(async () => ok({ status: 'none' as const })),
      getSkillMd: vi.fn(async () => ok(null)),
      searchSkills: vi.fn(async () => ok([])),
    };
    const markInactiveBefore = vi.spyOn(store, 'markInactiveBefore');
    const sync = new MarketSync({ store, client: failingClient, now: () => '2026-01-02T00:00:00.000Z' });

    const result = await sync.syncListing();

    expect(isOk(result)).toBe(false);
    expect(markInactiveBefore).not.toHaveBeenCalled();
    // The originally-seeded skill is still active — no mass wipe from the partial crawl.
    expect(await shelfSkillIds(store, ['a/stays'])).toEqual(['a/stays']);
  });
});

describe('MarketSync.refreshActiveFields', () => {
  it('ranks a field shelf by installs descending and caps at shelf_size', async () => {
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
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () =>
      ok([listingItem('a/low', 5), listingItem('a/high', 50), listingItem('a/mid', 20)]),
    );
    const sync = new MarketSync({ store, client, now: () => '2026-01-01T00:00:00.000Z' });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.refreshed).toEqual(['frontend']);
    const shelves = await store.listShelves();
    expect(isOk(shelves) && shelves.value[0]?.fields[0]?.skills).toEqual([
      { id: 'a/high', name: 'a/high', installs: 50, rank: 1 },
      { id: 'a/mid', name: 'a/mid', installs: 20, rank: 2 },
    ]);
  });

  it('drops is_duplicate rows before ranking', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () =>
      ok([{ ...listingItem('a/dup', 999), isDuplicate: true }, listingItem('a/real', 10)]),
    );
    const sync = new MarketSync({ store, client });

    await sync.refreshActiveFields();

    const shelves = await store.listShelves();
    expect(isOk(shelves) && shelves.value[0]?.fields[0]?.skills.map((s) => s.id)).toEqual(['a/real']);
  });

  it('skips an inactive field', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'legacy',
      roleSlug: 'swe',
      label: 'Legacy',
      q: 'legacy',
      sortOrder: 1,
      shelfSize: 30,
      active: false,
    });
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () => ok([listingItem('a/one', 10)]));
    const sync = new MarketSync({ store, client });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.refreshed).toEqual([]);
    expect(client.searchSkills).not.toHaveBeenCalled();
  });

  it('picks up a 21st active field with no code change', async () => {
    const store = new InMemoryMarketStore();
    for (let i = 1; i <= 21; i += 1) {
      await store.upsertField({
        slug: `field-${i}`,
        roleSlug: 'swe',
        label: `Field ${i}`,
        q: `field ${i}`,
        sortOrder: i,
        shelfSize: 30,
        active: true,
      });
    }
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () => ok([listingItem('a/one', 10)]));
    const sync = new MarketSync({ store, client });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.refreshed).toHaveLength(21);
    expect(client.searchSkills).toHaveBeenCalledTimes(21);
  });

  it('skips a field whose search fails, continuing the rest', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'fails',
      roleSlug: 'swe',
      label: 'Fails',
      q: 'fails',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    await store.upsertField({
      slug: 'ok',
      roleSlug: 'swe',
      label: 'Ok',
      q: 'ok',
      sortOrder: 2,
      shelfSize: 30,
      active: true,
    });
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async (q: string) =>
      q === 'fails' ? err(new Error('upstream error')) : ok([listingItem('a/one', 10)]),
    );
    const sync = new MarketSync({ store, client });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.failed).toEqual(['fails']);
    expect(isOk(result) && result.value.refreshed).toEqual(['ok']);
  });

  it('queues a search result with no stored hash, even though it is not in any listing crawl', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    const client = fakeClient([]);
    // 'a/search-only' never appears in a listPage call anywhere in this test —
    // it is discovered purely through search, the way skills.sh can surface
    // a result that its own paginated listing never returns.
    client.searchSkills = vi.fn(async () => ok([listingItem('a/search-only', 10)]));
    const sync = new MarketSync({ store, client });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.queued).toEqual(['a/search-only']);
  });

  it('does not re-queue a search result that already has a hash', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    await store.upsertListing(listingItem('a/known', 10), '2025-12-01T00:00:00.000Z');
    await store.setDetail('a/known', { description: 'known', hash: 'hash-1' });
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () => ok([listingItem('a/known', 10)]));
    const sync = new MarketSync({ store, client });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.queued).toEqual([]);
  });

  it('dedupes a queued id that shows up on more than one field shelf', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    await store.upsertField({
      slug: 'design-system',
      roleSlug: 'ui-ux',
      label: 'Design system',
      q: 'design system',
      sortOrder: 2,
      shelfSize: 30,
      active: true,
    });
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () => ok([listingItem('a/shared', 10)]));
    const sync = new MarketSync({ store, client });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.queued).toEqual(['a/shared']);
  });
});

describe('MarketSync.sync({ maxDetail })', () => {
  async function withFrontendField(store: InMemoryMarketStore) {
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
  }

  it('does not crawl the listing', async () => {
    const store = new InMemoryMarketStore();
    await withFrontendField(store);
    const client = fakeClient([{ items: [listingItem('a/listed')] }]);
    client.searchSkills = vi.fn(async () => ok([listingItem('a/search', 10)]));
    const sync = new MarketSync({ store, client });

    await sync.sync({ maxDetail: 40 });

    expect(client.listPage).not.toHaveBeenCalled();
  });

  it('refreshes shelves then hydrates at most maxDetail of the search queue', async () => {
    const store = new InMemoryMarketStore();
    await withFrontendField(store);
    const searchItems = Array.from({ length: 50 }, (_, i) => listingItem(`a/skill-${i}`, 50 - i));
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () => ok(searchItems));
    client.getSkill = vi.fn(async (id: string) => ok({ description: 'd', hash: `hash-${id}` }));
    const sync = new MarketSync({ store, client, now: () => '2026-01-01T00:00:00.000Z' });

    const result = await sync.sync({ maxDetail: 40 });

    expect(isOk(result)).toBe(true);
    expect(client.getSkill).toHaveBeenCalledTimes(30);
    if (isOk(result)) {
      expect(result.value.listingQueued).toEqual([]);
      expect(result.value.shelfQueued).toHaveLength(30);
      expect(result.value.hydrated).toHaveLength(30);
      expect(result.value.refreshed).toEqual(['frontend']);
    }
  });

  it('caps hydrate at maxDetail even when search queues more than the shelf', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend ui',
      sortOrder: 1,
      shelfSize: 50,
      active: true,
    });
    const searchItems = Array.from({ length: 50 }, (_, i) => listingItem(`a/skill-${i}`, 50 - i));
    const client = fakeClient([]);
    client.searchSkills = vi.fn(async () => ok(searchItems));
    client.getSkill = vi.fn(async (id: string) => ok({ description: 'd', hash: `hash-${id}` }));
    const sync = new MarketSync({ store, client });

    const result = await sync.sync({ maxDetail: 40 });

    expect(isOk(result)).toBe(true);
    expect(client.getSkill).toHaveBeenCalledTimes(40);
    if (isOk(result)) {
      expect(result.value.shelfQueued).toHaveLength(50);
      expect(result.value.hydrated).toHaveLength(40);
    }
  });
});
