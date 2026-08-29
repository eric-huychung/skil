import { isOk } from '../core/result.js';
import type { MarketSkillsClient } from './market-client.js';
import type { MarketStore } from './market-store.js';
import { toSkillsAddSource } from './skills-add-source.js';

/** Shelves change on a weekly cron, not per-request — cache for hours, not a day like the live browse proxy. */
const SHELVES_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=1800';
/** Preview proxies live skills.sh calls (SKILL.md + audit) — short CDN cache, same idea as the live browse proxy but shorter since audits can change. */
const PREVIEW_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=60';

const SEARCH_DEFAULT_LIMIT = 25;
const SEARCH_MAX_LIMIT = 50;
const STORE_UNAVAILABLE = 'Market index is temporarily unavailable.';

export interface MarketReadDeps {
  store: MarketStore;
}

export interface MarketPreviewDeps {
  store: MarketStore;
  client: MarketSkillsClient;
}

/**
 * Vercel Function handler for `GET /api/market/shelves`. Grouped by role;
 * each skill is `{ id, name, installs, rank }` only — `listShelves` already
 * omits description/hash/url, so this is a thin pass-through, not a
 * reshape. Empty index (migration applied but no sync run yet) returns
 * `{ data: [] }`, not an error. A new role/field inserted straight into
 * Supabase shows up here with no handler change — `listShelves` reads the
 * store, not a hardcoded list.
 */
export async function handleShelvesRequest(_request: Request, deps: MarketReadDeps): Promise<Response> {
  const result = await deps.store.listShelves();
  if (!isOk(result)) {
    return Response.json({ error: 'store_error', message: STORE_UNAVAILABLE }, { status: 500 });
  }

  return Response.json({ data: result.value }, { headers: { 'Cache-Control': SHELVES_CACHE_CONTROL } });
}

function parseSearchLimit(raw: string | null): number {
  const parsed = raw === null ? SEARCH_DEFAULT_LIMIT : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(parsed, SEARCH_MAX_LIMIT);
}

/**
 * Vercel Function handler for `GET /api/market/search?q=&limit=`. Searches
 * the full stored index (not just shelved skills) — same query used by the
 * landing page and the GUI's market search. `q` is required; `limit`
 * clamps to 1-50 (default 25). Each row is `{ id, name, installs }` only,
 * same as a shelf row minus rank.
 */
export async function handleMarketSearchRequest(request: Request, deps: MarketReadDeps): Promise<Response> {
  const params = new URL(request.url, 'http://localhost').searchParams;
  const q = params.get('q');
  if (!q) {
    return Response.json(
      { error: 'invalid_request', message: "Missing required 'q' query parameter." },
      { status: 400 },
    );
  }

  const limit = parseSearchLimit(params.get('limit'));
  const result = await deps.store.searchListings(q, { limit });
  if (!isOk(result)) {
    return Response.json({ error: 'store_error', message: STORE_UNAVAILABLE }, { status: 500 });
  }

  return Response.json({ data: result.value });
}

/**
 * Vercel Function handler for `GET /api/market/preview?id=`. Click-through
 * detail: installs/url/installUrl come from the stored index (`store`);
 * SKILL.md and audit status are fetched live (`client`) since we never
 * store bodies. `installCommand` uses the `owner/repo@skill` form for
 * 3-part ids (same rule as `SkillsAdapter.install`). Unknown id -> 404.
 * A failed live SKILL.md/audit fetch degrades to `null` / `none` rather
 * than failing the whole preview — the stored fields are still useful.
 */
export async function handleMarketPreviewRequest(request: Request, deps: MarketPreviewDeps): Promise<Response> {
  const id = new URL(request.url, 'http://localhost').searchParams.get('id');
  if (!id) {
    return Response.json(
      { error: 'invalid_request', message: "Missing required 'id' query parameter." },
      { status: 400 },
    );
  }

  const listing = await deps.store.getListing(id);
  if (!isOk(listing)) {
    return Response.json({ error: 'store_error', message: STORE_UNAVAILABLE }, { status: 500 });
  }
  if (listing.value === null) {
    return Response.json({ error: 'not_found', message: `Unknown skill id '${id}'.` }, { status: 404 });
  }

  const [skillMdResult, auditResult] = await Promise.all([deps.client.getSkillMd(id), deps.client.getAudit(id)]);

  return Response.json(
    {
      data: {
        id: listing.value.id,
        name: listing.value.name,
        installs: listing.value.installs,
        url: listing.value.url,
        installUrl: listing.value.installUrl,
        installCommand: `npx skills add ${toSkillsAddSource(id)}`,
        skillMd: isOk(skillMdResult) ? skillMdResult.value : null,
        audit: { status: isOk(auditResult) ? auditResult.value.status : 'none' },
      },
    },
    { headers: { 'Cache-Control': PREVIEW_CACHE_CONTROL } },
  );
}
