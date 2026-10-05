import { err, ok, type Result } from '../core/result.js';
import type { LabelPoolRow, SkillScore, TopicQuestion } from './market-types.js';

/**
 * Scores each skill against every topic question (design §4.4). Prod
 * adapter: `JevSkillClassifier`. Tests inject `FakeSkillClassifier`.
 */
export interface SkillClassifier {
  classify(rows: LabelPoolRow[], questions: TopicQuestion[]): Promise<Result<SkillScore[]>>;
}

export interface FakeSkillClassifierScript {
  /** Canned probabilities by skill id. Questions missing here (or unknown ids) score 0. */
  probabilities?: Map<string, Record<string, number>>;
  /** Ids returned as `status: 'error'` with `{}` probabilities. */
  failIds?: Iterable<string>;
  /** When set, the whole call returns this `Err`. */
  error?: Error;
  /** Defaults to `fake:<id>`. */
  stateHash?: (row: LabelPoolRow) => string;
}

/** Programmable classifier for tests: scripted probabilities, failing ids, or a whole-call error. */
export class FakeSkillClassifier implements SkillClassifier {
  readonly calls: Array<{ rows: LabelPoolRow[]; questions: TopicQuestion[] }> = [];
  private readonly failIds: Set<string>;

  constructor(private readonly script: FakeSkillClassifierScript = {}) {
    this.failIds = new Set(script.failIds ?? []);
  }

  /** Old label-list shape: listed slugs score 1.0, everything else 0. */
  static fromSlugs(labels: Map<string, string[]>): FakeSkillClassifier {
    const probabilities = new Map(
      [...labels].map(([id, slugs]) => [id, Object.fromEntries(slugs.map((slug) => [slug, 1]))]),
    );
    return new FakeSkillClassifier({ probabilities });
  }

  async classify(rows: LabelPoolRow[], questions: TopicQuestion[]): Promise<Result<SkillScore[]>> {
    this.calls.push({ rows, questions });
    if (this.script.error) {
      return err(this.script.error);
    }
    return ok(
      rows.map((row) => {
        const failed = this.failIds.has(row.id);
        const scripted = this.script.probabilities?.get(row.id) ?? {};
        return {
          id: row.id,
          status: failed ? 'error' : 'ok',
          probabilities: failed
            ? {}
            : Object.fromEntries(questions.map((q) => [q.fieldSlug, scripted[q.fieldSlug] ?? 0])),
          stateHash: this.script.stateHash?.(row) ?? `fake:${row.id}`,
          modelVersion: 'fake',
        };
      }),
    );
  }
}
