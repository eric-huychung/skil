import type { Result } from '../core/result.js';
import type {
  MarketClassifyRow,
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  ShelfRole,
} from './market-types.js';

export type {
  MarketClassifyRow,
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  ShelfField,
  ShelfRole,
  ShelfSkill,
} from './market-types.js';

/**
 * Persists the market index: roles, fields (categories), listing rows, and
 * per-field ranks. `InMemoryMarketStore` backs tests; `SupabaseMarketStore`
 * backs prod. `MarketSync` and the read handlers only see this interface.
 */
export interface MarketStore {
  /** Inserts or updates one role by slug. */
  upsertRole(role: MarketRole): Promise<Result<void>>;

  /** Inserts or updates one field by slug. */
  upsertField(field: MarketField): Promise<Result<void>>;

  /** Active fields only, for `MarketSync` to refresh shelves from — not a hardcoded list. */
  listActiveFields(): Promise<Result<MarketField[]>>;

  /**
   * Classify pool: active rows, installs descending, includes description
   * and hash. No new index — 10k rows is a plain sort + limit.
   */
  listTopListings(limit: number): Promise<Result<MarketClassifyRow[]>>;

  /**
   * Upserts installs/name/slug/url/`installUrl` and marks the row seen at
   * `seenAt` (active). Never touches `description`/`hash` — those come
   * from detail hydrate.
   */
  upsertListing(listing: MarketListingInput, seenAt: string): Promise<Result<void>>;

  /** Current stored hash for `id`, or `null` if the id is unknown or not yet hydrated. */
  getHash(id: string): Promise<Result<string | null>>;

  /** Saves description + hash for `id` from detail hydrate. No-op if `id` is unknown. */
  setDetail(id: string, detail: MarketDetailInput): Promise<Result<void>>;

  /**
   * Marks every row last seen strictly before `seenAt` as inactive, and
   * every row seen at/after `seenAt` as active. Call once after a full
   * listing crawl completes — never on a partial/failed crawl, or it
   * would mass-inactivate.
   */
  markInactiveBefore(seenAt: string): Promise<Result<void>>;

  /** Replaces one field's shelf with `rankedSkillIds` in order (rank 1..N). */
  setFieldShelf(fieldSlug: string, rankedSkillIds: string[]): Promise<Result<void>>;

  /** Roles → fields → skills by rank, `skills.length` \<= that field's `shelfSize`. Inactive roles/fields omitted. */
  listShelves(): Promise<Result<ShelfRole[]>>;

  /**
   * Searches name + description across the full index (not just shelved
   * skills). Inactive rows are excluded. `opts.limit` is the caller's
   * already-clamped 1-50 cap. Ranked by installs descending.
   */
  searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>>;

  /** One listing's stored fields for preview, or `null` if `id` is unknown. Description/hash are omitted — preview fetches SKILL.md live instead. */
  getListing(id: string): Promise<Result<MarketListingDetail | null>>;
}
