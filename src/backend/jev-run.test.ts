import { describe, expect, it, vi } from 'vitest';
import { isOk, ok } from '../core/result.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import type { MarketSkillsClient } from './market-client.js';
import { JevError, type JevClient } from './jev-client.js';
import { runJevLabelAndShelves } from './jev-run.js';
import { JevSkillClassifier } from './jev-skill-classifier.js';
import { buildLabelState, stateHash } from './label-state.js';
import { MarketSync } from './market-sync.js';
import type { LabelPoolRow } from './market-types.js';
import { FakeSkillClassifier } from './skill-classifier.js';
import { summarize } from './sync-summary.js';
import { TAXONOMY_VERSION, TOPIC_QUESTIONS } from './topic-taxonomy.js';

const at = '2026-01-01T00:00:00.000Z';
const hashOf = (row: LabelPoolRow) => stateHash(buildLabelState(row));

const unusedClient: MarketSkillsClient = {
  listPage: vi.fn(async () => ok({ items: [] })),
  getSkill: vi.fn(async () => ok({ description: null, hash: 'unused' })),
  getAudit: vi.fn(async () => ok({ status: 'none' as const })),
  getSkillMd: vi.fn(async () => ok(null)),
};

/** Ten `owner/repo/skill` rows across five owners, plus the `frontend` field. */
async function seededStore(): Promise<{ store: InMemoryMarketStore; ids: string[] }> {
  const store = new InMemoryMarketStore();
  await store.upsertRole({ slug: 'swe', label: 'SWE', sortOrder: 1, active: true });
  await store.upsertField({
    slug: 'frontend',
    roleSlug: 'swe',
    label: 'Frontend',
    q: 'frontend',
    sortOrder: 1,
    shelfSize: 30,
    active: true,
  });
  const ids = Array.from({ length: 10 }, (_, i) => `owner${i % 5}/repo/skill${i}`);
  for (const [i, id] of ids.entries()) {
    const cut = id.lastIndexOf('/');
    await store.upsertListing(
      {
        id,
        name: id.slice(cut + 1),
        slug: id.slice(cut + 1),
        source: id.slice(0, cut),
        installs: 100 - i,
        installUrl: `https://skills.sh/${id}`,
        url: `https://github.com/${id}`,
      },
      at,
    );
  }
  return { store, ids };
}

/** Scores every id 0.9 on `frontend` (one skill per shelf slot, 5 owners). */
function frontendClassifier(ids: string[], extra: { failIds?: string[] } = {}) {
  return new FakeSkillClassifier({
    probabilities: new Map(ids.map((id) => [id, { frontend: 0.9 }])),
    stateHash: hashOf,
    ...extra,
  });
}

function setup(store: InMemoryMarketStore) {
  const sync = new MarketSync({ store, client: unusedClient });
  const lines: string[] = [];
  return { sync, lines, log: (line: string) => lines.push(line) };
}

describe('runJevLabelAndShelves', () => {
  it('labels the pool, writes shelves, and reports real counts and shelf meta', async () => {
    const { store, ids } = await seededStore();
    const { sync, log, lines } = setup(store);

    const outcome = await runJevLabelAndShelves({ sync, store, classifier: frontendClassifier(ids), log });

    expect(outcome.failure).toBeUndefined();
    expect(outcome.shelvesWritten).toBe(true);
    expect(outcome.stats).toMatchObject({ labeled: 10, needed: 10, errored: 0, taxonomyVersion: TAXONOMY_VERSION });
    const meta = await store.getShelfMeta();
    expect(isOk(meta) && meta.value?.generatedAt).toBeTruthy();
    expect(outcome.shelvesGeneratedAt).toBe(isOk(meta) ? meta.value?.generatedAt : 'unreachable');
    const shelves = await store.listShelves();
    const frontend = isOk(shelves) ? shelves.value.flatMap((r) => r.fields).find((f) => f.slug === 'frontend') : null;
    expect(frontend?.skills).toHaveLength(10);
    expect(lines.join('\n')).toContain('frontend');
    expect(summarize(outcome)).toMatchObject({ status: 'ok', labeled: 10, needed: 10, shelvesWritten: true });
  });

  it('dry run writes nothing and prints the label diff and shelf-health numbers', async () => {
    const { store, ids } = await seededStore();
    // Already fully labeled, except one row that has changed since: coverage passes on stored labels.
    const pool = await store.listLabelPool();
    const rows = isOk(pool) ? pool.value : [];
    await store.saveLabels(
      TAXONOMY_VERSION,
      rows.map((row) => ({
        id: row.id,
        status: 'ok' as const,
        probabilities: { frontend: 0.9 },
        stateHash: hashOf(row),
        modelVersion: 'fake',
      })),
    );
    await store.saveLabels(TAXONOMY_VERSION, [
      { id: ids[0]!, status: 'error', probabilities: {}, stateHash: hashOf(rows[0]!), modelVersion: '' },
    ]);
    const before = await store.listLabels(TAXONOMY_VERSION);
    const saveLabels = vi.spyOn(store, 'saveLabels');
    const replaceShelves = vi.spyOn(store, 'replaceShelves');
    const { sync, log, lines } = setup(store);

    const outcome = await runJevLabelAndShelves(
      { sync, store, classifier: frontendClassifier(ids), log },
      { dryRun: true },
    );

    expect(saveLabels).not.toHaveBeenCalled();
    expect(replaceShelves).not.toHaveBeenCalled();
    expect(await store.listLabels(TAXONOMY_VERSION)).toEqual(before);
    expect(await store.getShelfMeta()).toEqual(ok(null));
    expect(outcome.failure).toBeUndefined();
    expect(outcome.shelvesWritten).toBe(false);
    expect(outcome.shelvesGeneratedAt).toBeNull();
    expect(outcome.stats).toMatchObject({ needed: 1, labeled: 1 });
    const printed = lines.join('\n');
    expect(printed).toMatch(/dry run/i);
    expect(printed).toMatch(/retried 1/);
    expect(printed).toMatch(/unlabeled .*10%/i);
    expect(printed).toMatch(/review band/i);
    expect(printed).toMatch(/frontend: 9 .*5 owners/);
  });

  it('dry run on unsaved labels fails as incomplete_coverage and still writes nothing', async () => {
    const { store, ids } = await seededStore();
    const saveLabels = vi.spyOn(store, 'saveLabels');
    const replaceShelves = vi.spyOn(store, 'replaceShelves');
    const { sync, log, lines } = setup(store);

    const outcome = await runJevLabelAndShelves(
      { sync, store, classifier: frontendClassifier(ids), log },
      { dryRun: true },
    );

    expect(saveLabels).not.toHaveBeenCalled();
    expect(replaceShelves).not.toHaveBeenCalled();
    expect(outcome.failure).toMatchObject({ step: 'shelves', kind: 'incomplete_coverage' });
    expect(lines.join('\n')).toMatch(/added 10/);
  });

  it('maps too many errored answers to bad_answers at the label step and skips shelves', async () => {
    const { store, ids } = await seededStore();
    const replaceShelves = vi.spyOn(store, 'replaceShelves');
    const { sync, log } = setup(store);

    const outcome = await runJevLabelAndShelves({
      sync,
      store,
      classifier: frontendClassifier(ids, { failIds: [ids[3]!] }),
      log,
    });

    expect(outcome.failure).toMatchObject({ step: 'label', kind: 'bad_answers' });
    expect(outcome.stats).toMatchObject({ needed: 10, labeled: 9, errored: 1 });
    expect(outcome.shelvesWritten).toBe(false);
    expect(replaceShelves).not.toHaveBeenCalled();
    const summary = summarize(outcome);
    expect(summary).toMatchObject({ failedStep: 'label', failureKind: 'bad_answers', errored: 1 });
    expect(summary.firstError).toContain('next run retries');
  });

  it('maps a coverage gap after labeling to incomplete_coverage at the shelves step', async () => {
    const { store, ids } = await seededStore();
    const replaceShelves = vi.spyOn(store, 'replaceShelves');
    const { sync, log } = setup(store);
    // Saves labels whose state_hash never matches the rows, so the gate sees them as missing.
    const classifier = new FakeSkillClassifier({ probabilities: new Map(ids.map((id) => [id, { frontend: 0.9 }])) });

    const outcome = await runJevLabelAndShelves({ sync, store, classifier, log });

    expect(outcome.failure).toMatchObject({ step: 'shelves', kind: 'incomplete_coverage' });
    expect(outcome.shelvesWritten).toBe(false);
    expect(outcome.stats).toMatchObject({ labeled: 10, needed: 10 });
    expect(replaceShelves).not.toHaveBeenCalled();
    const summary = summarize(outcome);
    expect(summary).toMatchObject({ status: 'failed', failedStep: 'shelves', failureKind: 'incomplete_coverage' });
    expect(summary.firstError).toContain('10 of 10');
    expect(summary.firstError).toContain('shelves left unchanged');
  });

  it("keeps a whole-call classifier error's own kind", async () => {
    const { store } = await seededStore();
    const { sync, log } = setup(store);
    const classifier = new FakeSkillClassifier({ error: new JevError('auth', 'Unauthorized', 401) });

    const outcome = await runJevLabelAndShelves({ sync, store, classifier, log });

    expect(outcome.failure).toMatchObject({ step: 'label', kind: 'auth' });
    expect(summarize(outcome).firstError).toBe('401 Unauthorized');
  });

  it('reports model calls and input tokens from a JevSkillClassifier', async () => {
    const { store } = await seededStore();
    const { sync, log } = setup(store);
    let calls = 0;
    const jev: JevClient = {
      async evaluate() {
        calls += 1;
        return ok({
          answers: Object.fromEntries(
            TOPIC_QUESTIONS.map((q) => [q.fieldSlug, { kind: 'boolean' as const, probability: 0.9 }]),
          ),
          modelVersion: 'jev-test',
          inputTokens: 120,
        });
      },
    };
    const classifier = new JevSkillClassifier(jev, { sleep: async () => {} });

    const outcome = await runJevLabelAndShelves({ sync, store, classifier, log });

    expect(outcome.failure).toBeUndefined();
    expect(calls).toBe(10);
    expect(outcome.stats).toMatchObject({ modelCalls: 10, inputTokens: 1200 });
    expect(classifier.usage).toEqual({ modelCalls: 10, inputTokens: 1200 });
  });
});
