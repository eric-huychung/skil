import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../core/result.js';
import { GatewayJevClient, JevError, type JevQuestion } from './jev-client.js';

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
        tech: { type: 'boolean', question: 'Is this tech related?' },
        domain: {
          type: 'choice',
          question: 'Main domain?',
          criteria: { software_dev: 'Software development', design_ui: 'Design/UI', marketing: 'Marketing/sales' },
        },
      },
    });
  });
});

describe('GatewayJevClient contract (provisional fixture)', () => {
  it('parses the recorded response into typed answers', async () => {
    const { client } = makeClient([okFixture]);

    const result = await client.evaluate('name: foo', QUESTIONS);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual({
      answers: {
        tech: { kind: 'boolean', probability: 0.97 },
        domain: {
          kind: 'choice',
          option: 'software_dev',
          probabilities: { software_dev: 0.88, design_ui: 0.09, marketing: 0.03 },
        },
      },
      modelVersion: 'typesafe-ai/jev-1.13.0',
      inputTokens: 912,
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

    const result = await client.evaluate('s', QUESTIONS);

    expect(isOk(result)).toBe(true);
    expect(calls).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
  });

  it('retries network errors and timeouts', async () => {
    const { client, calls } = makeClient([new TypeError('fetch failed'), timeoutError(), okFixture]);

    const result = await client.evaluate('s', QUESTIONS);

    expect(isOk(result)).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('gives up after 5 tries with an unavailable error carrying the last status', async () => {
    const { client, calls, sleeps } = makeClient([status(529, '{"error":"overloaded"}')]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(calls).toHaveLength(5);
    expect(sleeps).toHaveLength(4);
    expect(error.kind).toBe('unavailable');
    expect(error.status).toBe(529);
    expect(error.message).toContain('529');
    expect(error.message).toContain('overloaded');
  });

  it('gives up after 5 timeouts with an unavailable error', async () => {
    const { client, calls } = makeClient([timeoutError()]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(calls).toHaveLength(5);
    expect(error.kind).toBe('unavailable');
    expect(error.status).toBeUndefined();
  });

  it('backs off exponentially with full jitter: random() * min(20s, 500ms * 2^n)', async () => {
    const { client, sleeps } = makeClient([status(429)]);

    await client.evaluate('s', QUESTIONS);

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

    await client.evaluate('s', QUESTIONS);

    expect(Math.max(...sleeps)).toBeLessThanOrEqual(20_000);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [422, 'request'],
    [400, 'request'],
  ] as const)('does not retry %i (%s)', async (code, kind) => {
    const { client, calls, sleeps } = makeClient([status(code, '{"error":"invalid"}')]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(calls).toHaveLength(1);
    expect(sleeps).toHaveLength(0);
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(code);
    expect(error.message).toContain(String(code));
    expect(error.message).toContain('invalid');
  });

  it('truncates long error bodies to a short excerpt', async () => {
    const { client } = makeClient([status(422, 'x'.repeat(5000))]);

    const error = expectJevError(await client.evaluate('s', QUESTIONS));

    expect(error.message.length).toBeLessThan(400);
  });
});
