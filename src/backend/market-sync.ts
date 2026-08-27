import { isOk, ok, type Result } from '../core/result.js';
import type { MarketSkillsClient } from './market-client.js';
import type { MarketStore } from './market-store.js';

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

/** Outcome of refreshing every active field's shelf. */
export interface RefreshShelvesResult {
  /** Field slugs whose shelf was rewritten. */
  refreshed: string[];
  /** Field slugs skipped because their search request failed. */
  failed: string[];
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
   * Drains the detail-hydrate queue: fetches each id's description + hash
   * and saves it, unless the fetched hash matches what is already stored
   * (no-op — the skill body has not changed). A fetch error for one id is
   * skipped so the rest of the queue still drains; re-running picks up
   * skipped ids again since their hash stays whatever it was before.
   */
  async hydrateDetails(ids: string[]): Promise<Result<HydrateDetailsResult>> {
    const hydrated: string[] = [];
    const unchanged: string[] = [];

    for (const id of ids) {
      const detail = await this.client.getSkill(id);
      if (!isOk(detail)) {
        continue;
      }

      const currentHash = await this.store.getHash(id);
      if (isOk(currentHash) && currentHash.value === detail.value.hash) {
        unchanged.push(id);
        continue;
      }

      const saved = await this.store.setDetail(id, detail.value);
      if (!isOk(saved)) {
        return saved;
      }
      hydrated.push(id);
    }

    return ok({ hydrated, unchanged });
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
   * Refreshes every active field's shelf: search `field.q`, drop
   * `isDuplicate` rows, rank by installs descending, keep the top
   * `field.shelfSize`. Fields load from the store — not a hardcoded list —
   * so a newly-added active field is picked up with no code change. A
   * field whose search fails is skipped; the rest still refresh.
   */
  async refreshActiveFields(): Promise<Result<RefreshShelvesResult>> {
    const fields = await this.store.listActiveFields();
    if (!isOk(fields)) {
      return fields;
    }

    const seenAt = this.now();
    const refreshed: string[] = [];
    const failed: string[] = [];

    for (const field of fields.value) {
      const search = await this.client.searchSkills(field.q, { limit: field.shelfSize });
      if (!isOk(search)) {
        failed.push(field.slug);
        continue;
      }

      const ranked = search.value
        .filter((item) => !item.isDuplicate)
        .sort((a, b) => b.installs - a.installs)
        .slice(0, field.shelfSize);

      for (const item of ranked) {
        const upserted = await this.store.upsertListing(item, seenAt);
        if (!isOk(upserted)) {
          return upserted;
        }
      }

      const shelved = await this.store.setFieldShelf(field.slug, ranked.map((item) => item.id));
      if (!isOk(shelved)) {
        return shelved;
      }
      refreshed.push(field.slug);
    }

    return ok({ refreshed, failed });
  }
}
