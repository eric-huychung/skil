import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { GatewayJevClient, JevError, type JevQuestion } from './jev-client.js';
import { TOPIC_QUESTIONS } from './topic-taxonomy.js';

const API_KEY = 'sk-test-SECRET-key-123';
const fixture = readFileSync(join(import.meta.dirname, '__fixtures__/jev-evaluate-response.json'), 'utf8');

const QUESTIONS: Record<string, JevQuestion> = {
  tech: { kind: 'boolean', prompt: 'Is this tech related?' },
  domain: {
    kind: 'choice',
    prompt: 'Main domain?',
    options: { software_dev: 'Software development', design_ui: 'Design/UI', marketing: 'Marketing/sales' },
  },
};

/** The boolean taxonomy questions the recorded fixture answers, keyed as the real call sent them. */
const FIXTURE_QUESTIONS: Record<string, JevQuestion> = Object.fromEntries(
  TOPIC_QUESTIONS.filter(({ fieldSlug }) => fieldSlug === 'frontend' || fieldSlug === 'testing').map(
    ({ fieldSlug, prompt }) => [fieldSlug, { kind: 'boolean' as const, prompt }]
  )
);

interface Call {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Fake fetch that plays `steps` in order; a step is a Response factory or an Error to throw. */
function scriptedFetch(steps: Array<(() => Response) | Error>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return step!();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(steps: Array<(() => Response) | Error>) {
  const { fetchImpl, calls } = scriptedFetch(steps);
  const sleeps: number[] = [];
  const client = new GatewayJevClient({
    fetchImpl,
    apiKey: API_KEY,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  });
  return { client, calls, sleeps };
}

const okFixture = () => jsonResponse(fixture);

describe('GatewayJevClient request shape', () => {
  it('POSTs the gateway evaluate body with bearer auth and a timeout signal', async () => {
    const { client, calls } = makeClient([okFixture]);

    await client.evaluate('name: foo', QUESTIONS);

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [Call];
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/evaluate');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'typesafe-ai/jev',
      state: 'name: foo',
      questions: {
        tech: { type: 'boolean', instructions: 'Is this tech related?' },
        domain: {
          type: 'choice',
          instructions: 'Main domain?',
          criteria: { software_dev: 'Software development', design_ui: 'Design/UI', marketing: 'Marketing/sales' },
        },
      },
    });
  });

  it('sends every taxonomy boolean question with gateway instructions', async () => {
    const { client, calls } = makeClient([okFixture]);
    const questions = Object.fromEntries(
      TOPIC_QUESTIONS.map(({ fieldSlug, prompt }) => [fieldSlug, { kind: 'boolean' as const, prompt }]),
    );

    await client.evaluate('name: foo', questions);

    const payload = JSON.parse((calls[0]?.init.body as string) ?? '{}') as {
      questions?: Record<string, { type?: string; instructions?: string; question?: string }>;
    };
    expect(Object.keys(payload.questions ?? {})).toHaveLength(TOPIC_QUESTIONS.length);
    for (const question of Object.values(payload.questions ?? {})) {
      expect(question.type).toBe('boolean');
      expect(question.instructions?.trim()).not.toBe('');
      expect(question.question).toBeUndefined();
    }
  });
});

describe('GatewayJevClient contract (recorded gateway response)', () => {
  it('parses the recorded response into typed answers', async () => {
    const { client } = makeClient([okFixture]);

    const result = await client.evaluate('name: foo', FIXTURE_QUESTIONS);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({
      answers: {
        frontend: { kind: 'boolean', probability: 0.7 },
        testing: { kind: 'boolean', probability: 0.96 },
      },
      modelVersion: 'typesafe-ai/jev',
      inputTokens: 353,
    });
  });
});

function expectJevError(result: Awaited<ReturnType<GatewayJevClient['evaluate']>>): JevError {
  expect(isErr(result)).toBe(true);
  if (!isErr(result)) throw new Error('expected Err');
  expect(result.error).toBeInstanceOf(JevError);
  return result.error as JevError;
}

const status = (code: number, body = '{"error":"nope"}') => () => jsonResponse(body, code);
const timeoutError = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

describe('GatewayJevClient retries', () => {
  it.each([429, 529, 500, 502, 503])('retries %i then succeeds', async (code) => {
    const { client, calls, sleeps } = makeClient([status(code), status(code), okFixture]);

    const result = await client.evaluate('s', FIXTURE_QUESTIONS);

    expect(isOk(result)).toBe(true);
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
  });

  it('retries network errors and timeouts', async () => {
    const { client, calls } = makeClient([new TypeError('fetch failed'), timeoutError(), okFixture]);

    const result = await client.evaluate('s', FIXTURE_QUESTIONS);

    expect(isOk(result)).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('gives up after 5 tries with an unavailable error carrying the last status', async () => {
    const { client, calls, sleeps } = makeClient([status(529, '{"error":"overloaded"}')]);

    const error = expectJevError(await client.evaluate('s', FIXTURE_QUESTIONS));

    expect(calls).toHaveLength(5);
    expect(sleeps).toHaveLength(4);
    expect(error.kind).toBe('unavailable');
    expect(error.status).toBe(529);
    expect(error.message).toContain('529');
    expect(error.message).toContain('overloaded');
  });

  it('retries a timeout while reading the response body', async () => {
    const stalledBody = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(timeoutError());
          },
        }),
        { status: 200 }
      );
    const { client, calls } = makeClient([stalledBody, okFixture]);

    const result = await client.evaluate('s', FIXTURE_QUESTIONS);

    expect(isOk(result)).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('gives up after 5 timeouts with an unavailable error', async () => {
    const { client, calls } = makeClient([timeoutError()]);

    const error = expectJevError(await client.evaluate('s', FIXTURE_QUESTIONS));

    expect(calls).toHaveLength(5);
    expect(error.kind).toBe('unavailable');
    expect(error.status).toBeUndefined();
  });

  it('backs off exponentially with full jitter: random() * min(20s, 500ms * 2^n)', async () => {
    const { client, sleeps } = makeClient([status(429)]);

    await client.evaluate('s', FIXTURE_QUESTIONS);

    // random() is 0.5 in makeClient
    expect(sleeps).toEqual([250, 500, 1000, 2000]);
  });

  it('caps the backoff at 20s', async () => {
    const { fetchImpl } = scriptedFetch([status(429)]);
    const sleeps: number[] = [];
    const client = new GatewayJevClient({
      fetchImpl,
      apiKey: API_KEY,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.999999,
    });

    await client.evaluate('s', FIXTURE_QUESTIONS);

    expect(Math.max(...sleeps)).toBeLessThanOrEqual(20_000);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [422, 'request'],
    [400, 'request'],
  ] as const)('does not retry %i (%s)', async (code, kind) => {
    const { client, calls, sleeps } = makeClient([status(code, '{"error":"invalid"}')]);

    const error = expectJevError(await client.evaluate('s', FIXTURE_QUESTIONS));

    expect(calls).toHaveLength(1);
    expect(sleeps).toHaveLength(0);
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(code);
    expect(error.message).toContain(String(code));
    expect(error.message).toContain('invalid');
  });

  it('truncates long error bodies to a short excerpt', async () => {
    const { client } = makeClient([status(422, 'x'.repeat(5000))]);

    const error = expectJevError(await client.evaluate('s', FIXTURE_QUESTIONS));

    expect(error.message.length).toBeLessThan(400);
  });
});

describe('GatewayJevClient answer validation', () => {
  const base = JSON.parse(fixture) as { answers: Record<string, Record<string, unknown>> };
  const withAnswers = (answers: Record<string, unknown>) => () => jsonResponse({ ...base, answers });
  // A real boolean answer from the fixture; the choice answer stays hand-written
  // because no real choice response has been recorded yet.
  const tech = base.answers.frontend!;
  const domain = {
    choice: 'software_dev',
    probabilities: { software_dev: 0.88, design_ui: 0.09, marketing: 0.03 },
  };

  it.each([
    ['a missing question', { tech }],
    ['a missing answers object', undefined],
    ['a boolean probability above 1', { tech: { ...tech, probability: 1.2 }, domain }],
    ['a negative boolean probability', { tech: { ...tech, probability: -0.1 }, domain }],
    ['a non-numeric probability', { tech: { ...tech, probability: '0.9' }, domain }],
    ['a NaN-like probability', { tech: { ...tech, probability: null }, domain }],
    ['an unknown choice option', { tech, domain: { ...domain, choice: 'cooking' } }],
    ['a missing choice option', { tech, domain: { ...domain, choice: undefined } }],
    ['a choice probability out of range', { tech, domain: { ...domain, probabilities: { software_dev: 1.5 } } }],
    ['a choice probability for an unknown option', { tech, domain: { ...domain, probabilities: { cooking: 0.5 } } }],
  ])('rejects %s as bad_answer without retrying', async (_label, answers) => {
    const { client, calls } = makeClient([withAnswers(answers as Record<string, unknown>)]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(error.kind).toBe('bad_answer');
    expect(calls).toHaveLength(1);
  });

  it('names the offending question in the message', async () => {
    const { client } = makeClient([withAnswers({ tech, domain: { ...domain, choice: 'cooking' } })]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(error.message).toContain('domain');
  });

  it('rejects a non-JSON 200 body as bad_answer', async () => {
    const { client } = makeClient([() => new Response('<html>oops</html>', { status: 200 })]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(error.kind).toBe('bad_answer');
  });

  it('accepts boundary probabilities 0 and 1', async () => {
    const { client } = makeClient([withAnswers({ tech: { ...tech, probability: 0 }, domain: { ...domain, probabilities: { software_dev: 1, design_ui: 0 } } })]);

    expect(isOk(await client.evaluate('s', QUESTIONS))).toBe(true);
  });
});

describe('GatewayJevClient never leaks the API key', () => {
  const echo = `{"error":"invalid key ${API_KEY}","header":"Bearer ${API_KEY}"}`;

  it.each<[string, Array<(() => Response) | Error>]>([
    ['401 echoing the key', [status(401, echo)]],
    ['422 echoing the key', [status(422, echo)]],
    ['exhausted 529 echoing the key', [status(529, echo)]],
    ['a network error mentioning the key', [new TypeError(`connect failed for Bearer ${API_KEY}`)]],
    ['a timeout', [timeoutError()]],
    ['a non-JSON 200', [() => new Response(`oops ${API_KEY}`, { status: 200 })]],
    ['a bad answer', [() => jsonResponse({ answers: {} })]],
  ])('on %s', async (_label, steps) => {
    const { client } = makeClient(steps);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(error.message).not.toContain(API_KEY);
    expect(String(error)).not.toContain(API_KEY);
    expect(error.stack ?? '').not.toContain(API_KEY);
    expect(JSON.stringify(error)).not.toContain(API_KEY);
  });

  it('keeps the rest of the excerpt readable', async () => {
    const { client } = makeClient([status(401, echo)]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(error.message).toContain('invalid key');
    expect(error.message).toContain('[redacted]');
  });
});
