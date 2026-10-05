import { isOk, ok, type Result } from '../core/result.js';
import type { LabelPoolRow, MarketStore, SkillScore } from './market-store.js';
import { REVIEW_BAND, TAXONOMY_VERSION, TOPIC_THRESHOLD } from './topic-taxonomy.js';

export type TaxonomyReviewFlag = 'unlabeled' | 'review-band';

export interface TaxonomyReviewRow {
  id: string;
  name: string;
  installs: number;
  flags: TaxonomyReviewFlag[];
  probabilities: Record<string, number>;
  status: SkillScore['status'] | 'missing';
}

/** Builds an inspection report without changing labels or shelves. */
export function buildTaxonomyReview(
  pool: LabelPoolRow[],
  scores: SkillScore[],
  opts: {
    threshold?: number;
    reviewBand?: { low: number; high: number };
  } = {},
): TaxonomyReviewRow[] {
  const threshold = opts.threshold ?? TOPIC_THRESHOLD;
  const reviewBand = opts.reviewBand ?? REVIEW_BAND;
  const scoreById = new Map(scores.map((score) => [score.id, score]));

  return pool
    .flatMap((row) => {
      const score = scoreById.get(row.id);
      const probabilities = score?.probabilities ?? {};
      const hasTopic = score?.status === 'ok' && Object.values(probabilities).some((p) => p >= threshold);
      const hasReviewBand =
        score?.status === 'ok' && Object.values(probabilities).some((p) => p >= reviewBand.low && p <= reviewBand.high);
      const flags: TaxonomyReviewFlag[] = [];
      if (!hasTopic) flags.push('unlabeled');
      if (hasReviewBand) flags.push('review-band');
      if (flags.length === 0) return [];
      return [{
        id: row.id,
        name: row.name,
        installs: row.installs,
        flags,
        probabilities,
        status: score?.status ?? ('missing' as const),
      }];
    })
    .sort((a, b) => b.installs - a.installs || a.id.localeCompare(b.id));
}

/** Reads the stored taxonomy state only; it does not invoke Jev or write shelves. */
export async function readTaxonomyReview(
  store: Pick<MarketStore, 'listLabelPool' | 'listLabels'>,
  version = TAXONOMY_VERSION,
): Promise<Result<TaxonomyReviewRow[]>> {
  const [pool, labels] = await Promise.all([store.listLabelPool(), store.listLabels(version)]);
  if (!isOk(pool)) return pool;
  if (!isOk(labels)) return labels;
  return ok(buildTaxonomyReview(pool.value, labels.value));
}

export function formatTaxonomyReview(rows: TaxonomyReviewRow[]): string {
  if (rows.length === 0) return 'No unlabeled or review-band skills found.';
  return rows
    .map((row) => {
      const scores = Object.entries(row.probabilities)
        .sort(([, a], [, b]) => b - a)
        .map(([field, probability]) => `${field}=${probability.toFixed(2)}`)
        .join(', ');
      return `${row.flags.join('+')}\t${row.id}\t${row.installs}\t${scores || row.status}`;
    })
    .join('\n');
}
