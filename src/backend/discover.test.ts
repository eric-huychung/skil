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
