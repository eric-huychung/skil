import { describe, expect, it } from 'vitest';
import {
  FAILURE_KINDS,
  exitCodeFor,
  failureKindOf,
  formatSummaryMarkdown,
  redactSecrets,
  summarize,
  type FailureKind,
  type SyncStep,
} from './sync-summary.js';

describe('summarize', () => {
  it('reports ok with zeroed stats when nothing failed', () => {
    const summary = summarize({ shelvesWritten: true });
    expect(summary).toEqual({
      status: 'ok',
      labeled: 0,
      needed: 0,
      errored: 0,
      shelvesWritten: true,
      shelvesGeneratedAt: null,
      taxonomyVersion: '',
      modelCalls: 0,
      inputTokens: 0,
    });
    expect(exitCodeFor(summary)).toBe(0);
  });

  it('carries stats through', () => {
    const summary = summarize({
      shelvesWritten: true,
      shelvesGeneratedAt: '2026-10-04T00:00:00Z',
      stats: { labeled: 40, needed: 50, errored: 1, taxonomyVersion: 'v1', modelCalls: 41, inputTokens: 9000 },
    });
    expect(summary).toMatchObject({
      labeled: 40,
      needed: 50,
      errored: 1,
      taxonomyVersion: 'v1',
      modelCalls: 41,
      inputTokens: 9000,
      shelvesGeneratedAt: '2026-10-04T00:00:00Z',
    });
  });

  const cases: Array<[FailureKind, SyncStep]> = [
    ['config', 'config'],
    ['auth', 'label'],
    ['request', 'label'],
    ['unavailable', 'crawl'],
    ['bad_answers', 'label'],
    ['incomplete_coverage', 'shelves'],
    ['store', 'seed'],
  ];

  it('covers every failure kind', () => {
    expect(cases.map(([kind]) => kind).sort()).toEqual([...FAILURE_KINDS].sort());
  });

  it.each(cases)('maps failureKind %s at step %s to a failed summary and exit 1', (kind, step) => {
    const summary = summarize({
      failure: { step, kind, error: new Error('boom') },
      shelvesWritten: false,
    });
    expect(summary.status).toBe('failed');
    expect(summary.failedStep).toBe(step);
    expect(summary.failureKind).toBe(kind);
    expect(summary.firstError).toMatch(/^boom/);
    expect(summary.shelvesWritten).toBe(false);
    expect(exitCodeFor(summary)).toBe(1);
  });

  it('explains a bad_answers label failure (LabelPoolError shape) and keeps its counts', () => {
    const error = Object.assign(new Error('MarketSync: 3 of 50 rows errored (over 2%)'), { kind: 'bad_answers' });
    const summary = summarize({
      failure: { step: 'label', kind: failureKindOf(error, 'unavailable'), error },
      stats: { labeled: 47, needed: 50, errored: 3 },
      shelvesWritten: false,
    });
    expect(summary).toMatchObject({ status: 'failed', failedStep: 'label', failureKind: 'bad_answers', errored: 3 });
    expect(summary.firstError).toContain('3 of 50 rows errored');
    expect(summary.firstError).toContain('next run retries');
    expect(exitCodeFor(summary)).toBe(1);
  });

  it('explains an incomplete_coverage shelf failure', () => {
    const error = Object.assign(new Error('4 of 10 active rows have no current label'), {
      kind: 'incomplete_coverage',
    });
    const summary = summarize({
      failure: { step: 'shelves', kind: failureKindOf(error, 'store'), error },
      shelvesWritten: false,
      shelvesGeneratedAt: '2026-09-27T00:00:00Z',
    });
    expect(summary).toMatchObject({
      status: 'failed',
      failedStep: 'shelves',
      failureKind: 'incomplete_coverage',
      shelvesWritten: false,
      shelvesGeneratedAt: '2026-09-27T00:00:00Z',
    });
    expect(summary.firstError).toContain('4 of 10 active rows');
    expect(summary.firstError).toContain('shelves left unchanged');
    expect(exitCodeFor(summary)).toBe(1);
  });

  it('keeps the hint when a hinted message is truncated', () => {
    const summary = summarize({
      failure: { step: 'label', kind: 'bad_answers', error: new Error('x'.repeat(2000)) },
      shelvesWritten: false,
    });
    expect(summary.firstError!.length).toBeLessThanOrEqual(300);
    expect(summary.firstError).toContain('next run retries');
  });

  it('prefixes firstError with an HTTP status when the error has one', () => {
    const error = Object.assign(new Error('Unauthorized'), { status: 401 });
    const summary = summarize({ failure: { step: 'label', kind: 'auth', error }, shelvesWritten: false });
    expect(summary.firstError).toBe('401 Unauthorized');
  });

  it('redacts secrets in firstError', () => {
    const error = new Error('bad key sk-live-abcdef1234567890 for svc-role-secret-value');
    const summary = summarize({
      failure: { step: 'seed', kind: 'store', error },
      shelvesWritten: false,
      secrets: ['svc-role-secret-value'],
    });
    expect(summary.firstError).not.toContain('sk-live-abcdef1234567890');
    expect(summary.firstError).not.toContain('svc-role-secret-value');
    expect(summary.firstError).toContain('[redacted]');
  });

  it('truncates a long firstError', () => {
    const summary = summarize({
      failure: { step: 'crawl', kind: 'unavailable', error: new Error('x'.repeat(2000)) },
      shelvesWritten: false,
    });
    expect(summary.firstError!.length).toBeLessThanOrEqual(300);
  });
});

describe('redactSecrets', () => {
  it('redacts bearer tokens, JWTs and known values', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJlLXZhbHVl';
    const out = redactSecrets(`Authorization: Bearer abc.def.ghi token=${jwt} key=hunter2-long-secret`, [
      'hunter2-long-secret',
    ]);
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain(jwt);
    expect(out).not.toContain('hunter2-long-secret');
  });

  it('ignores empty or very short known values', () => {
    expect(redactSecrets('a b c', ['', 'a'])).toBe('a b c');
  });
});

describe('failureKindOf', () => {
  it('reads a valid kind from the error', () => {
    expect(failureKindOf(Object.assign(new Error('x'), { kind: 'auth' }), 'store')).toBe('auth');
  });

  it('falls back when the error has no known kind', () => {
    expect(failureKindOf(new Error('x'), 'store')).toBe('store');
    expect(failureKindOf(Object.assign(new Error('x'), { kind: 'nope' }), 'unavailable')).toBe('unavailable');
    expect(failureKindOf('not an error', 'store')).toBe('store');
  });
});

describe('formatSummaryMarkdown', () => {
  it('shows status, failure and counts', () => {
    const md = formatSummaryMarkdown(
      summarize({ failure: { step: 'config', kind: 'config', error: new Error('Missing env') }, shelvesWritten: false }),
    );
    expect(md).toContain('failed');
    expect(md).toContain('config');
    expect(md).toContain('Missing env');
    expect(md).toContain('Labeled');
  });

  it('shows ok without a failure section', () => {
    const md = formatSummaryMarkdown(summarize({ shelvesWritten: true }));
    expect(md).toContain('ok');
    expect(md).not.toContain('Failed step');
  });
});
