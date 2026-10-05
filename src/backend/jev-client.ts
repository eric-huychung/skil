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

    const response = await this.deps.fetchImpl(EVALUATE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.deps.apiKey}`, 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return err(new JevError('unavailable', `Jev returned ${response.status}`, response.status));
    }
    return parseResponse((await response.json()) as WireResponse, questions);
  }
}
