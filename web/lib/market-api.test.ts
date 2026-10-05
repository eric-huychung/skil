import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBrowse, fetchCreator, fetchCreators } from './market-api';

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

describe('fetchCreators', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests /api/market/creators and returns the cards', async () => {
    const card = {
      slug: 'anthropic',
      label: 'Anthropic',
      official: true,
      pinned: true,
      skillCount: 12,
      totalInstalls: 54000,
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [card], meta: { updatedAt: '2026-10-01', installsSource: 'skills.sh' } }),
    });
    vi.stubGlobal('fetch', fetchImpl);

    const cards = await fetchCreators();

    expect(fetchImpl).toHaveBeenCalledWith('/api/market/creators');
    expect(cards).toEqual([card]);
  });

  it('throws with the status when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'store_error' }) }));

    await expect(fetchCreators()).rejects.toThrow('Request to /api/market/creators failed with 500');
  });
});

describe('fetchCreator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests one creator by encoded slug and returns the detail', async () => {
    const detail = {
      slug: 'open ai',
      label: 'OpenAI',
      official: false,
      repos: [
        {
          source: 'openai/skills',
          skills: [{ id: 'openai/skills/pdf', name: 'pdf', installs: 900, topics: ['documents'] }],
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: detail }) });
    vi.stubGlobal('fetch', fetchImpl);

    const result = await fetchCreator('open ai');

    expect(fetchImpl).toHaveBeenCalledWith('/api/market/creators?slug=open+ai');
    expect(result).toEqual(detail);
  });

  it('throws with the status for an unknown slug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) }));

    await expect(fetchCreator('nobody')).rejects.toThrow('Request to /api/market/creators?slug=nobody failed with 404');
  });
});
