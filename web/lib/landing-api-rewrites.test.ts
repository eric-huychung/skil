import { describe, expect, it } from 'vitest';
import { landingApiRewrites } from './landing-api-rewrites.mjs';

describe('landingApiRewrites', () => {
  it('proxies /api to the public origin in local next dev', () => {
    expect(landingApiRewrites(true, 'https://www.skil.website')).toEqual([
      { source: '/api/:path*', destination: 'https://www.skil.website/api/:path*' },
    ]);
  });

  it('does not rewrite when building the static export', () => {
    expect(landingApiRewrites(false, 'https://www.skil.website')).toEqual([]);
  });
});
