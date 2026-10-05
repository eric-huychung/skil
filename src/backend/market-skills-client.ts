import { createHash } from 'node:crypto';
import { err, isOk, ok, type Result } from '../core/result.js';
import type {
  AuditStatus,
  MarketAudit,
  MarketListingPage,
  MarketSkillDetail,
  MarketSkillsClient,
} from './market-client.js';
import type { MarketListingInput } from './market-types.js';
import { parseSkillDescription, parseSkillExcerpt } from './parse-skill-description.js';

const SKILLS_SH_SKILLS_URL = 'https://skills.sh/api/v1/skills';
/** skills.sh max per page (docs: "Results per page, 1-500"). */
const LISTING_PER_PAGE = 500;
/** One stalled request must not block a whole batch, so each attempt is bounded. */
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Retries after the first attempt (3 attempts total). */
const DEFAULT_MAX_RETRIES = 2;
/** Backoff before retry n is `base * 2^n`: 500ms, then 1s. */
const DEFAULT_RETRY_BACKOFF_MS = 500;

export interface MarketSkillsClientDeps {
  fetchImpl: typeof fetch;
  /** Mints a short-lived Vercel OIDC token, verified by skills.sh against oidc.vercel.com. */
  getOidcToken: () => Promise<string>;
  /** Per-attempt timeout; a timeout is retried like a network error. */
  requestTimeoutMs?: number;
  /** Retries for timeouts, network errors, 429 and 5xx. Other 4xx are never retried. */
  maxRetries?: number;
  retryBackoffMs?: number;
  /** Injectable so tests don't actually wait between attempts. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * `getSkill`'s result: the `MarketSkillDetail` contract plus the label
 * excerpt (design §4.3), parsed from the same already-fetched SKILL.md.
 */
export interface MarketSkillDetailWithExcerpt extends MarketSkillDetail {
  labelExcerpt: string | null;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
}

interface ListingApiRow {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  installUrl: string | null;
  url: string;
  isDuplicate?: boolean;
}

interface ListingApiResponse {
  data: ListingApiRow[];
  pagination: { page: number; perPage: number; total: number; hasMore: boolean };
}

interface SkillDetailApiResponse {
  id: string;
  source: string;
  slug: string;
  installs: number;
  /** Null "if no snapshot exists" per skills.sh docs — we fall back to hashing SKILL.md ourselves. */
  hash: string | null;
  files: Array<{ path: string; contents: string }> | null;
}

interface AuditApiResponse {
  id: string;
  source: string;
  slug: string;
  audits: Array<{ provider: string; slug: string; status: string; summary: string; auditedAt: string; riskLevel?: string }>;
}

const AUDIT_SEVERITY: Record<Exclude<AuditStatus, 'none'>, number> = { pass: 0, warn: 1, fail: 2 };

function toListingInput(row: ListingApiRow): MarketListingInput {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    source: row.source,
    installs: row.installs,
    installUrl: row.installUrl,
    url: row.url,
  };
}

function sha256Hex(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

/**
 * A gateway hiccup (Vercel/Cloudflare 502/503, rate-limit page, etc.) can
 * return an HTML error page instead of JSON. `response.json()` throws on
 * that, and an uncaught throw here would crash the whole sync run instead
 * of just failing this one id — so treat a parse failure the same as any
 * other upstream error.
 */
async function parseJsonBody(response: Response): Promise<Result<unknown>> {
  try {
    return ok(await response.json());
  } catch {
    return err(new Error(`skills.sh returned a non-JSON response (status ${response.status})`));
  }
}

/** Worst-of reduction across every partner's audit: fail > warn > pass. No audits at all is `none`. */
function worstAuditStatus(statuses: string[]): AuditStatus {
  let worst: Exclude<AuditStatus, 'none'> | undefined;
  for (const raw of statuses) {
    const status = raw === 'pass' || raw === 'warn' || raw === 'fail' ? raw : undefined;
    if (status && (worst === undefined || AUDIT_SEVERITY[status] > AUDIT_SEVERITY[worst])) {
      worst = status;
    }
  }
  return worst ?? 'none';
}

/**
 * Real `MarketSkillsClient` against skills.sh's documented API
 * (https://www.skills.sh/docs/api), authenticated with this deployment's
 * (or `vercel env pull`-ed local) Vercel OIDC token — same pattern as
 * `skills-proxy.ts`. Listing is page-based (not cursor-based); `listPage`'s
 * `cursor` is the next page number as a string so it still satisfies
 * `MarketSkillsClient`'s opaque-cursor contract. `getSkill` has no
 * `description` field on the wire — it comes from parsing the `SKILL.md`
 * entry in `files` with `parseSkillDescription`; `labelExcerpt` comes from
 * the same entry via `parseSkillExcerpt` (no extra request). `hash` is only null when
 * skills.sh has no snapshot; hashing the fetched `SKILL.md` ourselves
 * keeps hydrate's hash-diff working either way.
 */
export class RealMarketSkillsClient implements MarketSkillsClient {
  constructor(private readonly deps: MarketSkillsClientDeps) {}

  async listPage(cursor?: string): Promise<Result<MarketListingPage>> {
    const page = cursor === undefined ? 0 : Number(cursor);
    const url = `${SKILLS_SH_SKILLS_URL}?view=all-time&page=${page}&per_page=${LISTING_PER_PAGE}`;

    const result = await this.get<ListingApiResponse>(url);
    if (!isOk(result)) {
      return result;
    }

    return ok({
      items: result.value.data.map(toListingInput),
      nextCursor: result.value.pagination.hasMore ? String(page + 1) : undefined,
    });
  }

  async getSkill(id: string): Promise<Result<MarketSkillDetailWithExcerpt>> {
    // The id is already "{source}/{slug}", which is the full detail path.
    const result = await this.get<SkillDetailApiResponse>(`${SKILLS_SH_SKILLS_URL}/${id}`);
    if (!isOk(result)) {
      return result;
    }

    const skillMd = result.value.files?.find((file) => file.path === 'SKILL.md');
    const description = skillMd ? parseSkillDescription(skillMd.contents) : null;
    const labelExcerpt = skillMd ? parseSkillExcerpt(skillMd.contents) : null;
    const hash = result.value.hash ?? sha256Hex(skillMd?.contents ?? id);

    return ok({ description, hash, labelExcerpt });
  }

  /** Same detail endpoint as `getSkill`, but returns the raw SKILL.md text instead of the parsed description — for preview display, never for storage. */
  async getSkillMd(id: string): Promise<Result<string | null>> {
    const result = await this.get<SkillDetailApiResponse>(`${SKILLS_SH_SKILLS_URL}/${id}`);
    if (!isOk(result)) {
      return result;
    }

    const skillMd = result.value.files?.find((file) => file.path === 'SKILL.md');
    return ok(skillMd?.contents ?? null);
  }

  async getAudit(id: string): Promise<Result<MarketAudit>> {
    const fetched = await this.fetchWithRetry(`${SKILLS_SH_SKILLS_URL}/audit/${id}`);
    if (!isOk(fetched)) {
      return fetched;
    }
    const response = fetched.value;

    if (response.status === 404) {
      return ok({ status: 'none' });
    }

    const parsed = await parseJsonBody(response);
    if (!isOk(parsed)) {
      return parsed;
    }
    const body = parsed.value;
    if (!response.ok) {
      const errorBody = body as ApiErrorBody;
      return err(new Error(errorBody.message ?? `skills.sh returned ${response.status}`));
    }

    const audits = (body as AuditApiResponse).audits ?? [];
    return ok({ status: worstAuditStatus(audits.map((audit) => audit.status)) });
  }

  private async get<T>(url: string): Promise<Result<T>> {
    const fetched = await this.fetchWithRetry(url);
    if (!isOk(fetched)) {
      return fetched;
    }
    const response = fetched.value;

    const parsed = await parseJsonBody(response);
    if (!isOk(parsed)) {
      return parsed;
    }
    const body = parsed.value;
    if (!response.ok) {
      const errorBody = body as ApiErrorBody;
      return err(new Error(errorBody.message ?? `skills.sh returned ${response.status}`));
    }

    return ok(body as T);
  }

  /**
   * Every request goes through here: per-attempt timeout plus a bounded retry
   * for transient failures (timeout, network error, 429, 5xx). After the last
   * attempt a retryable status is returned as-is so callers build their usual
   * error from the body; a thrown failure becomes an error Result.
   */
  private async fetchWithRetry(url: string): Promise<Result<Response>> {
    const timeoutMs = this.deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const maxRetries = this.deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    const backoffMs = this.deps.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      try {
        const token = await this.deps.getOidcToken();
        const response = await this.deps.fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!canRetry || !(response.status === 429 || response.status >= 500)) {
          return ok(response);
        }
      } catch (error) {
        if (!canRetry) {
          return err(new Error(`Failed to reach skills.sh: ${(error as Error).message}`));
        }
      }
      await sleep(backoffMs * 2 ** attempt);
    }
  }
}
