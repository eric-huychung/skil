import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { isOk } from '../core/result.js';
import { CLASSIFY_FETCH_RETRIES, CLASSIFY_MODEL, LlmSkillClassifier } from './llm-skill-classifier.js';
import type { LabelPoolRow, MarketClassifyRow, TopicQuestion } from './market-types.js';
import { GOLD_LABELS, GOLD_LISTINGS } from './shelf-gold.fixture.js';

const question = (fieldSlug: string): TopicQuestion => ({ fieldSlug, prompt: `Is this about ${fieldSlug}?` });

const poolRow = (row: MarketClassifyRow): LabelPoolRow => ({
  id: row.id,
  name: row.name,
  source: row.id.split('/').slice(0, 2).join('/'),
  installs: row.installs,
  description: row.description,
  labelExcerpt: null,
  owner: row.id.split('/')[0] ?? row.id,
});

const GOLD_ROWS = GOLD_LISTINGS.map(poolRow);

function goldContent(): string {
  return JSON.stringify({ results: GOLD_LABELS });
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('LlmSkillClassifier', () => {
  const fields = ['frontend', 'testing', 'review', 'workflow', 'integrations', 'prd'].map(question);

  it('posts one gold batch to the gateway and scores recorded slugs 1.0, the rest 0', async () => {
    const fetchImpl = fakeFetch(200, {
      choices: [{ message: { content: goldContent() } }],
    });
    const classifier = new LlmSkillClassifier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'test-token',
    });

    const result = await classifier.classify(GOLD_ROWS, fields);

    expect(isOk(result) && result.value.map(({ id, status, probabilities }) => ({ id, status, probabilities }))).toEqual(
      GOLD_ROWS.map((row) => {
        const slugs = GOLD_LABELS.find((label) => label.id === row.id)?.fieldSlugs ?? [];
        return {
          id: row.id,
          status: 'ok',
          probabilities: Object.fromEntries(fields.map((q) => [q.fieldSlug, slugs.includes(q.fieldSlug) ? 1 : 0])),
        };
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    const posted = JSON.parse(String(init.body)) as { model: string };
    expect(posted.model).toBe(CLASSIFY_MODEL);
  });

  it('retries a dropped fetch then succeeds', async () => {
    const fetchImpl = vi.fn(async () => {
      if (fetchImpl.mock.calls.length === 1) {
        throw new TypeError('fetch failed');
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: goldContent() } }] }), {
        status: 200,
      });
    });
    const classifier = new LlmSkillClassifier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'test-token',
    });

    const result = await classifier.classify(GOLD_ROWS, fields);

    expect(isOk(result)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns Err and no labels when a later batch fails', async () => {
    const skills: LabelPoolRow[] = Array.from({ length: 21 }, (_, i) => ({
      id: `a/r/${i}`,
      name: `n${i}`,
      source: 'a/r',
      installs: i,
      description: null,
      labelExcerpt: null,
      owner: 'a',
    }));
    const fetchImpl = vi.fn(async () => {
      if (fetchImpl.mock.calls.length === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"results":[]}' } }] }), { status: 200 });
      }
      return new Response('nope', { status: 500 });
    });
    const classifier = new LlmSkillClassifier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'test-token',
    });

    const result = await classifier.classify(skills, fields);

    expect(isOk(result)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1 + 1 + CLASSIFY_FETCH_RETRIES);
  });

  it('ignores slugs outside the questions and stamps stateHash and modelVersion', async () => {
    const row = GOLD_ROWS[0]!;
    const content = JSON.stringify({ results: [{ id: row.id, fieldSlugs: ['frontend', 'made-up'] }] });
    const classifier = new LlmSkillClassifier({
      fetchImpl: fakeFetch(200, { choices: [{ message: { content } }] }) as unknown as typeof fetch,
      getAccessToken: async () => 'test-token',
    });

    const result = await classifier.classify([row], [question('frontend'), question('testing')]);

    const sent = JSON.stringify({ id: row.id, name: row.name, description: row.description });
    expect(isOk(result) && result.value).toEqual([
      {
        id: row.id,
        status: 'ok',
        probabilities: { frontend: 1, testing: 0 },
        stateHash: createHash('sha256').update(sent, 'utf8').digest('hex'),
        modelVersion: CLASSIFY_MODEL,
      },
    ]);
  });
});
