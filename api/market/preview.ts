import { getVercelOidcToken } from '@vercel/oidc';
import { createClient } from '@supabase/supabase-js';
import { handleMarketPreviewRequest } from '../../dist/backend/market-read.js';
import { RealMarketSkillsClient } from '../../dist/backend/market-skills-client.js';
import { SupabaseMarketStore } from '../../dist/backend/supabase-market-store.js';

/**
 * Vercel Function entry point: `GET /api/market/preview?id=`. Thin
 * adapter — listing lookup, live SKILL.md/audit proxy, and shape live in
 * `handleMarketPreviewRequest`. Imports compiled `dist/` (not `src/*.js`)
 * for the same reason as `api/market/shelves.ts`.
 *
 * Service role key (server-only, never in `gui/` or `web/`'s client
 * bundle) — see `docs/design/architecture.md` "Secrets & runners".
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { error: 'config_error', message: 'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const store = new SupabaseMarketStore(supabase);
    const client = new RealMarketSkillsClient({ fetchImpl: fetch, getOidcToken: () => getVercelOidcToken() });
    return await handleMarketPreviewRequest(request, { store, client });
  } catch (error) {
    return Response.json({ error: 'function_error', message: (error as Error).message }, { status: 500 });
  }
}
