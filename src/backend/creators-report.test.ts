import { describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { err, isErr, isOk, ok } from '../core/result.js';
import {
  fetchGithubFollowers,
  formatReport,
  printCreatorsReport,
  runCreatorsReport,
  type CreatorsReportDeps,
} from './creators-report.js';
import { parseMarketCreators, type CreatorsConfig, type CreatorEntry } from './market-creators.js';
import type { OwnerStats } from './market-types.js';

const OFFICIAL_HTML = '<main><a href="/anthropics">A</a><a href="/vercel-labs">V</a><a href="/stripe">S</a></main>';

function entry(slug: string, owners = [slug], extra: Partial<CreatorEntry> = {}): CreatorEntry {
  return { slug, label: slug.toUpperCase(), owners, pinned: false, official: false, ...extra };
}

function config(creators: CreatorEntry[], extra: Partial<CreatorsConfig> = {}): CreatorsConfig {
  return {
    updatedAt: '2026-10-01',
    techCutoff: 0.4,
    officialFetchedAt: '2026-10-01',
    officialOwners: ['anthropics', 'vercel-labs'],
    blocked: [],
    creators,
    ...extra,
  };
}

function stats(owner: string, bestInstalls: number): OwnerStats {
  return { owner, skillCount: 2, totalInstalls: bestInstalls * 2, bestInstalls };
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

/** Routes skills.sh /official and GitHub user calls; anything else fails the test. */
function fakeFetch(opts: { official?: () => Response | Promise<Response>; followers?: Record<string, number> } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://skills.sh/official') return (opts.official ?? (() => htmlResponse(OFFICIAL_HTML)))();
    const user = /^https:\/\/api\.github\.com\/users\/(.+)$/.exec(url)?.[1];
    if (user !== undefined) {
      const followers = opts.followers?.[decodeURIComponent(user)];
      return followers === undefined
        ? new Response('{}', { status: 404 })
        : new Response(JSON.stringify({ followers }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

function deps(over: Partial<CreatorsReportDeps> & { rows?: OwnerStats[] } = {}): CreatorsReportDeps {
  const { rows, ...rest } = over;
  return {
    store: { listTopOwners: async () => ok(rows ?? []) },
    config: config([]),
    fetchImpl: fakeFetch(),
    now: () => new Date('2026-10-04T12:00:00Z'),
    size: 3,
    ...rest,
  };
}

describe('runCreatorsReport', () => {
  it('ranks merged owners, keeps pins first, and diffs against the current YAML', async () => {
    const current = config([
      entry('pinme', ['pinme'], { pinned: true }),
      entry('lark', ['larksuite', 'open.feishu.cn']),
      entry('gone'),
    ]);
    const rows = [stats('vercel-labs', 900), stats('larksuite', 500), stats('open.feishu.cn', 700), stats('gone', 10)];
    const result = await runCreatorsReport(deps({ config: current, rows }));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const model = result.value;

    expect(model.rows.map((r) => r.slug)).toEqual(['pinme', 'vercel-labs', 'lark']);
    expect(model.rows[0]).toMatchObject({ pinned: true, bestInstalls: 0, label: 'PINME' });
    expect(model.rows[1]).toMatchObject({ official: true, label: 'vercel-labs', bestInstalls: 900 });
    expect(model.rows[2]).toMatchObject({ owners: ['larksuite', 'open.feishu.cn'], bestInstalls: 700, label: 'LARK' });
    expect(model.entering).toEqual(['vercel-labs']);
    expect(model.leaving).toEqual([{ slug: 'gone', label: 'GONE' }]);
    expect(model.officialOwners).toEqual(['anthropics', 'vercel-labs', 'stripe']);
    expect(model.officialFetchedAt).toBe('2026-10-04');
    expect(model.officialWarning).toBeUndefined();
  });

  it('drops blocked owners and asks the store for the top 100', async () => {
    const listTopOwners = vi.fn(async () => ok([stats('spam', 999), stats('a', 5)]));
    const result = await runCreatorsReport({
      ...deps({ config: config([], { blocked: ['spam'] }) }),
      store: { listTopOwners },
    });
    expect(listTopOwners).toHaveBeenCalledWith(100);
    expect(isOk(result) && result.value.rows.map((r) => r.slug)).toEqual(['a']);
  });

  it('keeps the saved official list with a warning when /official fails', async () => {
    const fetchImpl = fakeFetch({ official: () => htmlResponse('down', 503) });
    const result = await runCreatorsReport(deps({ rows: [stats('anthropics', 5)], fetchImpl }));
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.officialWarning).toBe('official list unchanged (official owners fetch failed: HTTP 503)');
    expect(result.value.officialOwners).toEqual(['anthropics', 'vercel-labs']);
    expect(result.value.officialFetchedAt).toBe('2026-10-01');
    expect(result.value.rows[0]?.official).toBe(true);
  });

  it('returns the store error', async () => {
    const result = await runCreatorsReport({
      ...deps(),
      store: { listTopOwners: async () => err(new Error('db down')) },
    });
    expect(isErr(result) && result.error.message).toBe('db down');
  });

  it('skips GitHub without a token and shows followers with one', async () => {
    const rows = [stats('anthropics', 9), stats('nobody', 8)];
    const fetchImpl = fakeFetch({ followers: { anthropics: 1234 } });
    const without = await runCreatorsReport(deps({ rows, fetchImpl }));
    expect(isOk(without) && without.value.rows.map((r) => r.followers)).toEqual([null, null]);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual(['https://skills.sh/official']);

    const withToken = await runCreatorsReport(deps({ rows, fetchImpl, githubToken: 'ghp_x' }));
    expect(isOk(withToken) && withToken.value.rows.map((r) => r.followers)).toEqual([1234, null]);
  });

  it('uses the gate seam: verdicts fill the columns and failures are skipped', async () => {
    const gate = {
      judge: vi.fn(async () =>
        ok(
          new Map([
            ['a', { techProbability: 0.9, domain: 'devtools', passes: true }],
            ['b', { techProbability: 0.1, domain: 'finance', passes: false }],
          ])
        )
      ),
    };
    const result = await runCreatorsReport(deps({ rows: [stats('b', 9), stats('a', 8), stats('c', 7)], gate }));
    expect(isOk(result) && result.value.rows.map((r) => [r.slug, r.techProbability, r.domain])).toEqual([
      ['a', 0.9, 'devtools'],
      ['c', null, null],
    ]);
  });
});

describe('fetchGithubFollowers', () => {
  it('sends the token and returns null on any failure', async () => {
    const fetchImpl = fakeFetch({ followers: { antfu: 42 } });
    expect(await fetchGithubFollowers('antfu', 'tok', fetchImpl)).toBe(42);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(await fetchGithubFollowers('missing', 'tok', fetchImpl)).toBeNull();
    const throwing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchGithubFollowers('antfu', 'tok', throwing)).toBeNull();
  });
});

describe('formatReport', () => {
  async function model(current: CreatorsConfig, rows: OwnerStats[], extra: Partial<CreatorsReportDeps> = {}) {
    const result = await runCreatorsReport(deps({ config: current, rows, ...extra }));
    if (!isOk(result)) throw result.error;
    return result.value;
  }

  it('prints the table, enter/leave against the current YAML, and a paste-ready YAML block', async () => {
    const current = config([entry('pinme', ['pinme'], { pinned: true, tech: true }), entry('gone')]);
    const text = formatReport(await model(current, [stats('vercel-labs', 1_234_567), stats('Foo: Bar', 5)]));

    expect(text).toMatch(/vercel-labs\s+1,234,567\s+n\/a\s+n\/a\s+n\/a\s+yes/);
    expect(text).toContain('Entering (2): vercel-labs, Foo: Bar');
    expect(text).toContain('Leaving (1): gone (GONE)');
    expect(text).toContain('Official owners: +stripe');
    expect(text).not.toContain('Warning');

    const block = text.split('--- paste into data/market-creators.yaml ---\n')[1] ?? '';
    const pasted = yaml.load(block) as Record<string, unknown>;
    expect(pasted).toEqual({
      officialFetchedAt: new Date('2026-10-04'), // unquoted, like the real file
      officialOwners: ['anthropics', 'vercel-labs', 'stripe'],
      creators: [
        { slug: 'pinme', label: 'PINME', owners: ['pinme'], pinned: true, tech: true },
        { slug: 'vercel-labs', label: 'vercel-labs', owners: ['vercel-labs'] },
        { slug: 'Foo: Bar', label: 'Foo: Bar', owners: ['Foo: Bar'] },
      ],
    });
  });

  it('prints a warning line when /official failed and says the list is unchanged', async () => {
    const fetchImpl = fakeFetch({ official: () => Promise.reject(new Error('ENOTFOUND')) });
    const text = formatReport(await model(config([]), [stats('a', 1)], { fetchImpl }));
    expect(text).toContain('Warning: official list unchanged (official owners fetch failed: ENOTFOUND)');
    expect(text).toContain('Official owners: unchanged');
  });

  it('a full 30-slot paste block passes the YAML validator', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => stats(`owner${i}`, 1000 - i));
    const text = formatReport(await model(config([entry('pinme', ['pinme'], { pinned: true })]), rows, { size: 30 }));
    const block = text.split('--- paste into data/market-creators.yaml ---\n')[1] ?? '';
    const file = `updatedAt: 2026-10-04\ntechCutoff: 0.4\nblocked: []\n${block}`;
    const parsed = parseMarketCreators(file);
    expect(parsed.creators).toHaveLength(30);
    expect(parsed.creators[0]).toMatchObject({ slug: 'pinme', pinned: true });
  });
});

describe('printCreatorsReport', () => {
  it('exits 0 and prints the warning when /official fails', async () => {
    const lines: string[] = [];
    const fetchImpl = fakeFetch({ official: () => htmlResponse('', 500) });
    const code = await printCreatorsReport(deps({ rows: [stats('a', 1)], fetchImpl }), {
      log: (line) => lines.push(line),
      error: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('Warning: official list unchanged');
  });

  it('exits 1 on a store error', async () => {
    const errors: string[] = [];
    const code = await printCreatorsReport(
      { ...deps(), store: { listTopOwners: async () => err(new Error('db down')) } },
      { log: () => {}, error: (line) => errors.push(line) }
    );
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('db down');
  });
});
