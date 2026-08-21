import type { BrowseView } from '../types/index.js';
import { err, isOk, ok, type Result } from '../core/result.js';

const SKILLS_SH_SEARCH_URL = 'https://skills.sh/api/v1/skills/search';
const SKILLS_SH_BROWSE_URL = 'https://skills.sh/api/v1/skills';
const BROWSE_CACHE_CONTROL = 'public, s-maxage=86400, stale-while-revalidate=3600';

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

interface SkillsSearchErrorBody {
  error?: string;
  message?: string;
}

/**
 * Calls skills.sh's search endpoint on behalf of the CLI, authenticating
 * with this deployment's Vercel OIDC token instead of a shared API key.
 * Runs server-side only (inside a Vercel Function) since only a Vercel
 * deployment can mint this token.
 */
export async function searchSkills(query: string, deps: SkillsProxyDeps): Promise<Result<unknown>> {
  const url = `${SKILLS_SH_SEARCH_URL}?q=${encodeURIComponent(query)}`;

  let response: Response;
  try {
    const token = await deps.getOidcToken();
    response = await deps.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return err(new Error(`Failed to reach skills.sh: ${(error as Error).message}`));
  }

  const body = await response.json();
  if (!response.ok) {
    const errorBody = body as SkillsSearchErrorBody;
    return err(new Error(errorBody.message ?? `skills.sh returned ${response.status}`));
  }

  return ok(body);
}

/**
 * Calls skills.sh's leaderboard endpoint (all-time or trending) with this
 * deployment's Vercel OIDC token. Always requests `per_page=20` so CLI
 * (display 10) and GUI (display 20) share one CDN cache key per view.
 */
export async function browseSkills(view: BrowseView, deps: SkillsProxyDeps): Promise<Result<unknown>> {
  const url = `${SKILLS_SH_BROWSE_URL}?view=${encodeURIComponent(view)}&per_page=20`;

  let response: Response;
  try {
    const token = await deps.getOidcToken();
    response = await deps.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    return err(new Error(`Failed to reach skills.sh: ${(error as Error).message}`));
  }

  const body = await response.json();
  if (!response.ok) {
    const errorBody = body as SkillsSearchErrorBody;
    return err(new Error(errorBody.message ?? `skills.sh returned ${response.status}`));
  }

  return ok(body);
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
    return Response.json({ error: 'upstream_error', message: result.error.message }, { status: 502 });
  }

  return Response.json(result.value, {
    headers: { 'Cache-Control': BROWSE_CACHE_CONTROL },
  });
}
