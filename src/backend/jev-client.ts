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

interface WireResponse {
  model?: unknown;
  answers?: unknown;
  usage?: { inputTokens?: unknown };
}

function toWireQuestion(question: JevQuestion): WireQuestion {
  return question.kind === 'boolean'
    ? { type: 'boolean', question: question.prompt }
    : { type: 'choice', question: question.prompt, criteria: question.options };
}

function parseResponse(body: WireResponse, questions: Record<string, JevQuestion>): Result<JevEvaluation> {
  const wireAnswers = (body.answers ?? {}) as Record<string, Record<string, unknown>>;
  const answers: Record<string, JevAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    const wire = wireAnswers[name]!;
    answers[name] =
      question.kind === 'boolean'
        ? { kind: 'boolean', probability: wire.probability as number }
        : {
            kind: 'choice',
            option: wire.choice as string,
            probabilities: wire.probabilities as Record<string, number>,
          };
  }
  return ok({
    answers,
    modelVersion: typeof body.model === 'string' ? body.model : MODEL,
    inputTokens: typeof body.usage?.inputTokens === 'number' ? body.usage.inputTokens : 0,
  });
}

async function bodyExcerpt(response: Response): Promise<string> {
  try {
    const text = (await response.text()).replace(/\s+/g, ' ').trim();
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
      const reason = (error as Error).name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS} ms` : (error as Error).message;
      return fail(new JevError('unavailable', `Jev request failed: ${reason}`), true);
    }

    if (!response.ok) {
      const excerpt = await bodyExcerpt(response);
      const message = `Jev returned ${response.status}: ${excerpt}`;
      const code = response.status;
      if (code === 401 || code === 403) return fail(new JevError('auth', message, code), false);
      if (code === 429 || code >= 500) return fail(new JevError('unavailable', message, code), true);
      return fail(new JevError('request', message, code), false);
    }

    return { result: parseResponse((await response.json()) as WireResponse, questions), retryable: false };
  }
}
