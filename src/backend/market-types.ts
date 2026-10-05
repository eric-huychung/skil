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
  /** Excerpt Jev reads (`label_excerpt`, capped 1,000 chars). Omitted = leave the stored excerpt unchanged. */
  labelExcerpt?: string | null;
}

/** One row on a shelf: list fields only (no description/hash/url — those are preview-only). */
export interface ShelfSkill {
  id: string;
  name: string;
  installs: number;
  rank: number;
  /** Collapsed vendor suite: this row leads `moreCount` more. Absent or 0 = not collapsed. */
  moreCount?: number;
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

/** Editorial picks file shape (`data/market-picks.yaml`). */
export interface MarketPicksFile {
  updatedAt: string;
  picks: Record<string, string[]>;
}

/** One role block from `GET /api/market/suggested` — editorial picks hydrated from the index. */
export interface SuggestedRole {
  slug: string;
  label: string;
  skills: ShelfSkill[];
}

/** Editorial shortlist grouped by role. Ids come from `data/market-picks.yaml`. */
export interface MarketSuggestedData {
  updatedAt: string;
  roles: SuggestedRole[];
}

/** One row from the classify pool (`listTopListings`). Description is the stored search excerpt, not SKILL.md. */
export interface MarketClassifyRow {
  id: string;
  name: string;
  slug: string;
  installs: number;
  description: string | null;
  hash: string | null;
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

/** One row of the `market_owner_stats` view: active skills grouped by owner. */
export interface OwnerStats {
  owner: string;
  skillCount: number;
  totalInstalls: number;
  /** Ranking key for the creators report. */
  bestInstalls: number;
}

/** One active skill for the Creators detail. `topics` = field slugs passing the threshold for the asked taxonomy version; `[]` until labels exist. */
export interface CreatorSkillRow {
  id: string;
  name: string;
  source: string;
  owner: string;
  installs: number;
  topics: string[];
}

/** One card from `GET /api/market/creators`. */
export interface CreatorCard {
  slug: string;
  label: string;
  official: boolean;
  pinned: boolean;
  skillCount: number;
  totalInstalls: number;
}

/** `GET /api/market/creators?slug=`: one creator plus their skills grouped by repo. Not deduped by name. */
export interface CreatorDetail {
  slug: string;
  label: string;
  official: boolean;
  repos: Array<{
    source: string;
    skills: Array<{ id: string; name: string; installs: number; topics: string[] }>;
  }>;
}

/** One placed skill on an assembled shelf. `moreCount` = collapsed suite size - 1 (0 = not collapsed). */
export interface ShelfEntry {
  id: string;
  moreCount: number;
}

/** One field's assembled shelf, in rank order, for `MarketStore.replaceShelves`. */
export interface AssembledShelfEntries {
  fieldSlug: string;
  entries: ShelfEntry[];
}

/** When shelves were last built (`market_shelf_meta`), and from which taxonomy version. */
export interface ShelfMeta {
  generatedAt: string;
  taxonomyVersion: string;
}

/** One active row in the label pool: everything Jev's label state is built from. */
export interface LabelPoolRow {
  id: string;
  name: string;
  source: string;
  installs: number;
  description: string | null;
  labelExcerpt: string | null;
  owner: string;
}

/** One topic question per field. The taxonomy version is the hash of the question set. */
export interface TopicQuestion {
  fieldSlug: string;
  prompt: string;
}

/** One skill's label result (`market_skill_labels` row). `probabilities` has every field when ok, `{}` when error. */
export interface SkillScore {
  id: string;
  status: 'ok' | 'error';
  probabilities: Record<string, number>;
  /** sha256 of the exact text sent to Jev. */
  stateHash: string;
  modelVersion: string;
}

/** Cached creator tech-gate result (`market_creator_checks` row). */
export interface CreatorCheck {
  /** Sorted owner aliases joined by '+', e.g. "larksuite+open.feishu.cn". */
  creatorKey: string;
  stateHash: string;
  techProbability: number;
  domain: string;
  modelVersion: string;
}
