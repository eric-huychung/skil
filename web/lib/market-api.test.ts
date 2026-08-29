import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBrowse } from './market-api';

describe('fetchBrowse', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests /api/skills with only the view param', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'obra/react-patterns', name: 'react-patterns', installs: 1200 }] }),
    });
    vi.stubGlobal('fetch', fetchImpl);

    const rows = await fetchBrowse('all-time');

    expect(fetchImpl).toHaveBeenCalledWith('/api/skills?view=all-time');
    expect(rows).toEqual([{ id: 'obra/react-patterns', name: 'react-patterns', installs: 1200 }]);
  });
});
