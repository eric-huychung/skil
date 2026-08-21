import { getVercelOidcToken } from '@vercel/oidc';
import { handleBrowseRequest } from '../../dist/backend/skills-proxy.js';

/**
 * Vercel Function entry point: `GET /api/skills?view=all-time|trending`.
 * Thin adapter — view validation, OIDC proxy, and CDN Cache-Control live
 * in `handleBrowseRequest`. Imports compiled `dist/` (not `src/*.js`)
 * because Node ESM cannot map `.js` specifiers onto `.ts` files; that
 * load-time miss is FUNCTION_INVOCATION_FAILED. Requires "OIDC Federation"
 * enabled in the Vercel project's dashboard settings.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    return await handleBrowseRequest(request, {
      fetchImpl: fetch,
      getOidcToken: () => getVercelOidcToken(),
    });
  } catch (error) {
    return Response.json({ error: 'function_error', message: (error as Error).message }, { status: 500 });
  }
}
