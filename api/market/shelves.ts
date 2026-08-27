import { createClient } from '@supabase/supabase-js';
import { handleShelvesRequest } from '../../dist/backend/market-read.js';
import { SupabaseMarketStore } from '../../dist/backend/supabase-market-store.js';

/**
 * Vercel Function entry point: `GET /api/market/shelves`. Thin adapter —
 * grouping, shape, and Cache-Control live in `handleShelvesRequest`.
 * Imports compiled `dist/` (not `src/*.js`) for the same reason as
 * `api/skills/index.ts`: Node ESM cannot map `.js` specifiers onto `.ts`
 * files, and that load-time miss is FUNCTION_INVOCATION_FAILED.
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
    return await handleShelvesRequest(request, { store });
  } catch (error) {
    return Response.json({ error: 'function_error', message: (error as Error).message }, { status: 500 });
  }
}
