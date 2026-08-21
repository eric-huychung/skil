import { getVercelOidcToken } from '@vercel/oidc';
import { isOk } from '../../src/core/result.js';
import { searchSkills } from '../../src/backend/skills-proxy.js';

/**
 * Vercel Function entry point: `GET /api/skills/search?q=<query>`.
 * Thin adapter — all real logic (auth, error mapping) lives in
 * `searchSkills`. Requires "OIDC Federation" enabled in the Vercel
 * project's dashboard settings; that's a one-time manual step, not
 * something this code can turn on itself.
 */
export default async function handler(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get('q');
  if (!query) {
    return Response.json({ error: 'invalid_request', message: "Missing required 'q' query parameter." }, { status: 400 });
  }

  const result = await searchSkills(query, {
    fetchImpl: fetch,
    getOidcToken: () => getVercelOidcToken(),
  });

  if (!isOk(result)) {
    return Response.json({ error: 'upstream_error', message: result.error.message }, { status: 502 });
  }

  return Response.json(result.value);
}
