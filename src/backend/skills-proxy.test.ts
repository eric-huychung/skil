import { describe, expect, it, vi } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { website } from '../config/website.js';
import { browseSkills, handleBrowseRequest, searchSkills } from './skills-proxy.js';

function fakeFetch(response: { status: number; body: unknown }) {
  return vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  })) as unknown as typeof fetch;
}

describe('searchSkills', () => {
  it('calls skills.sh search with the query and an OIDC bearer token', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { data: [{ id: 'obra/react-patterns' }] } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    await searchSkills('react', { fetchImpl, getOidcToken });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://skills.sh/api/v1/skills/search?q=react');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-oidc-token' });
  });

  it('returns the upstream response body on success', async () => {
    const body = { data: [{ id: 'obra/react-patterns' }], query: 'react', searchType: 'fuzzy', count: 1, durationMs: 10 };
    const fetchImpl = fakeFetch({ status: 200, body });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const result = await searchSkills('react', { fetchImpl, getOidcToken });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual(body);
    }
  });

  it('returns an error when skills.sh responds with an error status', async () => {
    const fetchImpl = fakeFetch({ status: 429, body: { error: 'rate_limited', message: 'Too many requests' } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const result = await searchSkills('react', { fetchImpl, getOidcToken });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Too many requests');
    }
  });

  it('returns an error when the request to skills.sh throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const result = await searchSkills('react', { fetchImpl, getOidcToken });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('network down');
    }
  });
});

describe('browseSkills', () => {
  it('calls skills.sh leaderboard with the view, per_page=100, and an OIDC bearer token', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { data: [{ id: 'obra/react-patterns', installs: 1200 }] } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    await browseSkills('all-time', { fetchImpl, getOidcToken });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://skills.sh/api/v1/skills?view=all-time&per_page=100');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-oidc-token' });
  });

  it('requests the trending view from the same origin endpoint', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { data: [] } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    await browseSkills('trending', { fetchImpl, getOidcToken });

    const [url] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://skills.sh/api/v1/skills?view=trending&per_page=100');
  });

  it('returns the upstream response body on success', async () => {
    const body = { data: [{ id: 'obra/react-patterns', installs: 1200 }] };
    const fetchImpl = fakeFetch({ status: 200, body });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const result = await browseSkills('all-time', { fetchImpl, getOidcToken });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual(body);
    }
  });

  it('returns an error when skills.sh responds with an error status', async () => {
    const fetchImpl = fakeFetch({ status: 503, body: { message: 'leaderboard unavailable' } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const result = await browseSkills('all-time', { fetchImpl, getOidcToken });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('leaderboard unavailable');
    }
  });

  it('returns an error when the request to skills.sh throws', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const result = await browseSkills('trending', { fetchImpl, getOidcToken });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('network down');
    }
  });
});

describe('handleBrowseRequest', () => {
  it('returns upstream data with CDN Cache-Control on a successful all-time browse', async () => {
    const body = { data: [{ id: 'obra/react-patterns', installs: 1200 }] };
    const fetchImpl = fakeFetch({ status: 200, body });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const response = await handleBrowseRequest(new Request(`${website.apiBaseUrl}/api/skills?view=all-time`), {
      fetchImpl,
      getOidcToken,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=86400, stale-while-revalidate=3600');
    expect(await response.json()).toEqual(body);
  });

  it('returns upstream data with CDN Cache-Control on a successful trending browse', async () => {
    const body = { data: [{ id: 'vercel-labs/security-review', installs: 90 }] };
    const fetchImpl = fakeFetch({ status: 200, body });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const response = await handleBrowseRequest(new Request(`${website.apiBaseUrl}/api/skills?view=trending`), {
      fetchImpl,
      getOidcToken,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=86400, stale-while-revalidate=3600');
    expect(await response.json()).toEqual(body);
  });

  it('returns 400 when view is missing', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { data: [] } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const response = await handleBrowseRequest(new Request(`${website.apiBaseUrl}/api/skills`), {
      fetchImpl,
      getOidcToken,
    });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  });

  it('returns 400 when view is not all-time or trending', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { data: [] } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const response = await handleBrowseRequest(new Request(`${website.apiBaseUrl}/api/skills?view=hot`), {
      fetchImpl,
      getOidcToken,
    });

    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns 502 with the upstream message when skills.sh fails', async () => {
    const fetchImpl = fakeFetch({ status: 503, body: { message: 'leaderboard unavailable' } });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    const response = await handleBrowseRequest(new Request(`${website.apiBaseUrl}/api/skills?view=all-time`), {
      fetchImpl,
      getOidcToken,
    });

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBeNull();
    expect(await response.json()).toMatchObject({ error: 'upstream_error', message: expect.stringContaining('leaderboard unavailable') });
  });

  it('handles relative URLs (as seen in Vercel production)', async () => {
    const body = { data: [{ id: 'obra/react-patterns', installs: 1200 }] };
    const fetchImpl = fakeFetch({ status: 200, body });
    const getOidcToken = vi.fn(async () => 'test-oidc-token');

    // Vercel sometimes provides relative URLs in request.url
    const request = new Request('http://placeholder.local/api/skills?view=all-time');
    Object.defineProperty(request, 'url', { value: '/api/skills?view=all-time', writable: false });

    const response = await handleBrowseRequest(request, {
      fetchImpl,
      getOidcToken,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });
});
