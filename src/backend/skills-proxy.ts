import type { BrowseView } from '../types/index.js';
import { err, isOk, ok, type Result } from '../core/result.js';

const SKILLS_SH_SEARCH_URL = 'https://skills.sh/api/v1/skills/search';
const SKILLS_SH_BROWSE_URL = 'https://skills.sh/api/v1/skills';
const BROWSE_CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=3600';
/** Search is open to the public: a short CDN cache absorbs repeat queries so they can't drain the skills.sh / Supabase budget. */
export const SEARCH_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';
/** Real queries are a few words; anything longer is noise or abuse. */
export const MAX_SEARCH_QUERY_LENGTH = 200;
/** Client-facing 502 copy. Never relay skills.sh / gateway HTML or error text. */
const UPSTREAM_UNAVAILABLE = 'skills.sh unavailable.';

export type { BrowseView };

/**
 * Dependencies for the skills.sh proxy, injected so tests never make real
 * network calls or need a real Vercel deployment.
 */
export interface SkillsProxyDeps {
  fetchImpl: typeof fetch;
  /** Mints a short-lived Vercel OIDC token, verified by skills.sh against oidc.vercel.com. */
  getOidcToken: () => Promise<string>;
}

/**
 * A gateway 502/HTML page makes `response.json()` throw. Treat that the
 * same as any other upstream failure so Vercel never 500s on parse.
 */
async function parseJsonBody(response: Response): Promise<Result<unknown>> {
  try {
    return ok(await response.json());
  } catch {
    return err(new Error(`skills.sh returned a non-JSON response (status ${response.status})`));
  }
}

function upstreamErrorResponse(error: Error): Response {
  console.error(error);
  return Response.json({ error: 'upstream_error', message: UPSTREAM_UNAVAILABLE }, { status: 502 });
}

async function fetchSkillsSh(url: string, deps: SkillsProxyDeps): Promise<Result<unknown>> {
  let response: Response;
  try {
    const token = await deps.getOidcToken();
    response = await deps.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return err(new Error(`Failed to reach skills.sh: ${(error as Error).message}`));
  }

  const parsed = await parseJsonBody(response);
  if (!isOk(parsed)) {
    return parsed;
  }
  if (!response.ok) {
    return err(new Error(`skills.sh returned ${response.status}`));
  }
  return ok(parsed.value);
}

/**
 * Calls skills.sh's search endpoint on behalf of the CLI, authenticating
 * with this deployment's Vercel OIDC token instead of a shared API key.
 * Runs server-side only (inside a Vercel Function) since only a Vercel
 * deployment can mint this token.
 */
export async function searchSkills(query: string, deps: SkillsProxyDeps): Promise<Result<unknown>> {
  return fetchSkillsSh(`${SKILLS_SH_SEARCH_URL}?q=${encodeURIComponent(query)}`, deps);
}

/**
 * Calls skills.sh's leaderboard endpoint (all-time or trending) with this
 * deployment's Vercel OIDC token. Always requests `per_page=500` (skills.sh
 * max) so CLI (display 10) and GUI (display 500) share one CDN cache key
 * per view. 500 is also the local type-to-filter corpus.
 */
export async function browseSkills(view: BrowseView, deps: SkillsProxyDeps): Promise<Result<unknown>> {
  return fetchSkillsSh(
    `${SKILLS_SH_BROWSE_URL}?view=${encodeURIComponent(view)}&per_page=500`,
    deps,
  );
}

/**
 * Vercel Function handler for `GET /api/skills?view=all-time|trending`.
 * Validates `view`, proxies via `browseSkills`, and sets CDN cache headers
 * on 200 only. Search (`GET /api/skills/search`) is a separate route and
 * must not pick up these headers.
 */
export async function handleBrowseRequest(request: Request, deps: SkillsProxyDeps): Promise<Response> {
  // request.url may be relative in Vercel production; provide a dummy base to parse params
  const view = new URL(request.url, 'http://localhost').searchParams.get('view');
  if (view !== 'all-time' && view !== 'trending') {
    return Response.json(
      { error: 'invalid_request', message: "Missing or invalid 'view' query parameter. Expected 'all-time' or 'trending'." },
      { status: 400 },
    );
  }

  const result = await browseSkills(view, deps);
  if (!isOk(result)) {
    return upstreamErrorResponse(result.error);
  }

  return Response.json(result.value, {
    headers: { 'Cache-Control': BROWSE_CACHE_CONTROL },
  });
}

/**
 * Vercel Function handler for `GET /api/skills/search?q=`. Same OIDC proxy
 * as browse, with a short CDN cache on 200 only. `q` is capped at
 * `MAX_SEARCH_QUERY_LENGTH`. 502 body stays generic.
 */
export async function handleSearchRequest(request: Request, deps: SkillsProxyDeps): Promise<Response> {
  const query = new URL(request.url, 'http://localhost').searchParams.get('q');
  if (!query) {
    return Response.json({ error: 'invalid_request', message: "Missing required 'q' query parameter." }, { status: 400 });
  }
  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    return Response.json(
      { error: 'invalid_request', message: `'q' must be at most ${MAX_SEARCH_QUERY_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const result = await searchSkills(query, deps);
  if (!isOk(result)) {
    return upstreamErrorResponse(result.error);
  }

  return Response.json(result.value, { headers: { 'Cache-Control': SEARCH_CACHE_CONTROL } });
}
