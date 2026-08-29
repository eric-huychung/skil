import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import { CRON_MAX_DETAIL, handleCronSyncRequest } from './market-cron.js';
import type { MarketListingPage, MarketSkillsClient } from './market-client.js';
import { MarketSync } from './market-sync.js';
import { FakeSkillClassifier } from './skill-classifier.js';

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
    getSkill: vi.fn(async (id: string) => ok({ description: id, hash: `hash-${id}` })),
    getAudit: vi.fn(async () => ok({ status: 'none' as const })),
    getSkillMd: vi.fn(async () => ok(null)),
  };
}

function cronRequest(secret?: string): Request {
  const headers = secret ? { Authorization: `Bearer ${secret}` } : undefined;
  return new Request('http://localhost/api/cron/sync-market', { headers });
}

function cronSync(client: MarketSkillsClient = fakeClient([{ items: [listingItem('a/one')] }])) {
  return {
    client,
    sync: new MarketSync({ store: new InMemoryMarketStore(), client, classifier: new FakeSkillClassifier() }),
  };
}

describe('handleCronSyncRequest', () => {
  it('returns 401 when CRON_SECRET is missing', async () => {
    const { client, sync } = cronSync();

    const response = await handleCronSyncRequest(cronRequest('anything'), { cronSecret: undefined, sync });

    expect(response.status).toBe(401);
    expect(client.getSkill).not.toHaveBeenCalled();
    expect(client.listPage).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization bearer does not match', async () => {
    const { client, sync } = cronSync();

    const response = await handleCronSyncRequest(cronRequest('wrong'), { cronSecret: 'right', sync });

    expect(response.status).toBe(401);
    expect(client.listPage).not.toHaveBeenCalled();
  });

  it('returns 401 when the request has no Authorization header', async () => {
    const { sync } = cronSync();

    const response = await handleCronSyncRequest(cronRequest(), { cronSecret: 'secret', sync });

    expect(response.status).toBe(401);
  });

  it('runs MarketSync.sync with maxDetail 40 when authorized, without a listing crawl', async () => {
    const client = fakeClient([]);
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
    for (let i = 0; i < 45; i += 1) {
      await store.upsertListing(listingItem(`a/${i}`, 45 - i), '2026-01-01T00:00:00.000Z');
    }
    const sync = new MarketSync({ store, client, classifier: new FakeSkillClassifier() });

    const response = await handleCronSyncRequest(cronRequest('secret'), { cronSecret: 'secret', sync });
    const body = (await response.json()) as { hydrated: number; listingQueued: number; shelfQueued: number };

    expect(response.status).toBe(200);
    expect(CRON_MAX_DETAIL).toBe(40);
    expect(client.listPage).not.toHaveBeenCalled();
    expect(client.getSkill).toHaveBeenCalledTimes(40);
    expect(body.hydrated).toBe(40);
    expect(body.listingQueued).toBe(0);
    expect(body.shelfQueued).toBe(45);
  });

  it('returns 500 when authorized but sync is not wired', async () => {
    const response = await handleCronSyncRequest(cronRequest('secret'), {
      cronSecret: 'secret',
      sync: undefined,
    });

    expect(response.status).toBe(500);
  });
});

describe('vercel.json cron schedule', () => {
  it('runs /api/cron/sync-market once a week', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(vercel.crons).toEqual([{ path: '/api/cron/sync-market', schedule: '0 0 * * 0' }]);
  });
});
