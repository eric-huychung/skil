import { describe, expect, it } from 'vitest';
import {
  mergeAliases,
  rankCandidates,
  selectThirty,
  type CreatorCandidate,
  type OwnerStats,
} from './creator-ranking.js';

function stats(owner: string, bestInstalls: number, skillCount = 1, totalInstalls = bestInstalls): OwnerStats {
  return { owner, skillCount, totalInstalls, bestInstalls };
}

function candidate(key: string, bestInstalls: number, owners: string[] = [key]): CreatorCandidate {
  return { key, owners, skillCount: 1, totalInstalls: bestInstalls, bestInstalls };
}

describe('mergeAliases', () => {
  it('merges alias owners into one candidate: counts and installs sum, best is the max', () => {
    const merged = mergeAliases(
      [stats('larksuite', 500, 3, 900), stats('open.feishu.cn', 800, 2, 1000), stats('antfu', 50)],
      [{ slug: 'lark', owners: ['larksuite', 'open.feishu.cn'] }]
    );
    const lark = merged.find((c) => c.key === 'lark');
    expect(lark).toEqual({
      key: 'lark',
      owners: ['larksuite', 'open.feishu.cn'],
      skillCount: 5,
      totalInstalls: 1900,
      bestInstalls: 800,
    });
    expect(merged.find((c) => c.key === 'antfu')).toEqual(candidate('antfu', 50));
    expect(merged).toHaveLength(2);
  });

  it('keeps only the alias owners that have stats', () => {
    const merged = mergeAliases(
      [stats('google', 300), stats('googleworkspace', 100)],
      [{ slug: 'google', owners: ['google', 'googleworkspace', 'google-labs-code'] }]
    );
    expect(merged).toEqual([
      { key: 'google', owners: ['google', 'googleworkspace'], skillCount: 2, totalInstalls: 400, bestInstalls: 300 },
    ]);
  });

  it('drops an alias group with no stats at all', () => {
    expect(mergeAliases([stats('antfu', 1)], [{ slug: 'lark', owners: ['larksuite'] }])).toEqual([
      candidate('antfu', 1),
    ]);
  });

  it('matches owners case-insensitively', () => {
    const merged = mergeAliases([stats('LarkSuite', 10)], [{ slug: 'lark', owners: ['larksuite'] }]);
    expect(merged.map((c) => c.key)).toEqual(['lark']);
  });
});

describe('rankCandidates', () => {
  it('orders by best single-skill installs, ties by key', () => {
    const ranked = rankCandidates([candidate('b', 10), candidate('a', 10), candidate('c', 99)]);
    expect(ranked.map((c) => c.key)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [candidate('a', 1), candidate('b', 2)];
    rankCandidates(input);
    expect(input.map((c) => c.key)).toEqual(['a', 'b']);
  });
});

describe('selectThirty', () => {
  const ranked = Array.from({ length: 40 }, (_, i) => candidate(`owner${String(i).padStart(2, '0')}`, 1000 - i));

  it('returns exactly 30 when enough candidates exist', () => {
    expect(selectThirty({ ranked, pins: [], blocked: [] })).toHaveLength(30);
  });

  it('puts pins first in pin order, and each pin pushes the lowest-ranked creator off', () => {
    const pins = [
      { key: 'addyosmani', owners: ['addyosmani'] },
      { key: 'antfu', owners: ['antfu'] },
    ];
    const picked = selectThirty({ ranked, pins, blocked: [] });
    expect(picked).toHaveLength(30);
    expect(picked.slice(0, 2).map((c) => [c.key, c.pinned])).toEqual([
      ['addyosmani', true],
      ['antfu', true],
    ]);
    expect(picked[2]).toMatchObject({ key: 'owner00', pinned: false });
    expect(picked.at(-1)?.key).toBe('owner27');
  });

  it('uses ranked stats for a pin that is also a candidate and does not list it twice', () => {
    const picked = selectThirty({ ranked, pins: [{ key: 'owner05', owners: ['owner05'] }], blocked: [] });
    expect(picked[0]).toMatchObject({ key: 'owner05', pinned: true, bestInstalls: 995 });
    expect(picked.filter((c) => c.key === 'owner05')).toHaveLength(1);
    expect(picked).toHaveLength(30);
  });

  it('pins bypass the gate; others must pass it', () => {
    const picked = selectThirty({
      ranked,
      pins: [{ key: 'owner01', owners: ['owner01'] }],
      blocked: [],
      passes: (c) => Number(c.key.slice(-2)) % 2 === 0,
    });
    expect(picked[0].key).toBe('owner01');
    expect(picked.slice(1).every((c) => Number(c.key.slice(-2)) % 2 === 0)).toBe(true);
    // 1 pin + 20 even owners (00..38) is all there is.
    expect(picked).toHaveLength(21);
  });

  it('removes blocked owners, including any candidate that has a blocked alias', () => {
    const withAlias = [candidate('lark', 5000, ['larksuite', 'open.feishu.cn']), ...ranked];
    const picked = selectThirty({ ranked: withAlias, pins: [], blocked: ['open.feishu.cn', 'owner00'] });
    const keys = picked.map((c) => c.key);
    expect(keys).not.toContain('lark');
    expect(keys).not.toContain('owner00');
    expect(keys[0]).toBe('owner01');
    expect(picked).toHaveLength(30);
  });

  it('removes a blocked pin too', () => {
    const picked = selectThirty({ ranked, pins: [{ key: 'antfu', owners: ['antfu'] }], blocked: ['AntFu'] });
    expect(picked.map((c) => c.key)).not.toContain('antfu');
  });

  it('does not pad when fewer than 30 are eligible', () => {
    expect(selectThirty({ ranked: ranked.slice(0, 3), pins: [], blocked: [] })).toHaveLength(3);
  });
});
