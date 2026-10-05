import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { OFFICIAL_URL, fetchOfficialOwners, parseOfficialOwners } from './official-owners.js';

const FIXTURE = readFileSync(new URL('./__fixtures__/skills-sh-official.html', import.meta.url), 'utf8');

const EXPECTED = [
  'anthropics',
  'vercel-labs',
  'microsoft',
  'remotion-dev',
  'supabase',
  'prisma',
  'firebase',
  'neondatabase',
  'google',
  'better-auth',
  'convex-dev',
  'stripe',
];

describe('parseOfficialOwners', () => {
  it('reads owner links from the saved /official page in page order', () => {
    expect(parseOfficialOwners(FIXTURE)).toEqual(EXPECTED);
  });

  it('ignores nav, footer, repo links and external links', () => {
    const owners = parseOfficialOwners(FIXTURE);
    for (const notOwner of ['trending', 'hot', 'official', 'docs', 'about', 'privacy', 'terms', 'skills']) {
      expect(owners).not.toContain(notOwner);
    }
  });

  it('accepts dotted owners and falls back to the whole page without <main>', () => {
    const html = '<nav><a href="/docs">Docs</a></nav><a href="/open.feishu.cn">Lark</a><a href="/anthropics">A</a>';
    expect(parseOfficialOwners(html)).toEqual(['open.feishu.cn', 'anthropics']);
  });

  it('returns [] when the page has no owner links', () => {
    expect(parseOfficialOwners('<main><p>Nothing here</p></main>')).toEqual([]);
  });
});

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe('fetchOfficialOwners', () => {
  it('fetches skills.sh/official and parses it', async () => {
    const fetchImpl = fakeFetch(new Response(FIXTURE, { status: 200 }));
    const result = await fetchOfficialOwners(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(OFFICIAL_URL, expect.anything());
    expect(OFFICIAL_URL).toBe('https://skills.sh/official');
    expect(isOk(result) && result.value).toEqual(EXPECTED);
  });

  it('fails on a non-2xx status', async () => {
    const result = await fetchOfficialOwners(fakeFetch(new Response('nope', { status: 503 })) as unknown as typeof fetch);
    expect(isErr(result) && result.error.message).toMatch(/503/);
  });

  it('fails when the request throws', async () => {
    const result = await fetchOfficialOwners(fakeFetch(new Error('ENOTFOUND')) as unknown as typeof fetch);
    expect(isErr(result) && result.error.message).toMatch(/ENOTFOUND/);
  });

  it('fails when the page parses to no owners (layout changed)', async () => {
    const fetchImpl = fakeFetch(new Response('<main></main>', { status: 200 }));
    const result = await fetchOfficialOwners(fetchImpl as unknown as typeof fetch);
    expect(isErr(result) && result.error.message).toMatch(/no owner links/);
  });
});
