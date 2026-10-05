import { err, ok, type Result } from '../core/result.js';
import { JevError, type JevClient, type JevQuestion } from './jev-client.js';
import { buildLabelState, stateHash } from './label-state.js';
import type { LabelPoolRow, SkillScore, TopicQuestion } from './market-types.js';
import type { SkillClassifier } from './skill-classifier.js';

export interface JevSkillClassifierDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Calls in flight at once. Defaults to 8. */
  concurrency?: number;
  /** Call starts per minute, retries included. Defaults to 600, half Jev's reported limit. */
  requestsPerMinute?: number;
}

/** Jev usage so far, for the run summary. */
export interface JevUsage {
  /** `evaluate` calls made, retries included. */
  modelCalls: number;
  /** Sum of `inputTokens` over successful calls. */
  inputTokens: number;
}

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_REQUESTS_PER_MINUTE = 600;

/**
 * Scores skills with Jev (design §4.4): one call per skill, one boolean
 * question per field, through a bounded worker pool paced to a request
 * budget. A `bad_answer` is retried once and then recorded as that skill's
 * `status: 'error'`; any other failure (after the client's own retries)
 * fails the whole call.
 */
export class JevSkillClassifier implements SkillClassifier {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly concurrency: number;
  private readonly intervalMs: number;
  private modelCalls = 0;
  private inputTokens = 0;

  constructor(
    private readonly client: JevClient,
    deps: JevSkillClassifierDeps = {},
  ) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY;
    this.intervalMs = 60_000 / (deps.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE);
  }

  /** Read-only counters across every `classify` call on this instance. */
  get usage(): JevUsage {
    return { modelCalls: this.modelCalls, inputTokens: this.inputTokens };
  }

  async classify(rows: LabelPoolRow[], questions: TopicQuestion[]): Promise<Result<SkillScore[]>> {
    const jevQuestions: Record<string, JevQuestion> = Object.fromEntries(
      questions.map((q) => [q.fieldSlug, { kind: 'boolean', prompt: q.prompt }]),
    );
    const scores: SkillScore[] = new Array(rows.length);
    let next = 0;
    let nextSlot = this.now();
    let failure: Error | undefined;

    // Reserves the next start slot, so starts are at least `intervalMs` apart across workers.
    const paced = async (state: string) => {
      const slot = Math.max(this.now(), nextSlot);
      nextSlot = slot + this.intervalMs;
      const wait = slot - this.now();
      if (wait > 0) await this.sleep(wait);
      if (failure) return undefined;
      this.modelCalls += 1;
      const result = await this.client.evaluate(state, jevQuestions);
      if (result.ok) this.inputTokens += result.value.inputTokens;
      return result;
    };

    const scoreOne = async (row: LabelPoolRow): Promise<SkillScore | undefined> => {
      const state = buildLabelState(row);
      const hash = stateHash(state);
      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await paced(state);
        if (!result) return undefined;
        if (result.ok) {
          const probabilities: Record<string, number> = {};
          for (const { fieldSlug } of questions) {
            const answer = result.value.answers[fieldSlug];
            if (answer?.kind !== 'boolean') break;
            probabilities[fieldSlug] = answer.probability;
          }
          if (Object.keys(probabilities).length === questions.length) {
            return { id: row.id, status: 'ok', probabilities, stateHash: hash, modelVersion: result.value.modelVersion };
          }
          continue;
        }
        if (!(result.error instanceof JevError && result.error.kind === 'bad_answer')) {
          failure ??= result.error;
          return undefined;
        }
      }
      return { id: row.id, status: 'error', probabilities: {}, stateHash: hash, modelVersion: '' };
    };

    const worker = async () => {
      while (!failure && next < rows.length) {
        const index = next++;
        try {
          const score = await scoreOne(rows[index]!);
          if (score) scores[index] = score;
        } catch (error) {
          failure ??= error instanceof Error ? error : new Error(String(error));
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, rows.length) }, worker));
    return failure ? err(failure) : ok(scores);
  }
}
