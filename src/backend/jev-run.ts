import { isOk } from '../core/result.js';
import type { LabelDiff, LabelPoolError, LabelRunResult, MarketSync, ShelfRunResult } from './market-sync.js';
import type { MarketStore } from './market-store.js';
import type { JevUsage } from './jev-skill-classifier.js';
import type { SkillClassifier } from './skill-classifier.js';
import { failureKindOf, type SyncRunOutcome, type SyncRunStats, type SyncStep } from './sync-summary.js';
import { TAXONOMY_VERSION } from './topic-taxonomy.js';

/**
 * The `--jev` label → shelves path of `scripts/sync-market.ts` (temporary flag,
 * design §4.5 / §5.1): `labelPool` with the given classifier, then
 * `rebuildShelves`, then the shelf meta, as a `SyncRunOutcome` for `summarize()`.
 */
export interface JevRunDeps {
  sync: Pick<MarketSync, 'labelPool' | 'rebuildShelves'>;
  store: Pick<MarketStore, 'getShelfMeta'>;
  /** `usage` (from `JevSkillClassifier`) feeds `modelCalls` / `inputTokens`. */
  classifier: SkillClassifier & { readonly usage?: JevUsage };
  log?: (line: string) => void;
}

export interface JevRunOptions {
  /** Passed to both `labelPool` and `rebuildShelves`: no label or shelf writes. */
  dryRun?: boolean;
}

/** `rebuildShelves` refused to write because some active rows have no current label. */
export class ShelfCoverageError extends Error {
  readonly kind = 'incomplete_coverage' as const;

  constructor(readonly result: ShelfRunResult) {
    super(`${result.missing} of ${result.pool} active rows have no current ${TAXONOMY_VERSION} label`);
    this.name = 'ShelfCoverageError';
  }
}

/** Never throws for a returned `Err`; the caller still catches unexpected throws. */
export async function runJevLabelAndShelves(deps: JevRunDeps, opts: JevRunOptions = {}): Promise<SyncRunOutcome> {
  const log = deps.log ?? (() => {});
  const dryRun = opts.dryRun ?? false;
  const prefix = dryRun ? 'Dry run: ' : '';
  const stats: Partial<SyncRunStats> = { taxonomyVersion: TAXONOMY_VERSION };
  const finish = async (rest: Omit<SyncRunOutcome, 'stats' | 'shelvesGeneratedAt'>): Promise<SyncRunOutcome> => {
    Object.assign(stats, deps.classifier.usage);
    return { ...rest, stats, shelvesGeneratedAt: await shelvesGeneratedAt(deps.store, log) };
  };
  const failed = (step: SyncStep, error: Error, fallback: 'unavailable' | 'store') => {
    log(error.message);
    return finish({ failure: { step, kind: failureKindOf(error, fallback), error }, shelvesWritten: false });
  };

  log(`${prefix}labeling the pool with Jev (taxonomy ${TAXONOMY_VERSION})...`);
  const labeled = await deps.sync.labelPool(deps.classifier, { dryRun });
  if (!isOk(labeled)) {
    const partial = (labeled.error as Partial<LabelPoolError>).result;
    if (partial) Object.assign(stats, labelCounts(partial));
    return failed('label', labeled.error, 'unavailable');
  }
  Object.assign(stats, labelCounts(labeled.value));
  for (const line of formatLabelRun(labeled.value, dryRun)) log(line);

  log(`${prefix}rebuilding shelves...`);
  const shelves = await deps.sync.rebuildShelves({ dryRun });
  if (!isOk(shelves)) return failed('shelves', shelves.error, 'store');
  for (const line of formatShelfHealth(shelves.value)) log(line);
  if (shelves.value.reason === 'incomplete_coverage') {
    if (dryRun) log('Dry run: labels above were not saved, so the coverage gate reads only stored labels.');
    return failed('shelves', new ShelfCoverageError(shelves.value), 'store');
  }
  log(shelves.value.written ? 'Shelves written.' : 'Dry run: shelves not written.');
  return finish({ shelvesWritten: shelves.value.written });
}

function labelCounts(result: LabelRunResult): Pick<SyncRunStats, 'labeled' | 'needed' | 'errored'> {
  return { labeled: result.labeled, needed: result.needed, errored: result.errored };
}

async function shelvesGeneratedAt(store: JevRunDeps['store'], log: (line: string) => void): Promise<string | null> {
  const meta = await store.getShelfMeta();
  if (!isOk(meta)) {
    log(`Could not read shelf meta: ${meta.error.message}`);
    return null;
  }
  return meta.value?.generatedAt ?? null;
}

const DIFF_SAMPLE = 5;

/** Label counts plus the diff against stored labels (ids sampled). */
export function formatLabelRun(result: LabelRunResult, dryRun: boolean): string[] {
  const verb = dryRun ? 'would save' : 'saved';
  const lines = [
    `Labels: ${result.needed} needed, ${result.labeled} ok, ${result.errored} errored, ` +
      `${result.skippedUnchanged} unchanged, ${result.batches} batch(es) (${verb}).`,
    `Label diff: added ${result.diff.added.length}, changed ${result.diff.changed.length}, retried ${result.diff.retried.length}`,
  ];
  for (const key of ['added', 'changed', 'retried'] as const satisfies ReadonlyArray<keyof LabelDiff>) {
    const ids = result.diff[key];
    if (ids.length === 0) continue;
    const more = ids.length > DIFF_SAMPLE ? ` (+${ids.length - DIFF_SAMPLE} more)` : '';
    lines.push(`  ${key}: ${ids.slice(0, DIFF_SAMPLE).join(', ')}${more}`);
  }
  return lines;
}

const percent = (share: number) => `${(share * 100).toFixed(1).replace(/\.0$/, '')}%`;

/** Shelf-health numbers from `rebuildShelves` (design §4.6). */
export function formatShelfHealth(result: ShelfRunResult): string[] {
  const lines = [
    `Pool ${result.pool}: ${result.missing} missing a current label, ${result.errored} errored, ` +
      `unlabeled ${result.unlabeled} (${percent(result.unlabeledShare)}), review band ${result.reviewBand}.`,
  ];
  for (const field of result.fields) {
    lines.push(
      `  ${field.slug}: ${field.count} skills, ${field.distinctOwners} owners (top owner ${percent(field.topOwnerShare)})`,
    );
  }
  return lines;
}
