/**
 * Slack alerts for the weekly sync-market job (design §5.3).
 *
 * `formatSlackMessage` is pure. `notifySlack` holds the decision logic for
 * `scripts/notify-slack.ts` with I/O injected, so the script stays a thin wrapper.
 * It always resolves to exit code 0: an alert step must never fail the job.
 */
import type { SyncRunSummary } from './sync-summary.js';

export type SlackMessageKind = 'failure' | 'stale';

export interface SlackMessageOptions {
  now?: Date;
  maxAgeDays?: number;
}

export const DEFAULT_MAX_AGE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days since the shelves were generated. A run that wrote shelves but has no
 * timestamp counts as fresh (0). Null when the age can't be known.
 */
export function shelfAgeDays(summary: SyncRunSummary | null, now: Date): number | null {
  if (!summary) return null;
  if (summary.shelvesGeneratedAt) {
    const generated = Date.parse(summary.shelvesGeneratedAt);
    if (!Number.isNaN(generated)) return Math.max(0, Math.floor((now.getTime() - generated) / DAY_MS));
  }
  return summary.shelvesWritten ? 0 : null;
}

function describeAge(age: number | null): string {
  if (age === null) return 'unknown';
  return `${age} day${age === 1 ? '' : 's'}`;
}

export function formatSlackMessage(
  summary: SyncRunSummary | null,
  runUrl: string,
  kind: SlackMessageKind,
  options: SlackMessageOptions = {},
): string {
  const now = options.now ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const run = `Run: ${runUrl}`;

  if (kind === 'stale') {
    const age = shelfAgeDays(summary, now);
    const reason = summary ? '' : ' (sync-market ended without writing a summary)';
    return [
      `:warning: Market shelves may be stale: last generated ${describeAge(age)} ago${reason}.`,
      `Threshold: ${maxAgeDays} days.`,
      run,
    ].join('\n');
  }

  if (!summary) return [':x: sync-market failed before writing a summary.', run].join('\n');

  return [
    `:x: sync-market failed at step \`${summary.failedStep ?? 'unknown'}\` (${summary.failureKind ?? 'unknown'}).`,
    `Labeled: ${summary.labeled} / ${summary.needed} (errored ${summary.errored})`,
    `First error: ${summary.firstError ?? 'n/a'}`,
    `Shelf age: ${describeAge(shelfAgeDays(summary, now))}`,
    run,
  ].join('\n');
}

/** Parses `.sync-market/summary.json` text. Null when missing or not a summary. */
export function parseSummary(text: string | null): SyncRunSummary | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (
      value &&
      typeof value === 'object' &&
      ((value as { status?: unknown }).status === 'ok' || (value as { status?: unknown }).status === 'failed')
    ) {
      return value as SyncRunSummary;
    }
  } catch {
    // fall through: treat as missing
  }
  return null;
}

export interface NotifySlackInput {
  kind: SlackMessageKind;
  summary: SyncRunSummary | null;
  webhookUrl: string | undefined;
  runUrl: string;
  now: Date;
  maxAgeDays: number;
  post: (webhookUrl: string, text: string) => Promise<void>;
  log: (message: string) => void;
}

export async function notifySlack(input: NotifySlackInput): Promise<0> {
  const { kind, summary, runUrl, now, maxAgeDays } = input;
  if (kind === 'stale') {
    const age = shelfAgeDays(summary, now);
    if (age !== null && age <= maxAgeDays) {
      input.log(`Shelves are ${describeAge(age)} old (threshold ${maxAgeDays}); no alert.`);
      return 0;
    }
  }

  const text = formatSlackMessage(summary, runUrl, kind, { now, maxAgeDays });
  if (!input.webhookUrl) {
    input.log(`Slack not configured (SLACK_WEBHOOK_URL is empty). Would have posted:\n${text}`);
    return 0;
  }

  try {
    await input.post(input.webhookUrl, text);
    input.log(`Posted ${kind} alert to Slack.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log(`Slack post failed: ${message.split(input.webhookUrl).join('[webhook]')}`);
  }
  return 0;
}
