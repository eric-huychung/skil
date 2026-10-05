import { describe, expect, it, vi } from 'vitest';
import { err, isOk, ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { MarketListingPage, MarketSkillsClient } from './market-client.js';
import { buildLabelState, stateHash } from './label-state.js';
import { MarketSync, type LabelPoolError } from './market-sync.js';
import type { LabelPoolRow } from './market-types.js';
import { FakeSkillClassifier, type SkillClassifier } from './skill-classifier.js';
import { failureKindOf } from './sync-summary.js';
import { TAXONOMY_VERSION, TOPIC_QUESTIONS, TOPIC_THRESHOLD } from './topic-taxonomy.js';

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

function syncOf(
  store: InMemoryMarketStore,
  client: MarketSkillsClient,
  extra: { now?: () => string } = {},
) {
  return new MarketSync({
    store,
    client,
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

  it('continues past the 20-page boundary instead of applying an implicit page cap', async () => {
    const store = new InMemoryMarketStore();
    const pages = Array.from({ length: 21 }, (_, index) => ({
      items: [listingItem(`a/page-${index}`)],
      ...(index < 20 ? { nextCursor: `page-${index + 1}` } : {}),
    }));
    const client = fakeClient(pages);
    const sync = syncOf(store, client);

    const result = await sync.crawlListing();

    expect(isOk(result)).toBe(true);
    expect(client.listPage).toHaveBeenCalledTimes(21);
    expect(client.listPage).toHaveBeenLastCalledWith('page-20');
    expect(isOk(result) && result.value.queued).toContain('a/page-20');
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
    await store.setDetail('a/same', { description: 'Old description', hash: 'hash-1', labelExcerpt: 'Body.' });
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'New description', hash: 'hash-1', labelExcerpt: 'Body.' }));
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

describe('MarketSync.hydrateDetails excerpt (T15b)', () => {
  it('hydrates a hash-equal row that has no excerpt yet, and writes the excerpt', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/backfill'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/backfill', { description: 'Old', hash: 'hash-1' });
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'Old', hash: 'hash-1', labelExcerpt: 'Body text.' }));
    const sync = syncOf(store, client);

    const result = await sync.hydrateDetails(['a/backfill']);

    expect(isOk(result) && result.value.hydrated).toEqual(['a/backfill']);
    expect(await store.getDetailState('a/backfill')).toEqual({ ok: true, value: { hash: 'hash-1', hasExcerpt: true } });
    const pool = await store.listLabelPool();
    expect(isOk(pool) && pool.value[0]?.labelExcerpt).toBe('Body text.');
  });

  it('reports unchanged and skips the write when hash matches and neither side has an excerpt', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/no-excerpt'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/no-excerpt', { description: 'Same', hash: 'hash-1' });
    const setDetail = vi.spyOn(store, 'setDetail');
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'Same', hash: 'hash-1' }));
    const sync = syncOf(store, client);

    const result = await sync.hydrateDetails(['a/no-excerpt']);

    expect(isOk(result) && result.value.hydrated).toEqual([]);
    expect(isOk(result) && result.value.unchanged).toEqual(['a/no-excerpt']);
    expect(setDetail).not.toHaveBeenCalled();
  });

  it('is a no-op only when the hash matches and an excerpt is stored', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/done'), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/done', { description: 'Old', hash: 'hash-1', labelExcerpt: 'Old body.' });
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: 'New', hash: 'hash-1', labelExcerpt: 'New body.' }));
    const sync = syncOf(store, client);

    const result = await sync.hydrateDetails(['a/done']);

    expect(isOk(result) && result.value.unchanged).toEqual(['a/done']);
    const pool = await store.listLabelPool();
    expect(isOk(pool) && pool.value[0]?.labelExcerpt).toBe('Old body.');
  });

  it('caps a stored excerpt at 1,000 chars', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listingItem('a/long'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient([]);
    client.getSkill = vi.fn(async () => ok({ description: null, hash: 'hash-1', labelExcerpt: 'x'.repeat(1_500) }));
    const sync = syncOf(store, client);

    await sync.hydrateDetails(['a/long']);

    const pool = await store.listLabelPool();
    expect(isOk(pool) && pool.value[0]?.labelExcerpt?.length).toBe(1_000);
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
    await store.replaceShelves([{ fieldSlug: 'frontend', entries: ids.map((id) => ({ id, moreCount: 0 })) }], 'v1');
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

describe('MarketSync.labelPool', () => {
  const hashOf = (row: LabelPoolRow) => stateHash(buildLabelState(row));

  async function seedPool(store: InMemoryMarketStore, count: number): Promise<string[]> {
    const ids = Array.from({ length: count }, (_, i) => `acme/repo/s${String(i).padStart(3, '0')}`);
    for (const id of ids) {
      await store.upsertListing(listingItem(id), '2026-01-01T00:00:00.000Z');
    }
    return ids;
  }

  function fake(script: { failIds?: string[]; error?: Error } = {}) {
    return new FakeSkillClassifier({ ...script, stateHash: hashOf });
  }

  /** Delegates to `inner` but fails the `failOnCall`-th classify call (1-based). */
  function failingOnCall(inner: FakeSkillClassifier, failOnCall: number): SkillClassifier & { calls: number } {
    return {
      calls: 0,
      async classify(rows, questions) {
        this.calls += 1;
        if (this.calls === failOnCall) return err(new Error('jev down'));
        return inner.classify(rows, questions);
      },
    };
  }

  function syncFor(store: InMemoryMarketStore) {
    return syncOf(store, fakeClient([]));
  }

  it('labels every unlabeled row in batches and saves them under TAXONOMY_VERSION', async () => {
    const store = new InMemoryMarketStore();
    const ids = await seedPool(store, 5);
    const classifier = fake();

    const result = await syncFor(store).labelPool(classifier, { batchSize: 2 });

    expect(isOk(result) && result.value).toMatchObject({
      needed: 5,
      labeled: 5,
      errored: 0,
      skippedUnchanged: 0,
      batches: 3,
    });
    expect(classifier.calls.map((call) => call.rows.length)).toEqual([2, 2, 1]);
    expect(classifier.calls[0]?.questions).toEqual(TOPIC_QUESTIONS);
    const keys = await store.listLabelKeys(TAXONOMY_VERSION);
    expect(isOk(keys) && [...keys.value.keys()].sort()).toEqual(ids);
  });

  it('makes zero classifier calls on a second run with no changes', async () => {
    const store = new InMemoryMarketStore();
    await seedPool(store, 3);
    await syncFor(store).labelPool(fake());

    const second = fake();
    const result = await syncFor(store).labelPool(second);

    expect(second.calls).toHaveLength(0);
    expect(isOk(result) && result.value).toMatchObject({ needed: 0, labeled: 0, skippedUnchanged: 3, batches: 0 });
  });

  it('relabels only rows whose label state changed', async () => {
    const store = new InMemoryMarketStore();
    await seedPool(store, 3);
    await syncFor(store).labelPool(fake());
    await store.setDetail('acme/repo/s001', { description: 'now does more', hash: 'h2' });

    const second = fake();
    const result = await syncFor(store).labelPool(second);

    expect(second.calls.flatMap((call) => call.rows.map((row) => row.id))).toEqual(['acme/repo/s001']);
    expect(isOk(result) && result.value.diff).toEqual({ added: [], changed: ['acme/repo/s001'], retried: [] });
  });

  it('keeps batches 1-2 when batch 3 fails, and the next run resumes from batch 3', async () => {
    const store = new InMemoryMarketStore();
    const ids = await seedPool(store, 6);
    const failing = failingOnCall(fake(), 3);

    const first = await syncFor(store).labelPool(failing, { batchSize: 2 });

    expect(isOk(first)).toBe(false);
    if (!isOk(first)) expect(first.error.message).toBe('jev down');
    const kept = await store.listLabelKeys(TAXONOMY_VERSION);
    expect(isOk(kept) && [...kept.value.keys()].sort()).toEqual(ids.slice(0, 4));

    const resume = fake();
    const second = await syncFor(store).labelPool(resume, { batchSize: 2 });

    expect(resume.calls.flatMap((call) => call.rows.map((row) => row.id))).toEqual(ids.slice(4));
    expect(isOk(second) && second.value).toMatchObject({ needed: 2, labeled: 2, skippedUnchanged: 4 });
  });

  it("retries status 'error' rows on the next run", async () => {
    const store = new InMemoryMarketStore();
    const ids = await seedPool(store, 100);
    const first = await syncFor(store).labelPool(fake({ failIds: [ids[7]!] }));
    expect(isOk(first) && first.value).toMatchObject({ needed: 100, labeled: 99, errored: 1 });

    const retry = fake();
    const second = await syncFor(store).labelPool(retry);

    expect(retry.calls.flatMap((call) => call.rows.map((row) => row.id))).toEqual([ids[7]]);
    expect(isOk(second) && second.value.diff).toEqual({ added: [], changed: [], retried: [ids[7]] });
    const keys = await store.listLabelKeys(TAXONOMY_VERSION);
    expect(isOk(keys) && keys.value.get(ids[7]!)?.status).toBe('ok');
  });

  it("returns Err kind 'bad_answers' when more than 2% of rows errored, keeping saved batches", async () => {
    const store = new InMemoryMarketStore();
    const ids = await seedPool(store, 100);

    const result = await syncFor(store).labelPool(fake({ failIds: ids.slice(0, 3) }), { batchSize: 50 });

    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(failureKindOf(result.error, 'store')).toBe('bad_answers');
      expect((result.error as LabelPoolError).result).toMatchObject({ needed: 100, errored: 3, labeled: 47 });
    }
    const keys = await store.listLabelKeys(TAXONOMY_VERSION);
    expect(isOk(keys) && keys.value.size).toBe(50);
  });

  it('passes a whole-call classifier error through unchanged', async () => {
    const store = new InMemoryMarketStore();
    await seedPool(store, 2);
    const cause = Object.assign(new Error('401'), { kind: 'auth' });

    const result = await syncFor(store).labelPool(fake({ error: cause }));

    expect(!isOk(result) && result.error).toBe(cause);
  });

  it('dryRun classifies but saves nothing, and returns the diff', async () => {
    const store = new InMemoryMarketStore();
    const ids = await seedPool(store, 3);
    const pool = await store.listLabelPool();
    const errorRow = isOk(pool) ? pool.value[2]! : undefined;
    await store.saveLabels(TAXONOMY_VERSION, [
      { id: ids[1]!, status: 'ok', probabilities: {}, stateHash: 'stale', modelVersion: 'fake' },
      { id: ids[2]!, status: 'error', probabilities: {}, stateHash: hashOf(errorRow!), modelVersion: 'fake' },
    ]);
    const before = await store.listLabels(TAXONOMY_VERSION);

    const result = await syncFor(store).labelPool(fake(), { dryRun: true });

    expect(isOk(result) && result.value).toMatchObject({
      needed: 3,
      labeled: 3,
      diff: { added: [ids[0]], changed: [ids[1]], retried: [ids[2]] },
    });
    expect(await store.listLabels(TAXONOMY_VERSION)).toEqual(before);
  });
});

describe('MarketSync.rebuildShelves', () => {
  const at = '2026-01-01T00:00:00.000Z';

  async function seedFields(store: InMemoryMarketStore, slugs: string[]) {
    await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
    for (const slug of slugs) {
      await store.upsertField({ slug, roleSlug: 'swe', label: slug, q: slug, sortOrder: 1, shelfSize: 30, active: true });
    }
  }

  /** `owner/repo/skill` ids, with `source` = `owner/repo` like the real index. */
  async function seedSkill(store: InMemoryMarketStore, id: string, installs: number) {
    const cut = id.lastIndexOf('/');
    await store.upsertListing(
      { ...listingItem(id, installs), name: id.slice(cut + 1), slug: id.slice(cut + 1), source: id.slice(0, cut) },
      at,
    );
  }

  /** Saves a current-version label for each pool row named in `probabilities` (`null` = errored). */
  async function label(store: InMemoryMarketStore, probabilities: Record<string, Record<string, number> | null>) {
    const pool = await store.listLabelPool();
    const rows = isOk(pool) ? pool.value : [];
    const scores = rows
      .filter((row) => row.id in probabilities)
      .map((row) => {
        const p = probabilities[row.id];
        return {
          id: row.id,
          status: p ? ('ok' as const) : ('error' as const),
          probabilities: p ?? {},
          stateHash: stateHash(buildLabelState(row)),
          modelVersion: 'fake',
        };
      });
    await store.saveLabels(TAXONOMY_VERSION, scores);
  }

  async function shelfIds(store: InMemoryMarketStore, slug: string): Promise<string[] | undefined> {
    const shelves = await store.listShelves();
    return isOk(shelves)
      ? shelves.value.flatMap((role) => role.fields).find((f) => f.slug === slug)?.skills.map((s) => s.id)
      : undefined;
  }

  async function seedOldShelves(store: InMemoryMarketStore) {
    await store.replaceShelves([{ fieldSlug: 'frontend', entries: [{ id: 'old/r/kept', moreCount: 0 }] }], 'old-version');
  }

  it('returns incomplete_coverage and leaves shelves untouched when an active row has no label', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend', 'integrations']);
    await seedSkill(store, 'old/r/kept', 1);
    await seedSkill(store, 'a/r/one', 10);
    await seedSkill(store, 'b/r/two', 20);
    await seedOldShelves(store);
    await label(store, { 'old/r/kept': { frontend: 0.9 }, 'a/r/one': { frontend: 0.9 } });
    const replaceShelves = vi.spyOn(store, 'replaceShelves');

    const result = await syncOf(store, fakeClient([])).rebuildShelves({});

    expect(isOk(result) && result.value).toMatchObject({
      written: false,
      reason: 'incomplete_coverage',
      pool: 3,
      missing: 1,
    });
    expect(replaceShelves).not.toHaveBeenCalled();
    expect(await shelfIds(store, 'frontend')).toEqual(['old/r/kept']);
    const meta = await store.getShelfMeta();
    expect(isOk(meta) && meta.value?.taxonomyVersion).toBe('old-version');
  });

  it('counts a label whose state hash no longer matches the row as missing coverage', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend']);
    await seedSkill(store, 'a/r/one', 10);
    await label(store, { 'a/r/one': { frontend: 0.9 } });
    await store.setDetail('a/r/one', { description: 'changed since labeling', hash: 'h2' });

    const result = await syncOf(store, fakeClient([])).rebuildShelves({});

    expect(isOk(result) && result.value).toMatchObject({ written: false, reason: 'incomplete_coverage', missing: 1 });
  });

  it('writes every shelf in one replaceShelves call stamped with TAXONOMY_VERSION', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend', 'testing', 'integrations']);
    await seedSkill(store, 'a/r/popular-unsure', 1_000);
    await seedSkill(store, 'b/r/quiet-sure', 10);
    await seedSkill(store, 'c/r/tester', 50);
    await label(store, {
      'a/r/popular-unsure': { frontend: 0.7, testing: 0.1, integrations: 0.2 },
      'b/r/quiet-sure': { frontend: 0.85, testing: 0.1, integrations: 0.1 },
      'c/r/tester': { frontend: 0.1, testing: 0.9, integrations: 0.1 },
    });
    const replaceShelves = vi.spyOn(store, 'replaceShelves');

    const result = await syncOf(store, fakeClient([])).rebuildShelves({});

    expect(isOk(result) && result.value.written).toBe(true);
    expect(replaceShelves).toHaveBeenCalledTimes(1);
    expect(replaceShelves.mock.calls[0]?.[1]).toBe(TAXONOMY_VERSION);
    expect(await shelfIds(store, 'frontend')).toEqual(['b/r/quiet-sure', 'a/r/popular-unsure']);
    expect(await shelfIds(store, 'testing')).toEqual(['c/r/tester']);
    const meta = await store.getShelfMeta();
    expect(isOk(meta) && meta.value?.taxonomyVersion).toBe(TAXONOMY_VERSION);
  });

  it('rebuilds with errored and below-threshold rows unlabeled, never on integrations, and reports shelf health', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend', 'integrations']);
    await seedSkill(store, 'old/r/kept', 1);
    await seedOldShelves(store);
    for (const id of ['a/r/one', 'a/r/two', 'b/r/three', 'c/r/unsure', 'd/r/errored', 'e/r/blank']) {
      await seedSkill(store, id, 10);
    }
    await label(store, {
      'old/r/kept': { frontend: 0.1, integrations: 0.1 },
      'a/r/one': { frontend: 0.9, integrations: 0.1 },
      'a/r/two': { frontend: 0.7, integrations: TOPIC_THRESHOLD - 0.1 },
      'b/r/three': { frontend: 0.55, integrations: 0.1 },
      'c/r/unsure': { frontend: TOPIC_THRESHOLD - 0.05, integrations: TOPIC_THRESHOLD - 0.01 },
      'd/r/errored': null,
      'e/r/blank': { frontend: 0, integrations: 0 },
    });

    const result = await syncOf(store, fakeClient([])).rebuildShelves({});

    expect(isOk(result) && result.value).toEqual({
      written: true,
      pool: 7,
      missing: 0,
      errored: 1,
      unlabeled: 4,
      unlabeledShare: 4 / 7,
      reviewBand: 1,
      fields: [
        { slug: 'frontend', count: 3, distinctOwners: 2, topOwnerShare: 2 / 3 },
        { slug: 'integrations', count: 0, distinctOwners: 0, topOwnerShare: 0 },
      ],
    });
    expect(await shelfIds(store, 'integrations')).toEqual([]);
    expect(await shelfIds(store, 'frontend')).toEqual(['a/r/one', 'a/r/two', 'b/r/three']);
  });

  it('dryRun builds and reports but writes nothing', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend']);
    await seedSkill(store, 'old/r/kept', 1);
    await seedSkill(store, 'a/r/one', 10);
    await seedOldShelves(store);
    await label(store, { 'old/r/kept': { frontend: 0.1 }, 'a/r/one': { frontend: 0.9 } });
    const replaceShelves = vi.spyOn(store, 'replaceShelves');

    const result = await syncOf(store, fakeClient([])).rebuildShelves({ dryRun: true });

    expect(isOk(result) && result.value).toMatchObject({
      written: false,
      fields: [{ slug: 'frontend', count: 1, distinctOwners: 1, topOwnerShare: 1 }],
    });
    expect(isOk(result) && result.value.reason).toBeUndefined();
    expect(replaceShelves).not.toHaveBeenCalled();
    expect(await shelfIds(store, 'frontend')).toEqual(['old/r/kept']);
  });

  it('returns the store error and keeps the old shelves when replaceShelves fails', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend']);
    await seedSkill(store, 'old/r/kept', 1);
    await seedOldShelves(store);
    await label(store, { 'old/r/kept': { frontend: 0.9 } });
    vi.spyOn(store, 'replaceShelves').mockResolvedValueOnce(err(new Error('rpc failed')));

    const result = await syncOf(store, fakeClient([])).rebuildShelves({});

    expect(!isOk(result) && result.error.message).toBe('rpc failed');
    expect(await shelfIds(store, 'frontend')).toEqual(['old/r/kept']);
  });

  it('fails closed on an empty pool instead of wiping every shelf', async () => {
    const store = new InMemoryMarketStore();
    await seedFields(store, ['frontend']);
    const replaceShelves = vi.spyOn(store, 'replaceShelves');

    const result = await syncOf(store, fakeClient([])).rebuildShelves({});

    expect(isOk(result)).toBe(false);
    expect(replaceShelves).not.toHaveBeenCalled();
  });
});
