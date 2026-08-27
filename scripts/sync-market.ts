/**
 * First-fill / resumable sync for the market index (Task 8,
 * `tasks/plan.md`). Not a 60s Vercel function — meant to run locally
 * (`npm run sync-market`, `.env` + `vercel env pull` for
 * `VERCEL_OIDC_TOKEN`) or as a one-off GitHub Action. Safe to re-run:
 * `syncListing` re-discovers every id whose hash is still null, so a
 * killed run just picks back up.
 *
 * Steps: seed roles/fields from `market-seed.ts` -> full listing crawl +
 * inactive reconcile -> drain the detail-hydrate queue (paced under
 * skills.sh's 600 req/min) -> refresh every active field's shelf.
 *
 * Flags: `--max-detail=N` caps how many queued ids this run hydrates
 * (for a small local smoke run); default drains the whole queue.
 */
import { existsSync, readFileSync } from 'node:fs';
import { getVercelOidcToken } from '@vercel/oidc';
import { createClient } from '@supabase/supabase-js';
import { isOk } from '../src/core/result.js';
import { SEED_FIELDS, SEED_ROLES } from '../src/backend/market-seed.js';
import { RealMarketSkillsClient } from '../src/backend/market-skills-client.js';
import { MarketSync } from '../src/backend/market-sync.js';
import { SupabaseMarketStore } from '../src/backend/supabase-market-store.js';

/** Stay under skills.sh's 600 req/min with headroom for listing + shelf-refresh requests sharing the same budget. */
const HYDRATE_BATCH_SIZE = 8;
const HYDRATE_BATCH_DELAY_MS = 1000;

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseMaxDetail(argv: string[]): number {
  const flag = argv.find((arg) => arg.startsWith('--max-detail='));
  if (!flag) return Number.POSITIVE_INFINITY;
  const value = Number(flag.split('=')[1]);
  return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Drains `ids` through `sync.hydrateDetails` in paced batches, logging progress as it goes. */
async function drainHydrateQueue(sync: MarketSync, ids: string[], maxDetail: number): Promise<void> {
  const queue = ids.slice(0, maxDetail);
  if (queue.length < ids.length) {
    console.log(`--max-detail limits this run to ${queue.length} of ${ids.length}; re-run to continue.`);
  }

  let hydrated = 0;
  for (let i = 0; i < queue.length; i += HYDRATE_BATCH_SIZE) {
    const batch = queue.slice(i, i + HYDRATE_BATCH_SIZE);
    const result = await sync.hydrateDetails(batch);
    if (!isOk(result)) throw result.error;
    hydrated += result.value.hydrated.length;
    console.log(`Hydrated ${Math.min(i + batch.length, queue.length)}/${queue.length} (${hydrated} changed)...`);
    if (i + HYDRATE_BATCH_SIZE < queue.length) {
      await sleep(HYDRATE_BATCH_DELAY_MS);
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile('.env');
  loadEnvFile('.env.local');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill them in.',
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.VERCEL_OIDC_TOKEN) {
    console.error(
      'Missing VERCEL_OIDC_TOKEN. Run: npm i -g vercel && vercel link && vercel env pull (writes .env.local).',
    );
    process.exitCode = 1;
    return;
  }

  const maxDetail = parseMaxDetail(process.argv.slice(2));

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const store = new SupabaseMarketStore(supabase);
  const client = new RealMarketSkillsClient({ fetchImpl: fetch, getOidcToken: () => getVercelOidcToken() });
  const sync = new MarketSync({ store, client });

  console.log(`Seeding ${SEED_ROLES.length} roles / ${SEED_FIELDS.length} fields...`);
  for (const role of SEED_ROLES) {
    const result = await store.upsertRole(role);
    if (!isOk(result)) throw result.error;
  }
  for (const field of SEED_FIELDS) {
    const result = await store.upsertField(field);
    if (!isOk(result)) throw result.error;
  }

  console.log('Crawling the full skills.sh listing...');
  const crawl = await sync.syncListing();
  if (!isOk(crawl)) throw crawl.error;
  console.log(`Listing crawl done. ${crawl.value.queued.length} id(s) need detail hydrate.`);

  await drainHydrateQueue(sync, crawl.value.queued, maxDetail);

  console.log('Refreshing shelves for every active field...');
  const shelves = await sync.refreshActiveFields();
  if (!isOk(shelves)) throw shelves.error;
  console.log(`Shelves refreshed: ${shelves.value.refreshed.length} ok, ${shelves.value.failed.length} failed.`);
  if (shelves.value.failed.length > 0) {
    console.log(`Failed fields: ${shelves.value.failed.join(', ')}`);
  }

  // Search can surface an id `syncListing`'s paginated crawl never sees (skills.sh's
  // search index and its listing endpoint are not guaranteed to agree). Without this,
  // that id would sit on a shelf with no description forever, no matter how many
  // times the script re-runs.
  if (shelves.value.queued.length > 0) {
    console.log(`Shelf refresh found ${shelves.value.queued.length} more id(s) with no hash (search-only, not in the listing)...`);
    await drainHydrateQueue(sync, shelves.value.queued, maxDetail);
  }

  console.log('Done.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
