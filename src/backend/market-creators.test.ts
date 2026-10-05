import { describe, expect, it } from 'vitest';
import { loadMarketCreators, parseMarketCreators } from './market-creators.js';

type Entry = { slug: string; label: string; owners: string[]; pinned?: boolean; tech?: boolean };

function entries(count = 30): Entry[] {
  return Array.from({ length: count }, (_, i) => ({
    slug: `creator-${i}`,
    label: `Creator ${i}`,
    owners: [`owner-${i}`],
    ...(i < 2 ? { pinned: true } : {}),
  }));
}

function fixture(
  overrides: { creators?: Entry[]; officialOwners?: string[]; blocked?: string[] } = {},
): string {
  const creators = overrides.creators ?? entries();
  const officialOwners = overrides.officialOwners ?? ['owner-2', 'owner-5-alias'];
  const blocked = overrides.blocked ?? [];
  return [
    'updatedAt: 2026-10-04',
    'techCutoff: 0.4',
    'officialFetchedAt: 2026-10-04',
    `officialOwners: ${JSON.stringify(officialOwners)}`,
    `blocked: ${JSON.stringify(blocked)}`,
    'creators:',
    ...creators.map((c) => `  - ${JSON.stringify(c)}`),
  ].join('\n');
}

describe('parseMarketCreators', () => {
  it('parses a valid fixture', () => {
    const config = parseMarketCreators(fixture());
    expect(config.updatedAt).toBe('2026-10-04');
    expect(config.officialFetchedAt).toBe('2026-10-04');
    expect(config.techCutoff).toBe(0.4);
    expect(config.blocked).toEqual([]);
    expect(config.creators).toHaveLength(30);
    expect(config.creators[0]).toMatchObject({ slug: 'creator-0', label: 'Creator 0', owners: ['owner-0'], pinned: true });
    expect(config.creators[2]?.pinned).toBe(false);
  });

  it('derives official from officialOwners via any owner alias', () => {
    const creators = entries();
    creators[5] = { ...creators[5]!, owners: ['owner-5', 'owner-5-alias'] };
    const config = parseMarketCreators(fixture({ creators }));
    expect(config.creators[2]?.official).toBe(true);
    expect(config.creators[5]?.official).toBe(true);
    expect(config.creators[3]?.official).toBe(false);
  });

  it('keeps an optional tech override', () => {
    const creators = entries();
    creators[4] = { ...creators[4]!, tech: false };
    const config = parseMarketCreators(fixture({ creators }));
    expect(config.creators[4]?.tech).toBe(false);
    expect(config.creators[3]?.tech).toBeUndefined();
  });

  it('rejects anything but exactly 30 creators', () => {
    expect(() => parseMarketCreators(fixture({ creators: entries(29) }))).toThrow(/30/);
    expect(() => parseMarketCreators(fixture({ creators: entries(31) }))).toThrow(/30/);
  });

  it('rejects a pinned entry after an unpinned one', () => {
    const creators = entries();
    creators[10] = { ...creators[10]!, pinned: true };
    expect(() => parseMarketCreators(fixture({ creators }))).toThrow(/pinned/);
  });

  it('rejects duplicate slugs', () => {
    const creators = entries();
    creators[7] = { ...creators[7]!, slug: 'creator-3' };
    expect(() => parseMarketCreators(fixture({ creators }))).toThrow(/duplicate slug/);
  });

  it('rejects an owner claimed by two creators', () => {
    const creators = entries();
    creators[8] = { ...creators[8]!, owners: ['owner-8', 'owner-3'] };
    expect(() => parseMarketCreators(fixture({ creators }))).toThrow(/owner-3/);
  });

  it('rejects an owner that is blocked', () => {
    expect(() => parseMarketCreators(fixture({ blocked: ['owner-6'] }))).toThrow(/blocked/);
  });

  it('rejects empty officialOwners', () => {
    expect(() => parseMarketCreators(fixture({ officialOwners: [] }))).toThrow(/officialOwners/);
  });

  it('rejects a creator with no owners', () => {
    const creators = entries();
    creators[9] = { ...creators[9]!, owners: [] };
    expect(() => parseMarketCreators(fixture({ creators }))).toThrow(/owners/);
  });

  it('rejects a missing updatedAt', () => {
    expect(() => parseMarketCreators(fixture().replace('updatedAt: 2026-10-04\n', ''))).toThrow(/updatedAt/);
  });
});

describe('loadMarketCreators', () => {
  it('loads the committed repo file: 30 creators, 2 pins, 10 official', () => {
    const config = loadMarketCreators();
    expect(config.creators).toHaveLength(30);
    expect(config.creators.slice(0, 2).map((c) => c.slug)).toEqual(['addyosmani', 'antfu']);
    expect(config.creators.filter((c) => c.pinned)).toHaveLength(2);
    expect(config.creators[2]?.slug).toBe('vercel-labs');
    expect(config.creators.filter((c) => c.official)).toHaveLength(10);
    expect(config.creators.find((c) => c.slug === 'sentry')?.official).toBe(false);
    expect(config.creators.find((c) => c.slug === 'get-convex')?.official).toBe(false);
  });
});
