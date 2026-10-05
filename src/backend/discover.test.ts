import { describe, expect, it } from 'vitest';
import { err, isOk, ok } from '../core/result.js';
import { createDiscover } from './discover.js';

describe('createDiscover', () => {
  it('reads shelves and search from the market index, not live skills.sh', async () => {
    const urls: string[] = [];
    const discover = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () => ok([]),
      get: async (url) => {
        urls.push(url);
        if (url.endsWith('/api/market/shelves')) {
          return { data: { data: [{ slug: 'swe', label: 'SWE', fields: [] }] } };
        }
        return { data: { data: [{ id: 'a/one', name: 'One', installs: 3 }] } };
      },
    });

    const shelves = await discover.shelves();
    const search = await discover.search('sql');

    expect(urls).toEqual([
      'https://www.skil.website/api/market/shelves',
      'https://www.skil.website/api/market/search',
    ]);
    expect(shelves).toEqual({ ok: true, value: [{ slug: 'swe', label: 'SWE', fields: [] }] });
    expect(search).toEqual({ ok: true, value: [{ id: 'a/one', name: 'One', installs: 3 }] });
  });

  it('reads suggested picks from /api/market/suggested, not an LLM', async () => {
    const calls: Array<{ url: string; params?: Record<string, string> }> = [];
    const discover = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () => ok([]),
      get: async (url, config) => {
        calls.push({ url, params: config?.params });
        return {
          data: {
            data: {
              updatedAt: '2026-03-09',
              roles: [{ slug: 'swe', label: 'SWE', skills: [{ id: 'from/api', name: 'From API', installs: 1, rank: 1 }] }],
            },
          },
        };
      },
    });

    const result = await discover.suggested('swe');

    expect(calls).toEqual([{ url: 'https://www.skil.website/api/market/suggested', params: { role: 'swe' } }]);
    expect(isOk(result) && result.value.roles[0]?.skills[0]?.id).toBe('from/api');
  });

  it('does not echo host text when the index fails', async () => {
    const discover = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () => ok([]),
      get: async () => {
        throw new Error('getaddrinfo ENOTFOUND db.internal');
      },
    });

    const result = await discover.search('sql');

    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.message).toBe('store_error');
      expect(result.error.message).not.toContain('db.internal');
    }
  });

  it('reads creators and one creator by slug from /api/market/creators', async () => {
    const calls: Array<{ url: string; params?: Record<string, string> }> = [];
    const card = { slug: 'vercel-labs', label: 'Vercel Labs', official: true, pinned: false, skillCount: 2, totalInstalls: 9 };
    const detail = {
      slug: 'vercel-labs',
      label: 'Vercel Labs',
      official: true,
      repos: [{ source: 'vercel-labs/agent-skills', skills: [{ id: 'a', name: 'A', installs: 1, topics: [] }] }],
    };
    const discover = createDiscover({
      apiBaseUrl: 'https://www.skil.website/',
      browse: async () => ok([]),
      get: async (url, config) => {
        calls.push({ url, params: config?.params });
        return { data: { data: config?.params?.slug ? detail : [card] } };
      },
    });

    expect(await discover.creators()).toEqual({ ok: true, value: [card] });
    expect(await discover.creator('vercel-labs')).toEqual({ ok: true, value: detail });
    expect(calls).toEqual([
      { url: 'https://www.skil.website/api/market/creators', params: undefined },
      { url: 'https://www.skil.website/api/market/creators', params: { slug: 'vercel-labs' } },
    ]);
  });

  it('maps an unknown creator slug to not_found and other failures to store_error', async () => {
    const notFound = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () => ok([]),
      get: async () => {
        throw Object.assign(new Error('Request failed with status code 404'), { response: { status: 404 } });
      },
    });
    const down = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () => ok([]),
      get: async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND db.internal'), { response: { status: 500 } });
      },
    });

    const missing = await notFound.creator('nobody');
    const failedList = await down.creators();
    const failedDetail = await down.creator('vercel-labs');

    expect(!isOk(missing) && missing.error.message).toBe('not_found');
    expect(!isOk(failedList) && failedList.error.message).toBe('store_error');
    expect(!isOk(failedDetail) && failedDetail.error.message).toBe('store_error');
  });

  it('maps live browse hits without a second HTTP client', async () => {
    const discover = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () =>
        ok([{ id: 'obra/react-patterns', source: 'skills.sh', installedAt: '', installs: 1200 }]),
      get: async () => {
        throw new Error('should not fetch');
      },
    });

    expect(await discover.browse('all-time')).toEqual({
      ok: true,
      value: [{ id: 'obra/react-patterns', name: undefined, installs: 1200 }],
    });
  });

  it('passes browse failures through without changing the code', async () => {
    const discover = createDiscover({
      apiBaseUrl: 'https://www.skil.website',
      browse: async () => err(new Error('leaderboard unreachable')),
    });

    const result = await discover.browse('trending');

    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.message).toBe('leaderboard unreachable');
    }
  });
});
