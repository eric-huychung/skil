/**
 * Market index — laptop operator script.
 *
 * Full fill / recrawl (needs .env + VERCEL_OIDC_TOKEN from `vercel env pull`):
 *   npm run sync-market
 *   seed → crawl the skills.sh listing (~9.7k rows) → hydrate missing details →
 *   incrementally label the pool with Jev → rebuild shelves
 *
 * Reindex shelves only (needs AI_GATEWAY_API_KEY, no OIDC):
 *   npm run sync-market -- --classify-only
 *   seed → incrementally label the pool with Jev → rebuild shelves
 *   Same path as Sunday GitHub Actions.
 *
 * Dry run (writes nothing: no seed, no crawl/hydrate, no labels, no shelves):
 *   npm run sync-market -- --classify-only --dry-run
 *   Prints the label diff and shelf-health numbers (unlabeled share, per-shelf counts and
 *   distinct owners, review band). The coverage gate reads stored labels only, so it fails
 *   until a real label run has saved them.
 *
 * Smoke hydrate:
 *   npm run sync-market -- --max-detail=40
 *
 * Backfill label excerpts (once, after the excerpt column lands; needs OIDC like a full run):
 *   npm run sync-market -- --backfill-excerpt
 *   hydrate every active row with no label_excerpt, paced like hydrate (8/s). Honors --max-detail.
 *
 * Creators report (read-only; needs only the Supabase vars, GITHUB_TOKEN optional):
 *   npm run sync-market -- --creators-report
 *   Prints the proposed 30 and a paste-ready block for data/market-creators.yaml. Writes nothing.
 *
 * Taxonomy review (read-only; needs only the Supabase vars):
 *   npm run sync-market -- --taxonomy-review
 *   Prints stored unlabeled and review-band rows. Writes nothing.
 *
 * Every other run writes `.sync-market/summary.json` (plus `$GITHUB_STEP_SUMMARY` when set)
 * and exits 0 on success, 1 on any failure.
 *
 * Safe to re-run. Classify fail → last week's shelves stay.
 * Weekly GitHub Actions runs `--classify-only` (no listing crawl, no Vercel HTTP).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getVercelOidcToken } from '@vercel/oidc';
import { createClient } from '@supabase/supabase-js';
import { err, isOk, ok, type Result } from '../src/core/result.js';
import { SEED_FIELDS, SEED_ROLES } from '../src/backend/market-seed.js';
import { MarketSync } from '../src/backend/market-sync.js';
import { RealMarketSkillsClient } from '../src/backend/market-skills-client.js';
import { SupabaseMarketStore } from '../src/backend/supabase-market-store.js';
import { loadMarketCreators } from '../src/backend/market-creators.js';
import { JevCreatorGate, printCreatorsReport } from '../src/backend/creators-report.js';
import { GatewayJevClient } from '../src/backend/jev-client.js';
import { JevSkillClassifier } from '../src/backend/jev-skill-classifier.js';
import { runJevLabelAndShelves } from '../src/backend/jev-run.js';
import { formatTaxonomyReview, readTaxonomyReview } from '../src/backend/taxonomy-review.js';

import {
  exitCodeFor,
  failureKindOf,
  formatSummaryMarkdown,
  summarize,
  type FailureKind,
  type SyncRunOutcome,
  type SyncStep,
} from '../src/backend/sync-summary.js';

/** Stay under skills.sh's 600 req/min with headroom for listing + shelf-refresh requests sharing the same budget. */
const HYDRATE_BATCH_SIZE = 8;
const HYDRATE_BATCH_DELAY_MS = 1000;
const SUMMARY_DIR = '.sync-market';
const SUMMARY_PATH = `${SUMMARY_DIR}/summary.json`;

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

function parseClassifyOnly(argv: string[]): boolean {
  return argv.includes('--classify-only');
}

function parseBackfillExcerpt(argv: string[]): boolean {
  return argv.includes('--backfill-excerpt');
}

function parseDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Drains `ids` through `sync.hydrateDetails` in paced batches, logging progress as it goes. */
async function drainHydrateQueue(sync: MarketSync, ids: string[], maxDetail: number): Promise<Result<void>> {
  const queue = ids.slice(0, maxDetail);
  if (queue.length < ids.length) {
    console.log(`--max-detail limits this run to ${queue.length} of ${ids.length}; re-run to continue.`);
  }

  let hydrated = 0;
  for (let i = 0; i < queue.length; i += HYDRATE_BATCH_SIZE) {
    const batch = queue.slice(i, i + HYDRATE_BATCH_SIZE);
    const result = await sync.hydrateDetails(batch);
    if (!isOk(result)) return err(result.error);
    hydrated += result.value.hydrated.length;
    console.log(`Hydrated ${Math.min(i + batch.length, queue.length)}/${queue.length} (${hydrated} changed)...`);
    if (i + HYDRATE_BATCH_SIZE < queue.length) {
      await sleep(HYDRATE_BATCH_DELAY_MS);
    }
  }
  return ok(undefined);
}

/** Mutable run record; `step` tracks where an unexpected throw happened. */
interface RunState {
  step: SyncStep;
  shelvesWritten: boolean;
  secrets: string[];
}

function fail(state: RunState, kind: FailureKind, error: unknown): SyncRunOutcome {
  console.error(error instanceof Error ? error.message : error);
  return {
    failure: { step: state.step, kind: failureKindOf(error, kind), error },
    shelvesWritten: state.shelvesWritten,
    secrets: state.secrets,
  };
}

function configError(state: RunState, message: string): SyncRunOutcome {
  return fail(state, 'config', new Error(message));
}

async function run(state: RunState): Promise<SyncRunOutcome> {
  loadEnvFile('.env');
  loadEnvFile('.env.local');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  state.secrets = [serviceRoleKey, gatewayKey, oidcToken].filter((value): value is string => Boolean(value));

  if (!supabaseUrl || !serviceRoleKey) {
    return configError(
      state,
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill them in.',
    );
  }
  const flags = process.argv.slice(2);
  const classifyOnly = parseClassifyOnly(flags);
  const maxDetail = parseMaxDetail(flags);
  const backfillExcerpt = parseBackfillExcerpt(flags);
  const dryRun = parseDryRun(flags);

  if (dryRun && backfillExcerpt) {
    return configError(state, '--dry-run cannot be combined with --backfill-excerpt (backfill writes excerpts).');
  }

  if (!classifyOnly && !dryRun && !oidcToken) {
    return configError(
      state,
      'Missing VERCEL_OIDC_TOKEN. Run: npm i -g vercel && vercel link && vercel env pull (writes .env.local).',
    );
  }
  if (!gatewayKey) {
    return configError(state, 'Missing AI_GATEWAY_API_KEY. Add it to .env (Vercel AI Gateway).');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const store = new SupabaseMarketStore(supabase);
  const classifier = new JevSkillClassifier(new GatewayJevClient({ fetchImpl: fetch, apiKey: gatewayKey }));
  const sync = new MarketSync({
    store,
    client: new RealMarketSkillsClient({ fetchImpl: fetch, getOidcToken: () => getVercelOidcToken() }),
    classifier,
  });

  if (backfillExcerpt) {
    state.step = 'hydrate';
    const missing = await store.listIdsMissingExcerpt();
    if (!isOk(missing)) return fail(state, 'store', missing.error);
    console.log(`Backfill: ${missing.value.length} id(s) have no label excerpt.`);
    const drained = await drainHydrateQueue(sync, missing.value, maxDetail);
    if (!isOk(drained)) return fail(state, 'unavailable', drained.error);
    console.log(`Backfill done. Processed ${Math.min(missing.value.length, maxDetail)} id(s).`);
    return { shelvesWritten: false, secrets: state.secrets };
  }

  if (dryRun) {
    state.step = 'label';
    console.log('Dry run: skip seed and listing crawl; no label or shelf writes.');
    const outcome = await runJevLabelAndShelves({ sync, store, classifier, log: (line) => console.log(line) }, { dryRun: true });
    return { ...outcome, secrets: state.secrets };
  }

  state.step = 'seed';
  console.log(`Seeding ${SEED_ROLES.length} roles / ${SEED_FIELDS.length} fields...`);
  for (const role of SEED_ROLES) {
    const result = await store.upsertRole(role);
    if (!isOk(result)) return fail(state, 'store', result.error);
  }
  for (const field of SEED_FIELDS) {
    const result = await store.upsertField(field);
    if (!isOk(result)) return fail(state, 'store', result.error);
  }

  if (!classifyOnly) {
    state.step = 'crawl';
    console.log('Crawling the full skills.sh listing...');
    const crawl = await sync.syncListing();
    if (!isOk(crawl)) return fail(state, 'unavailable', crawl.error);
    console.log(`Listing crawl done. ${crawl.value.queued.length} id(s) need detail hydrate.`);
    state.step = 'hydrate';
    const drained = await drainHydrateQueue(sync, crawl.value.queued, maxDetail);
    if (!isOk(drained)) return fail(state, 'unavailable', drained.error);
  } else {
    console.log('Classify-only: skip listing crawl.');
  }

  state.step = 'label';
  const outcome = await runJevLabelAndShelves({ sync, store, classifier, log: (line) => console.log(line) });
  state.shelvesWritten = outcome.shelvesWritten;
  if (!outcome.failure) console.log('Done.');
  return { ...outcome, secrets: state.secrets };
}

function writeSummary(outcome: SyncRunOutcome): number {
  const summary = summarize(outcome);
  try {
    mkdirSync(SUMMARY_DIR, { recursive: true });
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Summary written to ${SUMMARY_PATH} (status: ${summary.status}).`);
    const stepSummary = process.env.GITHUB_STEP_SUMMARY;
    if (stepSummary) appendFileSync(stepSummary, formatSummaryMarkdown(summary));
  } catch (error) {
    console.error(`Could not write run summary: ${error instanceof Error ? error.message : error}`);
  }
  return exitCodeFor(summary);
}

/** `--creators-report`: prints only. No summary file, no YAML writes; the only store write is the creator-check cache. */
async function creatorsReport(): Promise<number> {
  loadEnvFile('.env');
  loadEnvFile('.env.local');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill them in.');
    return 1;
  }
  if (!gatewayKey) {
    console.error('Missing AI_GATEWAY_API_KEY. Add it to .env (Vercel AI Gateway).');
    return 1;
  }
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const store = new SupabaseMarketStore(supabase);
    const jev = new GatewayJevClient({ fetchImpl: fetch, apiKey: gatewayKey });
    return await printCreatorsReport(
      {
        store,
        config: loadMarketCreators(),
        fetchImpl: fetch,
        githubToken: process.env.GITHUB_TOKEN?.trim() || undefined,
        gate: new JevCreatorGate({ jev, store, warn: (line) => console.error(line) }),
      },
      { log: (line) => console.log(line), error: (line) => console.error(line) },
    );
  } catch (error) {
    console.error(`Creators report failed: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

/** `--taxonomy-review`: reads stored labels only; no Jev, label, or shelf writes. */
async function taxonomyReviewReport(): Promise<number> {
  loadEnvFile('.env');
  loadEnvFile('.env.local');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    return 1;
  }
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const result = await readTaxonomyReview(new SupabaseMarketStore(supabase));
    if (!isOk(result)) {
      console.error(`Taxonomy review failed: ${result.error.message}`);
      return 1;
    }
    console.log(formatTaxonomyReview(result.value));
    return 0;
  } catch (error) {
    console.error(`Taxonomy review failed: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

/** Never throws: every outcome becomes a summary file and an exit code. */
async function main(): Promise<number> {
  if (process.argv.slice(2).includes('--creators-report')) return creatorsReport();
  if (process.argv.slice(2).includes('--taxonomy-review')) return taxonomyReviewReport();
  const state: RunState = { step: 'config', shelvesWritten: false, secrets: [] };
  let outcome: SyncRunOutcome;
  try {
    outcome = await run(state);
  } catch (error) {
    outcome = fail(state, state.step === 'seed' ? 'store' : 'unavailable', error);
  }
  return writeSummary(outcome);
}

void main().then((code) => {
  process.exitCode = code;
});
