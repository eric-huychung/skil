import { describe, expect, it, vi } from 'vitest';
import {
  formatSlackMessage,
  notifySlack,
  parseSummary,
  shelfAgeDays,
  type NotifySlackInput,
} from './slack-message.js';
import type { SyncRunSummary } from './sync-summary.js';

const RUN_URL = 'https://github.com/acme/skil/actions/runs/42';
const NOW = new Date('2026-10-04T00:00:00Z');

function summary(overrides: Partial<SyncRunSummary> = {}): SyncRunSummary {
  return {
    status: 'ok',
    labeled: 120,
    needed: 150,
    errored: 2,
    shelvesWritten: true,
    shelvesGeneratedAt: '2026-10-03T00:00:00Z',
    taxonomyVersion: 'v1',
    modelCalls: 10,
    inputTokens: 5000,
    ...overrides,
  };
}

const failed = summary({
  status: 'failed',
  failedStep: 'label',
  failureKind: 'auth',
  firstError: '401 Unauthorized',
  shelvesWritten: false,
  shelvesGeneratedAt: '2026-09-20T00:00:00Z',
});

describe('formatSlackMessage', () => {
  it('failure: names run URL, failed step, kind, labeled vs needed, first error, shelf age', () => {
    const text = formatSlackMessage(failed, RUN_URL, 'failure', { now: NOW });
    expect(text).toContain('sync-market failed');
    expect(text).toContain(RUN_URL);
    expect(text).toContain('label');
    expect(text).toContain('auth');
    expect(text).toContain('120 / 150');
    expect(text).toContain('401 Unauthorized');
    expect(text).toContain('14 days');
  });

  it('stale: names shelf age, threshold and run URL', () => {
    const text = formatSlackMessage(failed, RUN_URL, 'stale', { now: NOW, maxAgeDays: 10 });
    expect(text).toContain('stale');
    expect(text).toContain('14 days');
    expect(text).toContain('10 days');
    expect(text).toContain(RUN_URL);
  });

  it('missing summary: failure says the run died before writing a summary', () => {
    const text = formatSlackMessage(null, RUN_URL, 'failure');
    expect(text).toContain('sync-market failed before writing a summary');
    expect(text).toContain(RUN_URL);
  });

  it('missing summary: stale says shelf age is unknown', () => {
    const text = formatSlackMessage(null, RUN_URL, 'stale', { maxAgeDays: 10 });
    expect(text).toContain('unknown');
    expect(text).toContain(RUN_URL);
  });
});

describe('shelfAgeDays', () => {
  it('counts whole days since shelvesGeneratedAt', () => {
    expect(shelfAgeDays(failed, NOW)).toBe(14);
  });

  it('is 0 when this run wrote shelves but no timestamp was read', () => {
    expect(shelfAgeDays(summary({ shelvesGeneratedAt: null, shelvesWritten: true }), NOW)).toBe(0);
  });

  it('is null when age cannot be known', () => {
    expect(shelfAgeDays(summary({ shelvesGeneratedAt: null, shelvesWritten: false }), NOW)).toBeNull();
    expect(shelfAgeDays(summary({ shelvesGeneratedAt: 'not a date', shelvesWritten: false }), NOW)).toBeNull();
    expect(shelfAgeDays(null, NOW)).toBeNull();
  });
});

describe('parseSummary', () => {
  it('returns null for missing or malformed text', () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary('{nope')).toBeNull();
    expect(parseSummary('{"foo":1}')).toBeNull();
  });

  it('parses a summary file', () => {
    expect(parseSummary(JSON.stringify(failed))).toEqual(failed);
  });
});

describe('notifySlack', () => {
  function input(overrides: Partial<NotifySlackInput> = {}): NotifySlackInput {
    return {
      kind: 'failure',
      summary: failed,
      webhookUrl: 'https://hooks.slack.test/T/B/x',
      runUrl: RUN_URL,
      now: NOW,
      maxAgeDays: 10,
      post: vi.fn(async () => {}),
      log: vi.fn(),
      ...overrides,
    };
  }

  it('empty webhook: logs "Slack not configured", posts nothing, exits 0', async () => {
    const args = input({ webhookUrl: '' });
    expect(await notifySlack(args)).toBe(0);
    expect(args.log).toHaveBeenCalledWith(expect.stringContaining('Slack not configured'));
    expect(args.post).not.toHaveBeenCalled();
  });

  it('undefined webhook behaves like empty', async () => {
    const args = input({ webhookUrl: undefined });
    expect(await notifySlack(args)).toBe(0);
    expect(args.log).toHaveBeenCalledWith(expect.stringContaining('Slack not configured'));
  });

  it('failure: posts the failure message', async () => {
    const args = input();
    expect(await notifySlack(args)).toBe(0);
    expect(args.post).toHaveBeenCalledWith(
      'https://hooks.slack.test/T/B/x',
      formatSlackMessage(failed, RUN_URL, 'failure', { now: NOW, maxAgeDays: 10 }),
    );
  });

  it('missing summary: posts the before-summary message', async () => {
    const args = input({ summary: null });
    await notifySlack(args);
    expect(args.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('sync-market failed before writing a summary'),
    );
  });

  it('stale: posts when shelves are older than maxAgeDays', async () => {
    const args = input({ kind: 'stale' });
    await notifySlack(args);
    expect(args.post).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('stale'));
  });

  it('stale: posts nothing when shelves are fresh', async () => {
    const args = input({ kind: 'stale', summary: summary() });
    expect(await notifySlack(args)).toBe(0);
    expect(args.post).not.toHaveBeenCalled();
  });

  it('stale: posts when shelf age is unknown', async () => {
    const args = input({ kind: 'stale', summary: null });
    await notifySlack(args);
    expect(args.post).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('unknown'));
  });

  it('a failed post logs and still exits 0, without leaking the webhook URL', async () => {
    const args = input({
      post: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    expect(await notifySlack(args)).toBe(0);
    const logged = vi.mocked(args.log).mock.calls.flat().join('\n');
    expect(logged).toContain('boom');
    expect(logged).not.toContain('hooks.slack.test');
  });
});
