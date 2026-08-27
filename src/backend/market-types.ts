/** A role leaf shown on Discover, e.g. "SWE", "PM". Rows in `market_roles`. */
export interface MarketRole {
  slug: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

/**
 * A category under a role, e.g. "Frontend" under "SWE". Rows in
 * `market_fields`. `q` is the search query `MarketSync` uses to refresh
 * this field's shelf. `shelfSize` caps how many ranked skills it holds.
 */
export interface MarketField {
  slug: string;
  roleSlug: string;
  label: string;
  q: string;
  sortOrder: number;
  shelfSize: number;
  active: boolean;
}

/** Listing-page fields for one skill. No description or hash — those come from detail hydrate. */
export interface MarketListingInput {
  id: string;
  name: string;
  slug: string;
  source: string;
  installs: number;
  /** Nullable: some real skills.sh listing rows omit this (see 0002 migration). */
  installUrl: string | null;
  url: string;
}

/** Detail-hydrate fields for one skill: search-only description + content hash. */
export interface MarketDetailInput {
  description: string | null;
  hash: string;
}

/** One row on a shelf: list fields only (no description/hash/url — those are preview-only). */
export interface ShelfSkill {
  id: string;
  name: string;
  installs: number;
  rank: number;
}

export interface ShelfField {
  slug: string;
  label: string;
  skills: ShelfSkill[];
}

export interface ShelfRole {
  slug: string;
  label: string;
  fields: ShelfField[];
}

/** One row from `MarketStore.searchListings`: list fields only, same shape as `ShelfSkill` minus rank (search has no rank concept). */
export interface MarketSearchRow {
  id: string;
  name: string;
  installs: number;
}

/** One row from `MarketStore.getListing`: preview's non-live fields (installs/urls come from the stored index; SKILL.md/audit are fetched live). */
export interface MarketListingDetail {
  id: string;
  name: string;
  installs: number;
  url: string;
  installUrl: string | null;
}
