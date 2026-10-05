import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { MarketSkillsClient } from './market-client.js';
import { loadMarketCreators } from './market-creators.js';
import {
  handleCreatorsRequest,
  handleMarketPreviewRequest,
  handleMarketSearchRequest,
  handleShelvesRequest,
  handleSuggestedRequest,
} from './market-read.js';
import { TAXONOMY_VERSION } from './topic-taxonomy.js';

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
    await store.replaceShelves([{ fieldSlug: 'frontend', entries: [{ id: 'a/one', moreCount: 0 }] }], 'v1');

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      meta: { generatedAt: expect.any(String) },
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
    expect(body).toEqual({ data: [], meta: { generatedAt: null } });
  });

  it('adds meta.generatedAt from the last shelf build', async () => {
    const store = new InMemoryMarketStore();
    store.getShelfMeta = async () => ok({ generatedAt: '2026-10-01T06:00:00.000Z', taxonomyVersion: 'v1' });

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { meta: unknown };

    expect(body.meta).toEqual({ generatedAt: '2026-10-01T06:00:00.000Z' });
  });

  it('passes moreCount through on a collapsed lead row', async () => {
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
    await store.upsertListing(listing('a/lead', { name: 'Lead', installs: 9 }), '2026-01-01T00:00:00.000Z');
    await store.replaceShelves([{ fieldSlug: 'frontend', entries: [{ id: 'a/lead', moreCount: 3 }] }], 'v1');

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { data: Array<{ fields: Array<{ skills: unknown[] }> }> };

    expect(body.data[0]?.fields[0]?.skills).toEqual([{ id: 'a/lead', name: 'Lead', installs: 9, rank: 1, moreCount: 3 }]);
  });

  it('returns a 500 without the store error text when the shelf meta read fails', async () => {
    const store = new InMemoryMarketStore();
    store.getShelfMeta = async () => ({ ok: false, error: new Error('connection lost at db.internal:5432') });

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
    expect(body.message).not.toContain('db.internal');
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

  it('returns a 500 without the store error text when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.listShelves = async () => ({ ok: false, error: new Error('connection lost at db.internal:5432') });

    const response = await handleShelvesRequest(new Request('http://localhost/api/market/shelves'), { store });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
    expect(body.message).toBe('Market index is temporarily unavailable.');
    expect(body.message).not.toContain('connection lost');
    expect(body.message).not.toContain('db.internal');
  });
});

describe('handleSuggestedRequest', () => {
  it('hydrates yaml picks from the store and does not need an LLM client', async () => {
    const store = new InMemoryMarketStore();
    await store.upsertListing(
      listing('mattpocock/skills/tdd', { name: 'tdd', installs: 42 }),
      '2026-01-01T00:00:00.000Z',
    );

    const response = await handleSuggestedRequest(new Request('http://localhost/api/market/suggested?role=swe'), {
      store,
    });
    const body = (await response.json()) as {
      data: { roles: Array<{ slug: string; skills: Array<{ id: string; installs: number }> }> };
    };

    expect(response.status).toBe(200);
    expect(body.data.roles).toHaveLength(1);
    expect(body.data.roles[0]?.slug).toBe('swe');
    expect(body.data.roles[0]?.skills.some((skill) => skill.id === 'mattpocock/skills/tdd' && skill.installs === 42)).toBe(
      true,
    );
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=1800');
  });

  it('returns a 500 without the store error text when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.getListing = async () => ({ ok: false, error: new Error('connection lost at db.internal:5432') });

    const response = await handleSuggestedRequest(new Request('http://localhost/api/market/suggested?role=swe'), {
      store,
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
    expect(body.message).toBe('Market index is temporarily unavailable.');
    expect(body.message).not.toContain('connection lost');
    expect(body.message).not.toContain('db.internal');
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

  it('returns a 500 without the store error text when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.searchListings = async () => ({ ok: false, error: new Error('connection lost at db.internal:5432') });

    const response = await handleMarketSearchRequest(new Request('http://localhost/api/market/search?q=sql'), {
      store,
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
    expect(body.message).toBe('Market index is temporarily unavailable.');
    expect(body.message).not.toContain('connection lost');
    expect(body.message).not.toContain('db.internal');
  });
});

function fakeClient(overrides: Partial<MarketSkillsClient> = {}): MarketSkillsClient {
  return {
    listPage: async () => ok({ items: [] }),
    getSkill: async () => ok({ description: null, hash: 'unused' }),
    getAudit: async () => ok({ status: 'none' }),
    getSkillMd: async () => ok(null),
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

  it('returns a 500 without the store error text when the store fails', async () => {
    const store = new InMemoryMarketStore();
    store.getListing = async () => ({ ok: false, error: new Error('connection lost at db.internal:5432') });

    const response = await handleMarketPreviewRequest(new Request('http://localhost/api/market/preview?id=a/one'), {
      store,
      client: fakeClient(),
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
    expect(body.message).toBe('Market index is temporarily unavailable.');
    expect(body.message).not.toContain('connection lost');
    expect(body.message).not.toContain('db.internal');
  });
});

/** 30-entry creators YAML: an alias group first (pinned), one official owner, then fillers. */
function writeCreatorsYaml(contents?: string): string {
  const fillers = Array.from({ length: 27 }, (_, i) => `  - { slug: filler-${i}, label: Filler ${i}, owners: [filler-${i}] }`);
  const yaml =
    contents ??
    [
      'updatedAt: 2026-10-04',
      'techCutoff: 0.4',
      'officialFetchedAt: 2026-10-04',
      'officialOwners: [vercel-labs]',
      'blocked: []',
      'creators:',
      '  - { slug: matt, label: Matt Pocock, owners: [mattpocock, mattpocock-labs], pinned: true }',
      '  - { slug: vercel-labs, label: Vercel Labs, owners: [vercel-labs] }',
      '  - { slug: quiet, label: Quiet Person, owners: [quiet] }',
      ...fillers,
    ].join('\n');
  const path = join(mkdtempSync(join(tmpdir(), 'creators-')), 'market-creators.yaml');
  writeFileSync(path, yaml);
  return path;
}

async function upsertSkill(store: InMemoryMarketStore, id: string, source: string, name: string, installs: number) {
  await store.upsertListing(
    { id, name, slug: name, source, installs, installUrl: `https://skills.sh/${id}`, url: `https://github.com/${source}` },
    '2026-01-01T00:00:00.000Z',
  );
}

async function creatorsStore(): Promise<InMemoryMarketStore> {
  const store = new InMemoryMarketStore();
  await upsertSkill(store, 'mattpocock/skills/tdd', 'mattpocock/skills', 'tdd', 100);
  await upsertSkill(store, 'mattpocock/skills/grill', 'mattpocock/skills', 'grill', 10);
  await upsertSkill(store, 'mattpocock-labs/extra/tdd', 'mattpocock-labs/extra', 'tdd', 50);
  await upsertSkill(store, 'vercel-labs/agent-skills/react', 'vercel-labs/agent-skills', 'react', 7);
  return store;
}

describe('handleCreatorsRequest', () => {
  it('lists every creator in YAML order, summing stats across an alias group', async () => {
    const store = await creatorsStore();
    const creatorsPath = writeCreatorsYaml();

    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators'), {
      store,
      creatorsPath,
    });
    const body = (await response.json()) as { data: Array<Record<string, unknown>>; meta: unknown };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=1800');
    expect(body.meta).toEqual({ updatedAt: '2026-10-04', installsSource: 'skills.sh' });
    expect(body.data).toHaveLength(30);
    expect(body.data.slice(0, 3)).toEqual([
      { slug: 'matt', label: 'Matt Pocock', official: false, pinned: true, skillCount: 3, totalInstalls: 160 },
      { slug: 'vercel-labs', label: 'Vercel Labs', official: true, pinned: false, skillCount: 1, totalInstalls: 7 },
      { slug: 'quiet', label: 'Quiet Person', official: false, pinned: false, skillCount: 0, totalInstalls: 0 },
    ]);
    expect(body.data[3]?.slug).toBe('filler-0');
  });

  it('reads data/market-creators.yaml by default', async () => {
    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators'), {
      store: new InMemoryMarketStore(),
    });
    const body = (await response.json()) as { data: Array<{ slug: string }> };

    expect(response.status).toBe(200);
    expect(body.data.map((card) => card.slug)).toEqual(loadMarketCreators().creators.map((creator) => creator.slug));
  });

  it('returns one creator with skills grouped by repo, not deduped by name, topics [] before labels', async () => {
    const store = await creatorsStore();

    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators?slug=matt'), {
      store,
      creatorsPath: writeCreatorsYaml(),
    });
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=1800');
    expect(body.data).toEqual({
      slug: 'matt',
      label: 'Matt Pocock',
      official: false,
      repos: [
        {
          source: 'mattpocock/skills',
          skills: [
            { id: 'mattpocock/skills/tdd', name: 'tdd', installs: 100, topics: [] },
            { id: 'mattpocock/skills/grill', name: 'grill', installs: 10, topics: [] },
          ],
        },
        {
          source: 'mattpocock-labs/extra',
          skills: [{ id: 'mattpocock-labs/extra/tdd', name: 'tdd', installs: 50, topics: [] }],
        },
      ],
    });
  });

  it('returns topics for rows labelled at the current taxonomy version and [] for the rest', async () => {
    const store = await creatorsStore();
    const label = (id: string, probabilities: Record<string, number>, status: 'ok' | 'error' = 'ok') => ({
      id,
      status,
      probabilities,
      stateHash: `hash-${id}`,
      modelVersion: 'jev@1',
    });
    await store.saveLabels(TAXONOMY_VERSION, [
      label('mattpocock/skills/tdd', { testing: 0.95, frontend: 0.2, docs: 0.7 }),
      label('mattpocock/skills/grill', {}, 'error'),
    ]);
    await store.saveLabels('old-version', [label('mattpocock-labs/extra/tdd', { testing: 0.99 })]);

    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators?slug=matt'), {
      store,
      creatorsPath: writeCreatorsYaml(),
    });
    const body = (await response.json()) as {
      data: { repos: Array<{ skills: Array<{ id: string; topics: string[] }> }> };
    };

    expect(response.status).toBe(200);
    const topics = Object.fromEntries(
      body.data.repos.flatMap((repo) => repo.skills).map((skill) => [skill.id, skill.topics]),
    );
    expect(topics).toEqual({
      'mattpocock/skills/tdd': ['testing', 'docs'],
      'mattpocock/skills/grill': [],
      'mattpocock-labs/extra/tdd': [],
    });
  });

  it('returns a creator with no indexed skills as empty repos', async () => {
    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators?slug=quiet'), {
      store: await creatorsStore(),
      creatorsPath: writeCreatorsYaml(),
    });
    const body = (await response.json()) as { data: { repos: unknown[] } };

    expect(response.status).toBe(200);
    expect(body.data.repos).toEqual([]);
  });

  it('returns 404 for an unknown slug', async () => {
    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators?slug=nobody'), {
      store: await creatorsStore(),
      creatorsPath: writeCreatorsYaml(),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toBe('not_found');
  });

  it('returns 500 config_error when the YAML is malformed', async () => {
    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators'), {
      store: await creatorsStore(),
      creatorsPath: writeCreatorsYaml('creators: [oops'),
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('config_error');
    expect(body.message).not.toContain('market-creators');
  });

  it('returns 500 store_error without leaking the store error on the list', async () => {
    const store = await creatorsStore();
    store.listOwnerStats = async () => ({ ok: false, error: new Error('connection lost at db.internal:5432') });

    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators'), {
      store,
      creatorsPath: writeCreatorsYaml(),
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
    expect(body.message).not.toContain('db.internal');
  });

  it('returns 500 store_error on the detail', async () => {
    const store = await creatorsStore();
    store.listSkillsByOwners = async () => ({ ok: false, error: new Error('boom') });

    const response = await handleCreatorsRequest(new Request('http://localhost/api/market/creators?slug=matt'), {
      store,
      creatorsPath: writeCreatorsYaml(),
    });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('store_error');
  });
});
