import type { Result } from '../core/result.js';
import type {
  AssembledShelfEntries,
  CreatorCheck,
  CreatorSkillRow,
  LabelPoolRow,
  MarketClassifyRow,
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  OwnerStats,
  ShelfMeta,
  ShelfRole,
  SkillScore,
} from './market-types.js';

export type {
  AssembledShelfEntries,
  CreatorCard,
  CreatorCheck,
  CreatorDetail,
  CreatorSkillRow,
  LabelPoolRow,
  MarketClassifyRow,
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  OwnerStats,
  ShelfEntry,
  ShelfField,
  ShelfMeta,
  ShelfRole,
  ShelfSkill,
  SkillScore,
  TopicQuestion,
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

  /** Roles → fields → skills by rank, `skills.length` \<= that field's `shelfSize`. Inactive roles/fields omitted. */
  listShelves(): Promise<Result<ShelfRole[]>>;

  /** One listing's stored fields for preview, or `null` if `id` is unknown. Description/hash are omitted — preview fetches SKILL.md live instead. */
  getListing(id: string): Promise<Result<MarketListingDetail | null>>;

  // --- T4 shelves ---

  /**
   * Replaces every shelf (rank = entry order, with `moreCount`) and the
   * shelf meta row in one transaction. On failure the old shelves stay.
   */
  replaceShelves(shelves: AssembledShelfEntries[], taxonomyVersion: string): Promise<Result<void>>;

  /** When shelves were last built and from which taxonomy version, or `null` if never. */
  getShelfMeta(): Promise<Result<ShelfMeta | null>>;

  // --- T5 owners (labels join: T19) ---

  /** `market_owner_stats` rows for `owners` (active skills only). Unknown owners are omitted. */
  listOwnerStats(owners: string[]): Promise<Result<OwnerStats[]>>;

  /** Top `limit` owners by `bestInstalls` descending, for the creators report. */
  listTopOwners(limit: number): Promise<Result<OwnerStats[]>>;

  /** Every active skill of `owners` (paged past 1,000), with topics for `taxonomyVersion`. */
  listSkillsByOwners(owners: string[], taxonomyVersion: string): Promise<Result<CreatorSkillRow[]>>;

  // --- T15b detail ---

  /** Stored hash (`null` if unknown or not hydrated) and whether `label_excerpt` is set, for `id`. */
  getDetailState(id: string): Promise<Result<{ hash: string | null; hasExcerpt: boolean }>>;

  /** Ids of active rows with no `label_excerpt` yet, for the excerpt backfill. */
  listIdsMissingExcerpt(): Promise<Result<string[]>>;

  // --- T17b labels ---

  /** Every active row Jev labels (paged past 1,000). */
  listLabelPool(): Promise<Result<LabelPoolRow[]>>;

  /** skill id -> stored state hash + status for `version`. */
  listLabelKeys(version: string): Promise<Result<Map<string, Pick<SkillScore, 'stateHash' | 'status'>>>>;

  /** Upserts `scores` for `version` (one write per call). */
  saveLabels(version: string, scores: SkillScore[]): Promise<Result<void>>;

  /** Every stored label row for `version`. */
  listLabels(version: string): Promise<Result<SkillScore[]>>;

  // --- T12a creatorChecks ---

  /** Cached tech-gate rows for `keys`. Missing keys are omitted. */
  getCreatorChecks(keys: string[]): Promise<Result<CreatorCheck[]>>;

  /** Inserts or replaces one cached tech-gate row by `creatorKey`. */
  saveCreatorCheck(check: CreatorCheck): Promise<Result<void>>;

  // --- T21 search ---

  /**
   * Searches name + description across the full index (not just shelved
   * skills). Inactive rows are excluded. `opts.limit` is the caller's
   * already-clamped 1-50 cap. Ranked by installs descending.
   */
  searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>>;
}
