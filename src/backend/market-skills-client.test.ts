import { describe, expect, it, vi } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { RealMarketSkillsClient } from './market-skills-client.js';

function fakeFetch(response: { status: number; body: unknown }) {
  return vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  })) as unknown as typeof fetch;
}

function client(fetchImpl: typeof fetch) {
  return new RealMarketSkillsClient({ fetchImpl, getOidcToken: async () => 'test-oidc-token' });
}

function listingRow(id: string, overrides: Partial<{ installs: number; isDuplicate: boolean }> = {}) {
  return {
    id,
    slug: id,
    name: id,
    source: 'example/example',
    installs: overrides.installs ?? 0,
    installUrl: `https://github.com/${id}`,
    url: `https://skills.sh/${id}`,
    ...(overrides.isDuplicate !== undefined ? { isDuplicate: overrides.isDuplicate } : {}),
  };
}

describe('RealMarketSkillsClient.listPage', () => {
  it('requests page 0 with no cursor and maps hasMore to nextCursor', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { data: [listingRow('a/one')], pagination: { page: 0, perPage: 500, total: 900, hasMore: true } },
    });

    const result = await client(fetchImpl).listPage();

    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(
      'https://skills.sh/api/v1/skills?view=all-time&page=0&per_page=500',
    );
    expect(isOk(result) && result.value).toEqual({ items: [listingRow('a/one')], nextCursor: '1' });
  });

  it('requests the next page number from the given cursor', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { data: [], pagination: { page: 3, perPage: 500, total: 900, hasMore: true } },
    });

    await client(fetchImpl).listPage('3');

    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toContain('page=3');
  });

  it('omits nextCursor on the last page', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { data: [], pagination: { page: 1, perPage: 500, total: 500, hasMore: false } },
    });

    const result = await client(fetchImpl).listPage('1');

    expect(isOk(result) && result.value.nextCursor).toBeUndefined();
  });

  it('returns an error when skills.sh responds with an error status', async () => {
    const fetchImpl = fakeFetch({ status: 429, body: { message: 'Too many requests' } });

    const result = await client(fetchImpl).listPage();

    expect(isErr(result) && result.error.message).toContain('Too many requests');
  });
});

describe('RealMarketSkillsClient.getSkill', () => {
  it('parses description from the SKILL.md file and keeps the API hash', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        id: 'a/one',
        source: 'a',
        slug: 'one',
        installs: 5,
        hash: 'api-hash',
        files: [{ path: 'SKILL.md', contents: '---\ndescription: Does one thing.\n---\nBody' }],
      },
    });

    const result = await client(fetchImpl).getSkill('a/one');

    expect(isOk(result) && result.value).toEqual({ description: 'Does one thing.', hash: 'api-hash' });
  });

  it('falls back to hashing the fetched SKILL.md when the API hash is null', async () => {
    const contents = '---\ndescription: Hi\n---\nBody';
    const fetchImpl = fakeFetch({
      status: 200,
      body: { id: 'a/one', source: 'a', slug: 'one', installs: 5, hash: null, files: [{ path: 'SKILL.md', contents }] },
    });

    const result = await client(fetchImpl).getSkill('a/one');

    expect(isOk(result) && result.value.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns a null description when there is no SKILL.md file', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { id: 'a/one', source: 'a', slug: 'one', installs: 5, hash: 'h', files: null },
    });

    const result = await client(fetchImpl).getSkill('a/one');

    expect(isOk(result) && result.value.description).toBeNull();
  });

  it('requests the id directly as the detail path', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { id: 'a/one', source: 'a', slug: 'one', installs: 0, hash: 'h', files: null } });

    await client(fetchImpl).getSkill('a/one');

    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('https://skills.sh/api/v1/skills/a/one');
  });
});

describe('RealMarketSkillsClient.getSkillMd', () => {
  it('returns the raw SKILL.md contents', async () => {
    const contents = '---\ndescription: Does one thing.\n---\nBody text.';
    const fetchImpl = fakeFetch({
      status: 200,
      body: { id: 'a/one', source: 'a', slug: 'one', installs: 5, hash: 'h', files: [{ path: 'SKILL.md', contents }] },
    });

    const result = await client(fetchImpl).getSkillMd('a/one');

    expect(isOk(result) && result.value).toBe(contents);
  });

  it('returns null when there is no SKILL.md file', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: { id: 'a/one', source: 'a', slug: 'one', installs: 5, hash: 'h', files: null },
    });

    const result = await client(fetchImpl).getSkillMd('a/one');

    expect(isOk(result) && result.value).toBeNull();
  });

  it('returns an error when the skill is unknown', async () => {
    const fetchImpl = fakeFetch({ status: 404, body: { message: 'Not found' } });

    const result = await client(fetchImpl).getSkillMd('a/missing');

    expect(isErr(result)).toBe(true);
  });
});

describe('RealMarketSkillsClient error handling', () => {
  it('returns an error instead of throwing when skills.sh returns a non-JSON body (e.g. a gateway HTML error page)', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
      },
    })) as unknown as typeof fetch;

    const result = await client(fetchImpl).getSkill('a/one');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('non-JSON');
    }
  });
});

describe('RealMarketSkillsClient.getAudit', () => {
  it('maps a 404 to status none', async () => {
    const fetchImpl = fakeFetch({ status: 404, body: { error: 'not_found' } });

    const result = await client(fetchImpl).getAudit('a/one');

    expect(isOk(result) && result.value).toEqual({ status: 'none' });
  });

  it('returns none when the skill has no audits', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { id: 'a/one', source: 'a', slug: 'one', audits: [] } });

    const result = await client(fetchImpl).getAudit('a/one');

    expect(isOk(result) && result.value).toEqual({ status: 'none' });
  });

  it('picks the worst status across partners: fail beats warn beats pass', async () => {
    const fetchImpl = fakeFetch({
      status: 200,
      body: {
        id: 'a/one',
        source: 'a',
        slug: 'one',
        audits: [{ status: 'pass' }, { status: 'fail' }, { status: 'warn' }],
      },
    });

    const result = await client(fetchImpl).getAudit('a/one');

    expect(isOk(result) && result.value).toEqual({ status: 'fail' });
  });
});
