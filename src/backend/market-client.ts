import type { Result } from '../core/result.js';
import type { MarketListingInput } from './market-types.js';

/** One page of the skills.sh full listing crawl. */
export interface MarketListingPage {
  items: MarketListingInput[];
  /** Opaque cursor for the next page. Missing/undefined means this was the last page. */
  nextCursor?: string;
}

/** Detail-hydrate response for one skill. `files` is intentionally not modeled — we never store bodies. */
export interface MarketSkillDetail {
  description: string | null;
  /** Content hash from skills.sh (or computed from the fetched SKILL.md). */
  hash: string;
}

export type AuditStatus = 'pass' | 'warn' | 'fail' | 'none';

export interface MarketAudit {
  status: AuditStatus;
}

/** One skills.sh search result row. `isDuplicate` rows are dropped before ranking a shelf. */
export interface MarketSearchResult extends MarketListingInput {
  isDuplicate?: boolean;
}

/**
 * skills.sh operations `MarketSync` needs. Isolates sync logic from the
 * real HTTP client (`skills-proxy.ts`) so tests inject a fake — no network,
 * no OIDC.
 */
export interface MarketSkillsClient {
  /** Pages the full listing, `per_page=500`, until a page omits `nextCursor`. */
  listPage(cursor?: string): Promise<Result<MarketListingPage>>;

  /** Fetches one skill's detail (description + content hash) for hydrate. */
  getSkill(id: string): Promise<Result<MarketSkillDetail>>;

  /** Fetches one skill's audit status. A 404 from skills.sh maps to `{ status: 'none' }` by the caller. */
  getAudit(id: string): Promise<Result<MarketAudit>>;

  /** Searches skills.sh for `q`, used to build/refresh one field's shelf. */
  searchSkills(q: string, opts: { limit: number }): Promise<Result<MarketSearchResult[]>>;
}
