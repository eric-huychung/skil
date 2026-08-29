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

/**
 * skills.sh operations `MarketSync` needs. Isolates sync logic from the
 * real HTTP client (`skills-proxy.ts`) so tests inject a fake — no network,
 * no OIDC. Shelf refresh no longer searches — it classifies our index.
 */
export interface MarketSkillsClient {
  /** Pages the full listing, `per_page=500`, until a page omits `nextCursor`. */
  listPage(cursor?: string): Promise<Result<MarketListingPage>>;

  /** Fetches one skill's detail (description + content hash) for hydrate. */
  getSkill(id: string): Promise<Result<MarketSkillDetail>>;

  /** Fetches one skill's audit status. A 404 from skills.sh maps to `{ status: 'none' }` by the caller. */
  getAudit(id: string): Promise<Result<MarketAudit>>;

  /** Fetches one skill's full SKILL.md body for preview-on-click. Never stored — DB only ever holds the capped search `description`. `null` if the skill has no SKILL.md file. */
  getSkillMd(id: string): Promise<Result<string | null>>;
}
