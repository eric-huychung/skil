/**
 * Slack alert for the weekly sync-market job (design §5.3).
 *
 *   npx tsx scripts/notify-slack.ts failure
 *   npx tsx scripts/notify-slack.ts stale --max-age-days=10
 *
 * Reads `.sync-market/summary.json` and posts to SLACK_WEBHOOK_URL. Always exits 0.
 * Empty SLACK_WEBHOOK_URL → logs "Slack not configured". Logic lives in
 * `src/backend/slack-message.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  DEFAULT_MAX_AGE_DAYS,
  notifySlack,
  parseSummary,
  type SlackMessageKind,
} from '../src/backend/slack-message.js';

const SUMMARY_PATH = '.sync-market/summary.json';

function parseArgs(argv: string[]): { kind: SlackMessageKind; maxAgeDays: number } {
  const kind: SlackMessageKind = argv[0] === 'stale' ? 'stale' : 'failure';
  const flag = argv.find((arg) => arg.startsWith('--max-age-days='));
  const parsed = flag ? Number(flag.slice('--max-age-days='.length)) : NaN;
  return { kind, maxAgeDays: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_AGE_DAYS };
}

function readSummaryText(): string | null {
  try {
    return existsSync(SUMMARY_PATH) ? readFileSync(SUMMARY_PATH, 'utf8') : null;
  } catch {
    return null;
  }
}

async function postToSlack(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Slack responded ${response.status}`);
}

const { kind, maxAgeDays } = parseArgs(process.argv.slice(2));
const code = await notifySlack({
  kind,
  maxAgeDays,
  summary: parseSummary(readSummaryText()),
  webhookUrl: process.env.SLACK_WEBHOOK_URL,
  runUrl: process.env.RUN_URL ?? '(run URL unavailable)',
  now: new Date(),
  post: postToSlack,
  log: (message) => console.log(message),
});
process.exitCode = code;
