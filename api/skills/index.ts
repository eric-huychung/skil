import { getVercelOidcToken } from '@vercel/oidc';
import { handleBrowseRequest } from '../../src/backend/skills-proxy.js';

/**
 * Vercel Function entry point: `GET /api/skills?view=all-time|trending`.
 * Thin adapter — view validation, OIDC proxy, and CDN Cache-Control live
 * in `handleBrowseRequest`. Requires "OIDC Federation" enabled in the
 * Vercel project's dashboard settings.
 */
export default async function handler(request: Request): Promise<Response> {
  return handleBrowseRequest(request, {
    fetchImpl: fetch,
    getOidcToken: () => getVercelOidcToken(),
  });
}
