import { getVercelOidcToken } from '@vercel/oidc';
import { createClient } from '@supabase/supabase-js';
import { handleCronSyncRequest } from '../../dist/backend/market-cron.js';
import { RealMarketSkillsClient } from '../../dist/backend/market-skills-client.js';
import { MarketSync } from '../../dist/backend/market-sync.js';
import { SupabaseMarketStore } from '../../dist/backend/supabase-market-store.js';

/**
 * Vercel Cron entry: `GET /api/cron/sync-market` (weekly). Thin adapter —
 * bearer check, `sync({ maxDetail: 40 })`, and response shape live in
 * `handleCronSyncRequest`. Imports compiled `dist/` (not `src/*.js`) for
 * the same reason as `api/market/shelves.ts`.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that env is set.
 * Service role + OIDC stay server-only — never in `gui/` or `web/`.
 */
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let sync: MarketSync | undefined;
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
      sync = new MarketSync({
        store: new SupabaseMarketStore(supabase),
        client: new RealMarketSkillsClient({ fetchImpl: fetch, getOidcToken: () => getVercelOidcToken() }),
      });
    }

    return await handleCronSyncRequest(request, { cronSecret: process.env.CRON_SECRET, sync });
  } catch (error) {
    return Response.json({ error: 'function_error', message: (error as Error).message }, { status: 500 });
  }
}
