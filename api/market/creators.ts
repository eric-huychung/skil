import { createClient } from '@supabase/supabase-js';
import { handleCreatorsRequest } from '../../dist/backend/market-read.js';
import { SupabaseMarketStore } from '../../dist/backend/supabase-market-store.js';

/**
 * Vercel Function entry point: `GET /api/market/creators?slug=`. Cards (or
 * one creator's skills by repo) from `data/market-creators.yaml` plus
 * owner stats from the index. Never calls Jev, GitHub or skills.sh.
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
    return await handleCreatorsRequest(request, { store });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'function_error', message: 'Request failed.' }, { status: 500 });
  }
}
