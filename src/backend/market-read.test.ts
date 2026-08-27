import { describe, expect, it } from 'vitest';
import { ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { MarketSkillsClient } from './market-client.js';
import { handleMarketPreviewRequest, handleMarketSearchRequest, handleShelvesRequest } from './market-read.js';

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

describe('handleShelvesRequest', () => {
  it('returns shelves grouped by role with only id/name/installs/rank per skill', async () => {
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
    await store.upsertListing(listing('a/one', { name: 'One', installs: 5 }), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/one', { description: 'Should never appear on a shelf row', hash: 'hash-1' });
    await store.setFieldShelf('frontend', ['a/one']);

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: [
        {
          slug: 'swe',
          label: 'SWE',
          fields: [
            {
              slug: 'frontend',
              label: 'Frontend',
              skills: [{ id: 'a/one', name: 'One', installs: 5, rank: 1 }],
            },
          ],
        },
      ],
    });
  });

  it('returns { data: [] } when the index has no active roles yet', async () => {
    const store = new InMemoryMarketStore();

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: [] });
  });

  it('sets a CDN Cache-Control header on success', async () => {
    const store = new InMemoryMarketStore();

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });

    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=1800');
  });

  it('picks up a role/field inserted straight into the store with no handler change', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertRole({ slug: 'legal', label: 'Legal', sortOrder: 5, active: true });
    await store.upsertField({
      slug: 'contracts',
      roleSlug: 'legal',
      label: 'Contracts',
      q: 'contract review',
      sortOrder: 1,
      shelfSize: 30,
      active: true,
    });

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { data: Array<{ slug: string }> };

    expect(body.data.map((role) => role.slug)).toEqual(['legal']);
  });

  it('returns a 500 with the store error message when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.listShelves = async () => ({ ok: false, error: new Error('connection lost') });

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'store_error', message: 'connection lost' });
  });
});

describe('handleMarketSearchRequest', () => {
  it('returns 400 when q is missing', async () => {
    const store = new InMemoryMarketStore();

    const response = await handleMarketSearchRequest(new Request('http://localhost/api/market/search'), { store });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_request');
  });

  it('returns id/name/installs rows matching name or description, ranked by installs', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/one', { name: 'SQL helper', installs: 5 }), '2026-01-01T00:00:00.000Z');
    await store.upsertListing(listing('a/two', { name: 'Other', installs: 50 }), '2026-01-01T00:00:00.000Z');
    await store.setDetail('a/two', { description: 'A sql query optimizer', hash: 'hash-2' });
    await store.upsertListing(listing('a/three', { name: 'Unrelated', installs: 999 }), '2026-01-01T00:00:00.000Z');

    const response = await handleMarketSearchRequest(new Request('http://localhost/api/market/search?q=sql'), {
      store,
    });
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: [
        { id: 'a/two', name: 'Other', installs: 50 },
        { id: 'a/one', name: 'SQL helper', installs: 5 },
      ],
    });
  });

  it('defaults to 25 and clamps a larger limit to 50', async () => {
    const store = new InMemoryMarketStore();
    const capturedLimits: number[] = [];
    store.searchListings = async (_q, opts) => {
      capturedLimits.push(opts.limit);
      return { ok: true, value: [] };
    };

    await handleMarketSearchRequest(new Request('http://localhost/api/market/search?q=sql'), { store });
    await handleMarketSearchRequest(new Request('http://localhost/api/market/search?q=sql&limit=500'), { store });

    expect(capturedLimits).toEqual([25, 50]);
  });

  it('excludes inactive listings', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/one', { name: 'SQL helper' }), '2026-01-01T00:00:00.000Z');
    await store.markInactiveBefore('2026-01-02T00:00:00.000Z');

    const response = await handleMarketSearchRequest(new Request('http://localhost/api/market/search?q=sql'), {
      store,
    });
    const body = (await response.json()) as { data: unknown[] };

    expect(body.data).toEqual([]);
  });

  it('returns a 500 with the store error message when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.searchListings = async () => ({ ok: false, error: new Error('connection lost') });

    const response = await handleMarketSearchRequest(new Request('http://localhost/api/market/search?q=sql'), {
      store,
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'store_error', message: 'connection lost' });
  });
});

function fakeClient(overrides: Partial<MarketSkillsClient> = {}): MarketSkillsClient {
  return {
    listPage: async () => ok({ items: [] }),
    getSkill: async () => ok({ description: null, hash: 'unused' }),
    getAudit: async () => ok({ status: 'none' }),
    getSkillMd: async () => ok(null),
    searchSkills: async () => ok([]),
    ...overrides,
  };
}

describe('handleMarketPreviewRequest', () => {
  it('returns 400 when id is missing', async () => {
    const store = new InMemoryMarketStore();

    const response = await handleMarketPreviewRequest(new Request('http://localhost/api/market/preview'), {
      store,
      client: fakeClient(),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe('invalid_request');
  });

  it('returns 404 for an unknown id', async () => {
    const store = new InMemoryMarketStore();

    const response = await handleMarketPreviewRequest(
      new Request('http://localhost/api/market/preview?id=a/missing'),
      { store, client: fakeClient() },
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe('not_found');
  });

  it('combines stored listing fields with a live SKILL.md and audit status', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('acme/repo/tool', { name: 'Tool', installs: 42 }), '2026-01-01T00:00:00.000Z');
    const client = fakeClient({
      getSkillMd: async () => ok('---\ndescription: hi\n---\nBody'),
      getAudit: async () => ok({ status: 'warn' }),
    });

    const response = await handleMarketPreviewRequest(
      new Request('http://localhost/api/market/preview?id=acme/repo/tool'),
      { store, client },
    );
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        id: 'acme/repo/tool',
        name: 'Tool',
        installs: 42,
        url: 'https://github.com/example/acme/repo/tool',
        installUrl: 'https://skills.sh/acme/repo/tool',
        installCommand: 'npx skills add acme/repo@tool',
        skillMd: '---\ndescription: hi\n---\nBody',
        audit: { status: 'warn' },
      },
    });
  });

  it('maps a 404 audit to status none', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/one'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient({ getAudit: async () => ok({ status: 'none' }) });

    const response = await handleMarketPreviewRequest(new Request('http://localhost/api/market/preview?id=a/one'), {
      store,
      client,
    });
    const body = (await response.json()) as { data: { audit: { status: string } } };

    expect(body.data.audit).toEqual({ status: 'none' });
  });

  it('degrades to null skillMd and none audit when the live fetches fail', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/one'), '2026-01-01T00:00:00.000Z');
    const client = fakeClient({
      getSkillMd: async () => ({ ok: false, error: new Error('upstream down') }),
      getAudit: async () => ({ ok: false, error: new Error('upstream down') }),
    });

    const response = await handleMarketPreviewRequest(new Request('http://localhost/api/market/preview?id=a/one'), {
      store,
      client,
    });
    const body = (await response.json()) as { data: { skillMd: unknown; audit: { status: string } } };

    expect(response.status).toBe(200);
    expect(body.data.skillMd).toBeNull();
    expect(body.data.audit).toEqual({ status: 'none' });
  });

  it('sets a short CDN Cache-Control header on success', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(listing('a/one'), '2026-01-01T00:00:00.000Z');

    const response = await handleMarketPreviewRequest(new Request('http://localhost/api/market/preview?id=a/one'), {
      store,
      client: fakeClient(),
    });

    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=60');
  });

  it('returns a 500 with the store error message when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.getListing = async () => ({ ok: false, error: new Error('connection lost') });

    const response = await handleMarketPreviewRequest(new Request('http://localhost/api/market/preview?id=a/one'), {
      store,
      client: fakeClient(),
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'store_error', message: 'connection lost' });
  });
});
