import { describe, expect, it, vi } from 'vitest';
import { err, isOk, ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { MarketListingPage, MarketSkillsClient } from './market-client.js';
import { MarketSync } from './market-sync.js';
import { FakeSkillClassifier } from './skill-classifier.js';
import { GOLD_LABELS, GOLD_LISTINGS } from './shelf-gold.fixture.js';

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
  };
}

const noopClassifier = new FakeSkillClassifier();

function syncOf(
  store: InMemoryMarketStore,
  client: MarketSkillsClient,
  extra: { now?: () => string; classifier?: FakeSkillClassifier } = {},
) {
  return new MarketSync({
    store,
    client,
    classifier: extra.classifier ?? noopClassifier,
    now: extra.now,
  });
}

describe('MarketSync.crawlListing', () => {
  it('pages until a page omits nextCursor, upserting every item', async () => {
    const store = new InMemoryMarketStore();
    const client = fakeClient([
      { items: [listingItem('a/one'), listingItem('a/two')], nextCursor: 'page-2' },
      { items: [listingItem('a/three')] },
    ]);
    const sync = syncOf(store, client, { now: () => '2026-01-01T00:00:00.000Z' });

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
    const sync = syncOf(store, client, { now: () => '2026-01-01T00:00:00.000Z' });

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
    };
    const sync = syncOf(store, client);

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
    const sync = syncOf(store, client);

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
    const sync = syncOf(store, client);

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
    const sync = syncOf(store, client);

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
    const sync = syncOf(store, client);

    const result = await sync.hydrateDetails(['a/fails', 'a/ok']);

    expect(isOk(result) && result.value.hydrated).toEqual(['a/ok']);
  });

  it('accepts a detail response with description null (files: null is fine, never stored)', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/no-desc'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: null, hash: 'hash-1' }));
    const sync = syncOf(store, client);

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
    await syncOf(store, firstCrawl, { now: () => '2026-01-01T00:00:00.000Z' }).syncListing();

    const secondCrawl = fakeClient([{ items: [listingItem('a/stays')] }]);
    const sync = syncOf(store, secondCrawl, { now: () => '2026-01-02T00:00:00.000Z' });
    const result = await sync.syncListing();

    expect(isOk(result)).toBe(true);
    expect(await shelfSkillIds(store, ['a/gone', 'a/stays'])).toEqual(['a/stays']);
  });

  it('does not call markInactiveBefore when the crawl fails partway (no mass wipe)', async () => {
    const store = new InMemoryMarketStore();
    const seed = fakeClient([{ items: [listingItem('a/stays')] }]);
    await syncOf(store, seed, { now: () => '2026-01-01T00:00:00.000Z' }).syncListing();

    let call = 0;
    const failingClient: MarketSkillsClient = {
      listPage: vi.fn(async () => {
        call += 1;
        return call === 1 ? ok({ items: [listingItem('a/new')], nextCursor: 'page-2' }) : err(new Error('rate limited'));
      }),
      getSkill: vi.fn(async () => ok({ description: null, hash: 'unused' })),
      getAudit: vi.fn(async () => ok({ status: 'none' as const })),
      getSkillMd: vi.fn(async () => ok(null)),
    };
    const markInactiveBefore = vi.spyOn(store, 'markInactiveBefore');
    const sync = syncOf(store, failingClient, { now: () => '2026-01-02T00:00:00.000Z' });

    const result = await sync.syncListing();

    expect(isOk(result)).toBe(false);
    expect(markInactiveBefore).not.toHaveBeenCalled();
    // The originally-seeded skill is still active — no mass wipe from the partial crawl.
    expect(await shelfSkillIds(store, ['a/stays'])).toEqual(['a/stays']);
  });
});

describe('MarketSync.refreshActiveFields', () => {
  async function seedGold(store: InMemoryMarketStore) {
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
    for (const slug of ['frontend', 'testing', 'review', 'workflow', 'integrations', 'prd']) {
      await store.upsertField({
        slug,
        roleSlug: slug === 'workflow' ? 'agent' : slug === 'integrations' ? 'other' : 'swe',
        label: slug,
        q: slug,
        sortOrder: 1,
        shelfSize: 30,
        active: true,
      });
    }
    for (const row of GOLD_LISTINGS) {
      await store.upsertListing(
        {
          id: row.id,
          name: row.name,
          slug: row.slug,
          source: 'github.com/example',
          installs: row.installs,
          installUrl: null,
          url: `https://github.com/${row.id}`,
        },
        '2026-01-01T00:00:00.000Z',
      );
      await store.setDetail(row.id, { description: row.description, hash: row.hash });
    }
  }

  it('puts gold listings on the right shelves and does not call search', async () => {
    const store = new InMemoryMarketStore();
    await seedGold(store);
    const client = fakeClient([]);
    const classifier = new FakeSkillClassifier(new Map(GOLD_LABELS.map((label) => [label.id, label.fieldSlugs])));
    const sync = syncOf(store, client, { classifier });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.failed).toEqual([]);
    const shelves = await store.listShelves();
    const frontend = isOk(shelves) ? shelves.value.flatMap((role) => role.fields).find((f) => f.slug === 'frontend') : undefined;
    const testing = isOk(shelves) ? shelves.value.flatMap((role) => role.fields).find((f) => f.slug === 'testing') : undefined;
    expect(frontend?.skills.map((s) => s.id)).toContain('anthropics/skills/frontend-design');
    expect(testing?.skills.map((s) => s.id)).toEqual(['mattpocock/skills/tdd']);
    expect(client.listPage).not.toHaveBeenCalled();
  });

  it('skips an inactive field and still writes the active ones', async () => {
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
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend',
      sortOrder: 2,
      shelfSize: 30,
      active: true,
    });
    await store.upsertListing(listingItem('a/one', 10), '2026-01-01T00:00:00.000Z');
    const sync = syncOf(store, fakeClient([]), {
      classifier: new FakeSkillClassifier(new Map([['a/one', ['frontend']]])),
    });

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.refreshed).toEqual(['frontend']);
  });

  it('picks up a 22nd active field because fields come from the store', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/one', 10), '2026-01-01T00:00:00.000Z');
    for (let i = 1; i <= 22; i += 1) {
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
    const sync = syncOf(store, fakeClient([]));

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.refreshed).toHaveLength(22);
  });

  it('writes no shelves when classify fails', async () => {
    const store = new InMemoryMarketStore();
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
    await store.upsertListing(listingItem('a/keep', 10), '2026-01-01T00:00:00.000Z');
    await store.setFieldShelf('frontend', ['a/keep']);
    const classifier = { classify: async () => err(new Error('gateway down')) };
    const sync = new MarketSync({ store, client: fakeClient([]), classifier });

    const result = await sync.refreshActiveFields();

    expect(isOk(result)).toBe(false);
    const shelves = await store.listShelves();
    expect(isOk(shelves) && shelves.value[0]?.fields[0]?.skills.map((s) => s.id)).toEqual(['a/keep']);
  });

  it('queues pool ids with no hash and skips ids that already have one', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    await store.upsertListing(listingItem('a/new', 20), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listingItem('a/known', 10), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/known', { description: 'known', hash: 'hash-1' });
    const sync = syncOf(store, fakeClient([]));

    const result = await sync.refreshActiveFields();

    expect(isOk(result) && result.value.queued).toEqual(['a/new']);
  });
});

describe('MarketSync.sync({ maxDetail })', () => {
  async function seedPool(store: InMemoryMarketStore, count: number) {
    await store.upsertField({
      slug: 'frontend',
      roleSlug: 'swe',
      label: 'Frontend',
      q: 'frontend',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });
    for (let i = 0; i < count; i += 1) {
      await store.upsertListing(listingItem(`a/skill-${i}`, count - i), '2026-01-01T00:00:00.000Z');
    }
  }

  it('does not crawl the listing', async () => {
    const store = new InMemoryMarketStore();
    await seedPool(store, 1);
    const client = fakeClient([{ items: [listingItem('a/listed')] }]);
    const sync = syncOf(store, client);

    await sync.sync({ maxDetail: 40 });

    expect(client.listPage).not.toHaveBeenCalled();
  });

  it('hydrates at most maxDetail of the no-hash pool', async () => {
    const store = new InMemoryMarketStore();
    await seedPool(store, 50);
    const client = fakeClient([]);
    client.getSkill = vi.fn(async (id: string) => ok({ description: 'd', hash: `hash-${id}` }));
    const sync = syncOf(store, client);

    const result = await sync.sync({ maxDetail: 40 });

    expect(isOk(result)).toBe(true);
    expect(client.getSkill).toHaveBeenCalledTimes(40);
    if (isOk(result)) {
      expect(result.value.listingQueued).toEqual([]);
      expect(result.value.shelfQueued).toHaveLength(50);
      expect(result.value.hydrated).toHaveLength(40);
      expect(result.value.refreshed).toEqual(['frontend']);
    }
  });
});
