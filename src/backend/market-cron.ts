import { isOk } from '../core/result.js';
import { MarketSync } from './market-sync.js';

/** Weekly cron hydrates at most this many SKILL.md details per invocation. */
export const CRON_MAX_DETAIL = 40;

/** Never relay `result.error.message` here — it can carry raw Supabase/network error text. */
const SYNC_FAILED = 'Market index sync failed.';

export interface CronSyncDeps {
  cronSecret: string | undefined;
  /** Missing when Supabase env is not configured. Auth still 401s first. */
  sync: MarketSync | undefined;
}

function unauthorized(): Response {
  return Response.json(
    { error: 'unauthorized', message: 'Missing or invalid cron secret.' },
    { status: 401 },
  );
}

/**
 * Vercel Cron handler for the weekly market-index refresh. Auth is
 * `Authorization: Bearer $CRON_SECRET` (Vercel sets this automatically
 * when `CRON_SECRET` is in the project env). Same `MarketSync` class as
 * `scripts/sync-market.ts` (`refreshActiveFields`), but only classify +
 * `CRON_MAX_DETAIL` hydrates — not the 20k listing crawl, which times out
 * on Vercel.
 */
export async function handleCronSyncRequest(request: Request, deps: CronSyncDeps): Promise<Response> {
  const { cronSecret, sync } = deps;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return unauthorized();
  }

  if (!sync) {
    return Response.json(
      { error: 'config_error', message: 'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 },
    );
  }

  const result = await sync.sync({ maxDetail: CRON_MAX_DETAIL });
  if (!isOk(result)) {
    return Response.json({ error: 'sync_error', message: SYNC_FAILED }, { status: 500 });
  }

  return Response.json({
    hydrated: result.value.hydrated.length,
    unchanged: result.value.unchanged.length,
    listingQueued: result.value.listingQueued.length,
    refreshed: result.value.refreshed.length,
    failed: result.value.failed.length,
    shelfQueued: result.value.shelfQueued.length,
  });
}
