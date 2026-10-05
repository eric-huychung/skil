import { err, isOk, ok, type Result } from '../core/result.js';
import type { MarketSkillsClient } from './market-client.js';
import type { MarketStore } from './market-store.js';
import type { LabelPoolRow, SkillScore } from './market-types.js';
import type { SkillClassifier } from './skill-classifier.js';
import { buildShelves, OWNER_CAP, shelfTopics, type ShelfInputRow } from './shelf-assembler.js';
import { buildLabelState, stateHash } from './label-state.js';
import {
  MAX_TOPICS_PER_SKILL,
  REVIEW_BAND,
  TAXONOMY_VERSION,
  TOPIC_QUESTIONS,
  TOPIC_THRESHOLD,
} from './topic-taxonomy.js';

export interface MarketSyncDeps {
  store: MarketStore;
  client: MarketSkillsClient;
  /** Injected clock so tests control `seenAt`. Defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

/** Outcome of one full listing crawl: every id queued for detail hydrate. */
export interface CrawlListingResult {
  seenAt: string;
  /** Ids with no stored hash yet — new, or previously queued and not yet hydrated. */
  queued: string[];
}

/** Outcome of draining the detail-hydrate queue. */
export interface HydrateDetailsResult {
  /** Ids whose description/hash were written (new hydrate, or hash changed). */
  hydrated: string[];
  /** Ids skipped because the fetched hash matched what was already stored. */
  unchanged: string[];
}

/** Rows per `classify` call and per `saveLabels` upsert. */
export const LABEL_BATCH_SIZE = 100;

/** More errored rows than this share of `needed` fails the label run. */
export const MAX_ERRORED_SHARE = 0.02;

export interface LabelPoolOptions {
  /** Classify and count as usual, but write no labels. */
  dryRun?: boolean;
  batchSize?: number;
}

/** Which pool rows need a label, against stored labels for the current taxonomy version. */
export interface LabelDiff {
  /** No stored label row. */
  added: string[];
  /** Stored `state_hash` differs from the row's current label state. */
  changed: string[];
  /** Stored row has `status = 'error'`. */
  retried: string[];
}

/** Outcome of one incremental label run. */
export interface LabelRunResult {
  needed: number;
  /** Rows scored `ok` (saved, unless `dryRun`). */
  labeled: number;
  /** Rows scored `error` (saved, so the next run retries them). */
  errored: number;
  skippedUnchanged: number;
  batches: number;
  diff: LabelDiff;
}

/** `labelPool` failed because more than 2% of rows came back errored. Batches already saved stay saved. */
export class LabelPoolError extends Error {
  readonly kind = 'bad_answers' as const;

  constructor(readonly result: LabelRunResult) {
    super(`MarketSync: ${result.errored} of ${result.needed} rows errored (over ${MAX_ERRORED_SHARE * 100}%)`);
    this.name = 'LabelPoolError';
  }
}

export interface RebuildShelvesOptions {
  /** Build and report shelf health as usual, but write no shelves. */
  dryRun?: boolean;
}

/** One built shelf's health: how full it is and how much one owner dominates it. */
export interface ShelfFieldHealth {
  slug: string;
  /** Entries on the shelf (a collapsed suite counts once). */
  count: number;
  distinctOwners: number;
  /** Largest single owner's entries / `count`; 0 for an empty shelf. */
  topOwnerShare: number;
}

/** Outcome of one shelf rebuild from stored labels, with the shelf-health numbers the script prints. */
export interface ShelfRunResult {
  /** True only when `replaceShelves` ran (never on `dryRun` or a failed coverage gate). */
  written: boolean;
  reason?: 'incomplete_coverage';
  /** Active pool rows. */
  pool: number;
  /** Pool rows with no current-version label, or one whose `state_hash` no longer matches the row. */
  missing: number;
  /** Covered rows whose stored label is `status = 'error'` (they stay unlabeled). */
  errored: number;
  /** Covered rows with no active field at or above the threshold, errored rows included. */
  unlabeled: number;
  /** `unlabeled / pool`. */
  unlabeledShare: number;
  /** Covered rows with any active field's probability in `REVIEW_BAND` (low inclusive, high exclusive). */
  reviewBand: number;
  /** Per active field, in field order; empty when the coverage gate fails. */
  fields: ShelfFieldHealth[];
}

/**
 * Drives the market index sync: listing crawl, detail hydrate, inactive
 * reconciliation, and shelf refresh. `MarketStore` and `MarketSkillsClient`
 * are both injected — this class has no direct network or DB code.
 */
export class MarketSync {
  private readonly store: MarketStore;
  private readonly client: MarketSkillsClient;
  private readonly now: () => string;

  constructor(deps: MarketSyncDeps) {
    this.store = deps.store;
    this.client = deps.client;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /**
   * Pages the full skills.sh listing (`per_page=500`) until a page omits
   * `nextCursor`. Upserts every row and queues ids with no stored hash
   * (new ids, or previously-known ids never hydrated). A known id that
   * already has a hash is upserted (installs/name refresh) but not
   * re-queued.
   */
  async crawlListing(): Promise<Result<CrawlListingResult>> {
    const seenAt = this.now();
    const queued: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.client.listPage(cursor);
      if (!isOk(page)) {
        return page;
      }

      for (const item of page.value.items) {
        const upserted = await this.store.upsertListing(item, seenAt);
        if (!isOk(upserted)) {
          return upserted;
        }

        const hash = await this.store.getHash(item.id);
        if (isOk(hash) && hash.value === null) {
          queued.push(item.id);
        }
      }

      cursor = page.value.nextCursor;
    } while (cursor !== undefined);

    return ok({ seenAt, queued });
  }

  /**
   * Drains the detail-hydrate queue: fetches each id's description, hash,
   * and label excerpt and saves them, unless the fetched hash matches what
   * is already stored and an excerpt is stored too (no-op — the skill body
   * has not changed). A hash-equal row with no excerpt is re-hydrated, so
   * the excerpt backfill is this same code path, unless the fetched detail
   * has no excerpt either (null -> null: also a no-op). A fetch error for one id is
   * skipped so the rest of the queue still drains; re-running picks up
   * skipped ids again since their hash stays whatever it was before.
   *
   * Runs every id in `ids` concurrently (one `getSkill` round-trip per id
   * dominates latency, not skills.sh's rate limit — the caller already
   * paces how many ids it hands us per call, e.g.
   * `scripts/sync-market.ts`'s `HYDRATE_BATCH_SIZE`). A store write failure
   * still surfaces as an `Err`, but since work is concurrent it is the
   * first failure found in `ids` order, not necessarily the first one that
   * happened in time — the rest of the batch may still have been written.
   */
  async hydrateDetails(ids: string[]): Promise<Result<HydrateDetailsResult>> {
    const outcomes = await Promise.all(ids.map((id) => this.hydrateOne(id)));

    const hydrated: string[] = [];
    const unchanged: string[] = [];
    for (const outcome of outcomes) {
      if (!isOk(outcome)) {
        return outcome;
      }
      if (outcome.value.status === 'hydrated') hydrated.push(outcome.value.id);
      if (outcome.value.status === 'unchanged') unchanged.push(outcome.value.id);
    }

    return ok({ hydrated, unchanged });
  }

  private async hydrateOne(
    id: string,
  ): Promise<Result<{ id: string; status: 'hydrated' | 'unchanged' | 'skipped' }>> {
    const detail = await this.client.getSkill(id);
    if (!isOk(detail)) {
      return ok({ id, status: 'skipped' });
    }

    const state = await this.store.getDetailState(id);
    if (isOk(state) && state.value.hash === detail.value.hash && state.value.hasExcerpt) {
      return ok({ id, status: 'unchanged' });
    }

    // `label_excerpt` is capped at 1,000 chars whatever the client returns.
    const labelExcerpt = detail.value.labelExcerpt?.slice(0, 1_000) ?? null;

    // Same hash and still no excerpt on either side: the write would be null -> null.
    if (isOk(state) && state.value.hash === detail.value.hash && labelExcerpt === null) {
      return ok({ id, status: 'unchanged' });
    }

    const saved = await this.store.setDetail(id, {
      description: detail.value.description,
      hash: detail.value.hash,
      labelExcerpt,
    });
    if (!isOk(saved)) {
      return saved;
    }
    return ok({ id, status: 'hydrated' });
  }

  /**
   * A full listing crawl, followed by inactive reconciliation — only on a
   * complete crawl. If `crawlListing` fails partway (a page errors), this
   * returns that error and never calls `markInactiveBefore`, so a
   * mid-crawl failure cannot mass-inactivate the rest of the index.
   */
  async syncListing(): Promise<Result<CrawlListingResult>> {
    const crawl = await this.crawlListing();
    if (!isOk(crawl)) {
      return crawl;
    }

    const reconciled = await this.store.markInactiveBefore(crawl.value.seenAt);
    if (!isOk(reconciled)) {
      return reconciled;
    }

    return crawl;
  }

  /**
   * Rebuilds every active field's shelf from stored labels (design §4.5).
   * Coverage gate first: every active pool row needs a `TAXONOMY_VERSION`
   * label whose `state_hash` matches the row (`ok` or `error`; an errored
   * row is simply unlabeled). Any gap returns `written: false` with
   * `reason: 'incomplete_coverage'` and leaves the shelves untouched.
   * Otherwise `buildShelves` → one `replaceShelves` call stamped with
   * `TAXONOMY_VERSION`. An empty pool fails closed.
   */
  async rebuildShelves(opts: RebuildShelvesOptions = {}): Promise<Result<ShelfRunResult>> {
    const pool = await this.store.listLabelPool();
    if (!isOk(pool)) {
      return pool;
    }
    if (pool.value.length === 0) {
      return err(new Error('MarketSync: label pool is empty'));
    }
    const labels = await this.store.listLabels(TAXONOMY_VERSION);
    if (!isOk(labels)) {
      return labels;
    }
    const fields = await this.store.listActiveFields();
    if (!isOk(fields)) {
      return fields;
    }

    const labelById = new Map(labels.value.map((score) => [score.id, score]));
    const covered: Array<{ row: LabelPoolRow; score: SkillScore }> = [];
    for (const row of pool.value) {
      const score = labelById.get(row.id);
      if (score && score.stateHash === stateHash(buildLabelState(row))) {
        covered.push({ row, score });
      }
    }

    const known = new Set(fields.value.map((field) => field.slug));
    const inputs = covered.map(({ row, score }) => toShelfInputRow(row, score));
    const unlabeled = inputs.filter(
      (row) => shelfTopics(row.probabilities, known, TOPIC_THRESHOLD, MAX_TOPICS_PER_SKILL).length === 0,
    ).length;
    const counts = {
      pool: pool.value.length,
      missing: pool.value.length - covered.length,
      errored: covered.filter(({ score }) => score.status === 'error').length,
      unlabeled,
      unlabeledShare: unlabeled / pool.value.length,
      reviewBand: inputs.filter((row) => inReviewBand(row.probabilities, known)).length,
    };
    if (counts.missing > 0) {
      return ok({ written: false, reason: 'incomplete_coverage', ...counts, fields: [] });
    }

    const shelves = buildShelves({
      rows: inputs,
      fields: fields.value,
      threshold: TOPIC_THRESHOLD,
      maxTopics: MAX_TOPICS_PER_SKILL,
      ownerCap: OWNER_CAP,
    });
    const ownerById = new Map(inputs.map((row) => [row.id, row.owner.toLowerCase()]));
    const health = shelves.map((shelf) =>
      shelfHealth(
        shelf.fieldSlug,
        shelf.entries.map((entry) => ownerById.get(entry.id) ?? ''),
      ),
    );

    if (opts.dryRun) {
      return ok({ written: false, ...counts, fields: health });
    }
    const written = await this.store.replaceShelves(shelves, TAXONOMY_VERSION);
    if (!isOk(written)) {
      return written;
    }
    return ok({ written: true, ...counts, fields: health });
  }

  /**
   * Incremental labeling (design §4.5). A pool row needs a label when it has
   * no stored label for `TAXONOMY_VERSION`, its stored `state_hash` differs,
   * or its stored status is `error`. Those rows are classified in batches and
   * each batch is saved as it completes, so a failed batch returns `Err` with
   * earlier batches kept, and the next run resumes past them for free.
   * More than 2% errored rows returns `Err` with kind `bad_answers`.
   */
  async labelPool(classifier: SkillClassifier, opts: LabelPoolOptions = {}): Promise<Result<LabelRunResult>> {
    const batchSize = opts.batchSize ?? LABEL_BATCH_SIZE;

    const pool = await this.store.listLabelPool();
    if (!isOk(pool)) {
      return pool;
    }
    const keys = await this.store.listLabelKeys(TAXONOMY_VERSION);
    if (!isOk(keys)) {
      return keys;
    }

    const diff: LabelDiff = { added: [], changed: [], retried: [] };
    const needed: LabelPoolRow[] = [];
    for (const row of pool.value) {
      const stored = keys.value.get(row.id);
      const bucket =
        stored === undefined
          ? diff.added
          : stored.stateHash !== stateHash(buildLabelState(row))
            ? diff.changed
            : stored.status === 'error'
              ? diff.retried
              : null;
      if (bucket) {
        bucket.push(row.id);
        needed.push(row);
      }
    }

    const result: LabelRunResult = {
      needed: needed.length,
      labeled: 0,
      errored: 0,
      skippedUnchanged: pool.value.length - needed.length,
      batches: 0,
      diff,
    };

    for (let start = 0; start < needed.length; start += batchSize) {
      const scores = await classifier.classify(needed.slice(start, start + batchSize), TOPIC_QUESTIONS);
      if (!isOk(scores)) {
        return scores;
      }
      if (!opts.dryRun) {
        const saved = await this.store.saveLabels(TAXONOMY_VERSION, scores.value);
        if (!isOk(saved)) {
          return saved;
        }
      }

      result.batches += 1;
      for (const score of scores.value) {
        if (score.status === 'ok') result.labeled += 1;
        else result.errored += 1;
      }
      if (result.errored / result.needed > MAX_ERRORED_SHARE) {
        return err(new LabelPoolError(result));
      }
    }

    return ok(result);
  }
}

/** A pool row with its label's probabilities; a missing or errored label has none, so the row is unlabeled. */
function toShelfInputRow(row: LabelPoolRow, score: SkillScore | undefined): ShelfInputRow {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    owner: row.owner,
    installs: row.installs,
    probabilities: score?.status === 'ok' ? score.probabilities : {},
  };
}

/** Any active field's probability in `[REVIEW_BAND.low, REVIEW_BAND.high)`. */
function inReviewBand(probabilities: Record<string, number>, known: ReadonlySet<string>): boolean {
  return Object.entries(probabilities).some(
    ([slug, p]) => known.has(slug) && p >= REVIEW_BAND.low && p < REVIEW_BAND.high,
  );
}

function shelfHealth(slug: string, owners: string[]): ShelfFieldHealth {
  const perOwner = new Map<string, number>();
  for (const owner of owners) {
    perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);
  }
  const top = Math.max(0, ...perOwner.values());
  return {
    slug,
    count: owners.length,
    distinctOwners: perOwner.size,
    topOwnerShare: owners.length === 0 ? 0 : top / owners.length,
  };
}
