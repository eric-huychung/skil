import { err, ok, type Result } from '../core/result.js';

export type JevQuestion =
  | { kind: 'boolean'; prompt: string }
  | { kind: 'choice'; prompt: string; options: Record<string, string> };

export type JevAnswer =
  | { kind: 'boolean'; probability: number }
  | { kind: 'choice'; option: string; probabilities: Record<string, number> };

export type JevErrorKind = 'auth' | 'request' | 'unavailable' | 'bad_answer';

export class JevError extends Error {
  constructor(
    readonly kind: JevErrorKind,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'JevError';
  }
}

export interface JevEvaluation {
  answers: Record<string, JevAnswer>;
  modelVersion: string;
  inputTokens: number;
}

export interface JevClient {
  evaluate(state: string, questions: Record<string, JevQuestion>): Promise<Result<JevEvaluation>>;
}

export interface GatewayJevClientDeps {
  fetchImpl: typeof fetch;
  apiKey: string;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const EVALUATE_URL = 'https://ai-gateway.vercel.sh/v1/evaluate';
const MODEL = 'typesafe-ai/jev';
const TIMEOUT_MS = 15_000;
const MAX_TRIES = 5;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 20_000;
const BODY_EXCERPT_CHARS = 200;

// Gateway wire shape. PROVISIONAL: taken from the spec's notes on the 2026-10-04
// test call; the field names for prompts and choice answers are confirmed only
// once a real capture replaces `__fixtures__/jev-evaluate-response.json`.
type WireQuestion =
  | { type: 'boolean'; question: string }
  | { type: 'choice'; question: string; criteria: Record<string, string> };

function toWireQuestion(question: JevQuestion): WireQuestion {
  return question.kind === 'boolean'
    ? { type: 'boolean', question: question.prompt }
    : { type: 'choice', question: question.prompt, criteria: question.options };
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAnswer(name: string, question: JevQuestion, wire: unknown): JevAnswer | JevError {
  const bad = (why: string) => new JevError('bad_answer', `Jev answer for "${name}" ${why}`);
  if (!isRecord(wire)) return bad('is missing');

  if (question.kind === 'boolean') {
    return isProbability(wire.probability)
      ? { kind: 'boolean', probability: wire.probability }
      : bad('has no probability in [0, 1]');
  }

  const option = wire.choice;
  if (typeof option !== 'string' || !Object.hasOwn(question.options, option)) {
    return bad('picked an option outside the given set');
  }
  if (!isRecord(wire.probabilities)) return bad('has no probabilities');
  const probabilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(wire.probabilities)) {
    if (!Object.hasOwn(question.options, key)) return bad('has a probability for an unknown option');
    if (!isProbability(value)) return bad('has a probability outside [0, 1]');
    probabilities[key] = value;
  }
  return { kind: 'choice', option, probabilities };
}

function parseResponse(body: unknown, questions: Record<string, JevQuestion>): Result<JevEvaluation> {
  if (!isRecord(body) || !isRecord(body.answers)) {
    return err(new JevError('bad_answer', 'Jev response has no answers object'));
  }
  const answers: Record<string, JevAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = parseAnswer(name, question, body.answers[name]);
    if (answer instanceof JevError) return err(answer);
    answers[name] = answer;
  }
  return ok({
    answers,
    modelVersion: typeof body.model === 'string' ? body.model : MODEL,
    inputTokens: isRecord(body.usage) && typeof body.usage.inputTokens === 'number' ? body.usage.inputTokens : 0,
  });
}

/** Error text is logged and posted to Slack, so the key must never survive into it. */
function redact(text: string, apiKey: string): string {
  return apiKey ? text.split(apiKey).join('[redacted]') : text;
}

/** Redacts before truncating, so a key cut at the excerpt boundary can't leak a prefix. */
async function bodyExcerpt(response: Response, apiKey: string): Promise<string> {
  try {
    const text = redact(await response.text(), apiKey).replace(/\s+/g, ' ').trim();
    return text.length > BODY_EXCERPT_CHARS ? `${text.slice(0, BODY_EXCERPT_CHARS)}…` : text;
  } catch {
    return '(unreadable body)';
  }
}

/**
 * The only code that knows the Vercel AI Gateway's `/v1/evaluate` wire shape
 * for Jev. One call in, typed answers or a classified `JevError` out.
 */
export class GatewayJevClient implements JevClient {
  constructor(private readonly deps: GatewayJevClientDeps) {}

  async evaluate(state: string, questions: Record<string, JevQuestion>): Promise<Result<JevEvaluation>> {
    const wireQuestions: Record<string, WireQuestion> = {};
    for (const [name, question] of Object.entries(questions)) {
      wireQuestions[name] = toWireQuestion(question);
    }
    const body = JSON.stringify({ model: MODEL, state, questions: wireQuestions });

    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const random = this.deps.random ?? Math.random;

    let attempt = 1;
    for (;;) {
      const { result, retryable } = await this.tryOnce(body, questions);
      if (!retryable || attempt === MAX_TRIES) {
        return result;
      }
      // Full jitter: uniform in [0, min(cap, base * 2^(attempt-1))).
      await sleep(random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1)));
      attempt++;
    }
  }

  private async tryOnce(
    body: string,
    questions: Record<string, JevQuestion>
  ): Promise<{ result: Result<JevEvaluation>; retryable: boolean }> {
    const fail = (error: JevError, retryable: boolean) => ({ result: err<JevEvaluation>(error), retryable });

    let response: Response;
    try {
      response = await this.deps.fetchImpl(EVALUATE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.deps.apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const reason =
        (error as Error).name === 'TimeoutError'
          ? `timed out after ${TIMEOUT_MS} ms`
          : redact(String((error as Error).message), this.deps.apiKey);
      return fail(new JevError('unavailable', `Jev request failed: ${reason}`), true);
    }

    if (!response.ok) {
      const excerpt = await bodyExcerpt(response, this.deps.apiKey);
      const message = `Jev returned ${response.status}: ${excerpt}`;
      const code = response.status;
      if (code === 401 || code === 403) return fail(new JevError('auth', message, code), false);
      if (code === 429 || code >= 500) return fail(new JevError('unavailable', message, code), true);
      return fail(new JevError('request', message, code), false);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return fail(new JevError('bad_answer', `Jev returned a non-JSON response (status ${response.status})`), false);
    }
    return { result: parseResponse(json, questions), retryable: false };
  }
}
