/**
 * Run summary for `scripts/sync-market.ts` (design §5.2).
 *
 * The script records what happened (first failure + counts) and `summarize()`
 * turns that into a `SyncRunSummary`. Pure: no fs, no env. The script owns writing
 * `.sync-market/summary.json` and `$GITHUB_STEP_SUMMARY`.
 */

export const SYNC_STEPS = ['config', 'seed', 'crawl', 'hydrate', 'label', 'shelves'] as const;
export type SyncStep = (typeof SYNC_STEPS)[number];

export const FAILURE_KINDS = [
  'config',
  'auth',
  'request',
  'unavailable',
  'bad_answers',
  'incomplete_coverage',
  'store',
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

export interface SyncRunSummary {
  status: 'ok' | 'failed';
  failedStep?: SyncStep;
  failureKind?: FailureKind;
  /** HTTP status (when known) + short message, secrets redacted. */
  firstError?: string;
  labeled: number;
  needed: number;
  errored: number;
  shelvesWritten: boolean;
  /** From market_shelf_meta, read at the end. */
  shelvesGeneratedAt: string | null;
  taxonomyVersion: string;
  modelCalls: number;
  inputTokens: number;
}

export interface SyncRunStats {
  labeled: number;
  needed: number;
  errored: number;
  taxonomyVersion: string;
  modelCalls: number;
  inputTokens: number;
}

export interface SyncStepFailure {
  step: SyncStep;
  kind: FailureKind;
  error: unknown;
}

export interface SyncRunOutcome {
  /** The first failure; the run stops there. Absent means the run succeeded. */
  failure?: SyncStepFailure;
  stats?: Partial<SyncRunStats>;
  shelvesWritten: boolean;
  shelvesGeneratedAt?: string | null;
  /** Known secret values (keys, tokens) to scrub from `firstError`. */
  secrets?: readonly string[];
}

const MAX_ERROR_LENGTH = 300;
const MIN_SECRET_LENGTH = 6;
const REDACTED = '[redacted]';

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+\S+/gi,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g, // JWTs (Supabase keys, OIDC tokens)
  /\bsk-[\w-]{10,}/g, // API keys
];

/** Replaces known secret values and token-shaped strings with `[redacted]`. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < MIN_SECRET_LENGTH) continue;
    out = out.split(secret).join(REDACTED);
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/** Uses the error's own `kind` when it is a known FailureKind (e.g. from JevClient), else `fallback`. */
export function failureKindOf(error: unknown, fallback: FailureKind): FailureKind {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return typeof kind === 'string' && (FAILURE_KINDS as readonly string[]).includes(kind)
    ? (kind as FailureKind)
    : fallback;
}

/** What to do next, appended to `firstError` for failures whose raw message doesn't say. */
const FAILURE_HINTS: Partial<Record<FailureKind, string>> = {
  bad_answers: 'too many Jev answers failed validation; saved batches are kept and the next run retries errored rows',
  incomplete_coverage:
    'shelves left unchanged; some active rows have no current label, so let a full label run finish (not --dry-run) and re-run',
};

function describeError(error: unknown, kind: FailureKind, secrets: readonly string[]): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: unknown } | null)?.status;
  const text = typeof status === 'number' ? `${status} ${message}` : message;
  const redacted = redactSecrets(text, secrets).replace(/\s+/g, ' ').trim();
  const hint = FAILURE_HINTS[kind];
  const suffix = hint ? ` (${hint})` : '';
  const room = MAX_ERROR_LENGTH - suffix.length;
  const head = redacted.length > room ? `${redacted.slice(0, room - 1)}…` : redacted;
  return `${head}${suffix}`;
}

export function summarize(outcome: SyncRunOutcome): SyncRunSummary {
  const stats = outcome.stats ?? {};
  const summary: SyncRunSummary = {
    status: outcome.failure ? 'failed' : 'ok',
    labeled: stats.labeled ?? 0,
    needed: stats.needed ?? 0,
    errored: stats.errored ?? 0,
    shelvesWritten: outcome.shelvesWritten,
    shelvesGeneratedAt: outcome.shelvesGeneratedAt ?? null,
    taxonomyVersion: stats.taxonomyVersion ?? '',
    modelCalls: stats.modelCalls ?? 0,
    inputTokens: stats.inputTokens ?? 0,
  };
  if (outcome.failure) {
    summary.failedStep = outcome.failure.step;
    summary.failureKind = outcome.failure.kind;
    summary.firstError = describeError(outcome.failure.error, outcome.failure.kind, outcome.secrets ?? []);
  }
  return summary;
}

export function exitCodeFor(summary: SyncRunSummary): 0 | 1 {
  return summary.status === 'ok' ? 0 : 1;
}

/** Markdown for `$GITHUB_STEP_SUMMARY`. */
export function formatSummaryMarkdown(summary: SyncRunSummary): string {
  const lines = [`## sync-market: ${summary.status === 'ok' ? '✅ ok' : '❌ failed'}`, ''];
  if (summary.status === 'failed') {
    lines.push(
      `- Failed step: \`${summary.failedStep ?? 'unknown'}\``,
      `- Failure kind: \`${summary.failureKind ?? 'unknown'}\``,
      `- First error: ${summary.firstError ?? 'n/a'}`,
      '',
    );
  }
  lines.push(
    '| Metric | Value |',
    '|---|---|',
    `| Labeled | ${summary.labeled} / ${summary.needed} |`,
    `| Errored | ${summary.errored} |`,
    `| Shelves written | ${summary.shelvesWritten ? 'yes' : 'no'} |`,
    `| Shelves generated at | ${summary.shelvesGeneratedAt ?? 'n/a'} |`,
    `| Taxonomy version | ${summary.taxonomyVersion || 'n/a'} |`,
    `| Model calls | ${summary.modelCalls} |`,
    `| Input tokens | ${summary.inputTokens} |`,
  );
  return `${lines.join('\n')}\n`;
}
