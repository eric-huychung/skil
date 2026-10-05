import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, isErr, isOk, ok, type Result } from '../core/result.js';
import { JevError, type JevClient, type JevEvaluation, type JevQuestion } from './jev-client.js';
import { JevSkillClassifier } from './jev-skill-classifier.js';
import { buildLabelState, stateHash } from './label-state.js';
import type { LabelPoolRow, SkillScore, TopicQuestion } from './market-types.js';

const row = (id: string): LabelPoolRow => ({
  id,
  name: id.split('/')[2] ?? id,
  source: id.split('/').slice(0, 2).join('/'),
  installs: 1,
  description: `About ${id}`,
  labelExcerpt: null,
  owner: id.split('/')[0] ?? id,
});

const rows = (n: number): LabelPoolRow[] => Array.from({ length: n }, (_, i) => row(`o/r/s${i}`));

const QUESTIONS: TopicQuestion[] = [
  { fieldSlug: 'frontend', prompt: 'Is this about frontends?' },
  { fieldSlug: 'testing', prompt: 'Is this about testing?' },
];

interface Call {
  state: string;
  questions: Record<string, JevQuestion>;
  at: number;
}

type Reply = Result<JevEvaluation> | ((state: string) => Result<JevEvaluation>);

function evaluation(probabilities: Record<string, number>, modelVersion = 'jev-2026-10'): Result<JevEvaluation> {
  return ok({
    answers: Object.fromEntries(
      Object.entries(probabilities).map(([slug, probability]) => [slug, { kind: 'boolean' as const, probability }]),
    ),
    modelVersion,
    inputTokens: 42,
  });
}

const okReply = evaluation({ frontend: 0.8, testing: 0.1 });
const badAnswer = err<JevEvaluation>(new JevError('bad_answer', 'Jev answer for "frontend" is missing'));

/** Fake Jev: records each call at fake-clock time, replies by script, and can hold each call open. */
class FakeJevClient implements JevClient {
  readonly calls: Call[] = [];
  inFlight = 0;
  maxInFlight = 0;

  constructor(
    private readonly reply: Reply = okReply,
    private readonly holdMs = 0,
  ) {}

  async evaluate(state: string, questions: Record<string, JevQuestion>): Promise<Result<JevEvaluation>> {
    this.calls.push({ state, questions, at: Date.now() });
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.holdMs > 0) await new Promise((resolve) => setTimeout(resolve, this.holdMs));
      return typeof this.reply === 'function' ? this.reply(state) : this.reply;
    } finally {
      this.inFlight--;
    }
  }
}

function classifierFor(client: JevClient): JevSkillClassifier {
  return new JevSkillClassifier(client, {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}

/** Runs a classify call to completion under fake timers. */
async function run(client: JevClient, input: LabelPoolRow[]): Promise<Result<SkillScore[]>> {
  const pending = classifierFor(client).classify(input, QUESTIONS);
  await vi.runAllTimersAsync();
  return pending;
}

describe('JevSkillClassifier', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes one Jev call per skill with one boolean question per field and the label state', async () => {
    const client = new FakeJevClient();
    const skill = row('o/r/one');

    const result = await run(client, [skill]);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.state).toBe(buildLabelState(skill));
    expect(client.calls[0]?.questions).toEqual({
      frontend: { kind: 'boolean', prompt: 'Is this about frontends?' },
      testing: { kind: 'boolean', prompt: 'Is this about testing?' },
    });
    expect(isOk(result) && result.value).toEqual([
      {
        id: 'o/r/one',
        status: 'ok',
        probabilities: { frontend: 0.8, testing: 0.1 },
        stateHash: stateHash(buildLabelState(skill)),
        modelVersion: 'jev-2026-10',
      },
    ]);
  });

  it('returns scores in input order whatever order the calls finish in', async () => {
    const input = rows(12);
    const result = await run(new FakeJevClient(), input);

    expect(isOk(result) && result.value.map((score) => score.id)).toEqual(input.map((r) => r.id));
  });

  it('returns an empty list without calling Jev for no rows', async () => {
    const client = new FakeJevClient();

    const result = await run(client, []);

    expect(isOk(result) && result.value).toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('never runs more than 8 calls at once', async () => {
    const client = new FakeJevClient(okReply, 5_000);

    const result = await run(client, rows(30));

    expect(isOk(result)).toBe(true);
    expect(client.calls).toHaveLength(30);
    expect(client.maxInFlight).toBe(8);
  });

  it('paces call starts to at most 600 per minute', async () => {
    const client = new FakeJevClient();

    const result = await run(client, rows(25));

    expect(isOk(result)).toBe(true);
    const starts = client.calls.map((call) => call.at);
    expect(starts[0]).toBe(0);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(100);
    }
  });

  it('retries a skill once on bad_answer and keeps the retry result', async () => {
    let failed = false;
    const client = new FakeJevClient(() => {
      if (failed) return okReply;
      failed = true;
      return badAnswer;
    });

    const result = await run(client, [row('o/r/flaky')]);

    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]!.at - client.calls[0]!.at).toBeGreaterThanOrEqual(100);
    expect(isOk(result) && result.value[0]?.status).toBe('ok');
  });

  it('returns status error with no probabilities after a second bad_answer, without failing the call', async () => {
    const flaky = row('o/r/flaky');
    const client = new FakeJevClient((state) => (state === buildLabelState(flaky) ? badAnswer : okReply));

    const result = await run(client, [row('o/r/fine'), flaky]);

    expect(client.calls.filter((call) => call.state === buildLabelState(flaky))).toHaveLength(2);
    expect(isOk(result) && result.value).toEqual([
      expect.objectContaining({ id: 'o/r/fine', status: 'ok' }),
      {
        id: 'o/r/flaky',
        status: 'error',
        probabilities: {},
        stateHash: stateHash(buildLabelState(flaky)),
        modelVersion: '',
      },
    ]);
  });

  it.each(['auth', 'request', 'unavailable'] as const)('returns Err for the whole call on %s', async (kind) => {
    const client = new FakeJevClient(err(new JevError(kind, `Jev ${kind} failure`)));

    const result = await run(client, rows(20));

    expect(isErr(result) && result.error).toBeInstanceOf(JevError);
    expect(isErr(result) && (result.error as JevError).kind).toBe(kind);
    // Stops handing out work: at most one call per worker before the failure is seen.
    expect(client.calls.length).toBeLessThanOrEqual(8);
  });

  it('returns Err when the client throws', async () => {
    const client: JevClient = {
      evaluate: async () => {
        throw new Error('boom');
      },
    };

    const result = await run(client, rows(3));

    expect(isErr(result) && result.error.message).toContain('boom');
  });
});
