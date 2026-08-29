import { describe, expect, it, vi } from 'vitest';
import { isOk } from '../core/result.js';
import { CLASSIFY_MODEL, LlmSkillClassifier } from './llm-skill-classifier.js';
import type { MarketClassifyRow, MarketField } from './market-types.js';
import { GOLD_LABELS, GOLD_LISTINGS } from './shelf-gold.fixture.js';

const field = (slug: string): MarketField => ({
  slug,
  roleSlug: 'swe',
  label: slug,
  q: slug,
  sortOrder: 1,
  shelfSize: 30,
  active: true,
});

function goldContent(): string {
  return JSON.stringify({ results: GOLD_LABELS });
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('LlmSkillClassifier', () => {
  const fields = ['frontend', 'testing', 'review', 'workflow', 'integrations', 'prd'].map(field);

  it('posts one gold batch to the gateway and parses the recorded slugs', async () => {
    const fetchImpl = fakeFetch(200, {
      choices: [{ message: { content: goldContent() } }],
    });
    const classifier = new LlmSkillClassifier({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getAccessToken: async () => 'test-token',
    });

    const result = await classifier.classify(GOLD_LISTINGS, fields);

    expect(isOk(result) && result.value).toEqual(
      GOLD_LISTINGS.map((row) => GOLD_LABELS.find((label) => label.id === row.id) ?? { id: row.id, fieldSlugs: [] }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    const posted = JSON.parse(String(init.body)) as { model: string };
    expect(posted.model).toBe(CLASSIFY_MODEL);
  });

  it('returns Err and no labels when a later batch fails', async () => {
    const skills: MarketClassifyRow[] = Array.from({ length: 21 }, (_, i) => ({
      id: `a/${i}`,
      name: `n${i}`,
      slug: `n${i}`,
      installs: i,
      description: null,
      hash: null,
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
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
