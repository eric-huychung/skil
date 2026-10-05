import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok, type Result } from '../core/result.js';
import {
  CREATOR_DOMAINS,
  CREATOR_QUESTIONS,
  CREATOR_STATE_SKILLS,
  buildCreatorState,
  creatorKey,
  gateCreators,
  type CreatorGateInput,
} from './creator-gate.js';
import { InMemoryMarketStore } from './in-memory-market-store.js';
import { JevError, type JevClient, type JevEvaluation, type JevQuestion } from './jev-client.js';

class FakeJev implements JevClient {
  calls: { state: string; questions: Record<string, JevQuestion> }[] = [];
  constructor(private readonly answer: (state: string) => Result<JevEvaluation> = () => evaluation(0.9, 'software-dev')) {}

  async evaluate(state: string, questions: Record<string, JevQuestion>): Promise<Result<JevEvaluation>> {
    this.calls.push({ state, questions });
    return this.answer(state);
  }
}

function evaluation(tech: number, domain: string): Result<JevEvaluation> {
  return ok({
    answers: {
      tech: { kind: 'boolean', probability: tech },
      domain: { kind: 'choice', option: domain, probabilities: { [domain]: 0.8 } },
    },
    modelVersion: 'jev-1',
    inputTokens: 100,
  });
}

function creator(owners: string[], skillNames: string[]): CreatorGateInput {
  return {
    owners,
    skills: skillNames.map((name, i) => ({ name, description: `${name} does things`, installs: 1000 - i })),
  };
}

describe('creatorKey', () => {
  it('sorts owner aliases and joins them with +', () => {
    expect(creatorKey(['open.feishu.cn', 'larksuite'])).toBe('larksuite+open.feishu.cn');
  });
});

describe('buildCreatorState', () => {
  it('names the owners and lists the top skills by installs with descriptions', () => {
    const state = buildCreatorState(['larksuite', 'open.feishu.cn'], [
      { name: 'low', description: 'rarely used', installs: 1 },
      { name: 'high', description: 'very popular', installs: 500 },
      { name: 'bare', description: null, installs: 50 },
    ]);

    expect(state).toContain('larksuite, open.feishu.cn');
    expect(state.indexOf('high: very popular')).toBeLessThan(state.indexOf('bare'));
    expect(state.indexOf('bare')).toBeLessThan(state.indexOf('low: rarely used'));
    expect(state).not.toContain('null');
  });

  it(`keeps only the top ${CREATOR_STATE_SKILLS} skills`, () => {
    const names = Array.from({ length: 15 }, (_, i) => `skill-${String(i).padStart(2, '0')}`);
    const state = buildCreatorState(['acme'], creator(['acme'], names).skills);

    expect(state).toContain('skill-09');
    expect(state).not.toContain('skill-10');
  });

  it('does not depend on the input order of skills', () => {
    const skills = creator(['acme'], ['a', 'b', 'c']).skills;
    expect(buildCreatorState(['acme'], [...skills].reverse())).toBe(buildCreatorState(['acme'], skills));
  });
});

describe('gateCreators', () => {
  it('asks Jev one tech question plus one domain choice per owner and caches the answers', async () => {
    const jev = new FakeJev((state) => (state.includes('media-co') ? evaluation(0.1, 'media-generation') : evaluation(0.9, 'software-dev')));
    const store = new InMemoryMarketStore();

    const result = await gateCreators([creator(['acme'], ['lint']), creator(['media-co'], ['video'])], jev, store);

    expect(jev.calls).toHaveLength(2);
    expect(jev.calls[0]?.questions).toEqual(CREATOR_QUESTIONS);
    expect(CREATOR_QUESTIONS.tech?.kind).toBe('boolean');
    expect(CREATOR_QUESTIONS.domain).toEqual({ kind: 'choice', prompt: expect.any(String), options: CREATOR_DOMAINS });
    expect(isOk(result) && result.value.checks).toEqual([
      { creatorKey: 'acme', techProbability: 0.9, domain: 'software-dev', modelVersion: 'jev-1', cached: false },
      { creatorKey: 'media-co', techProbability: 0.1, domain: 'media-generation', modelVersion: 'jev-1', cached: false },
    ]);
    const saved = await store.getCreatorChecks(['acme', 'media-co']);
    expect(isOk(saved) && saved.value.map((row) => [row.creatorKey, row.techProbability, row.domain])).toEqual([
      ['acme', 0.9, 'software-dev'],
      ['media-co', 0.1, 'media-generation'],
    ]);
  });

  it('second run makes zero Jev calls for unchanged owners', async () => {
    const store = new InMemoryMarketStore();
    const owners = [creator(['acme'], ['lint']), creator(['open.feishu.cn', 'larksuite'], ['docs'])];
    await gateCreators(owners, new FakeJev(), store);

    const jev = new FakeJev();
    const result = await gateCreators(owners, jev, store);

    expect(jev.calls).toHaveLength(0);
    expect(isOk(result) && result.value.checks).toEqual([
      { creatorKey: 'acme', techProbability: 0.9, domain: 'software-dev', modelVersion: 'jev-1', cached: true },
      {
        creatorKey: 'larksuite+open.feishu.cn',
        techProbability: 0.9,
        domain: 'software-dev',
        modelVersion: 'jev-1',
        cached: true,
      },
    ]);
  });

  it('a state-hash change triggers exactly one call', async () => {
    const store = new InMemoryMarketStore();
    await gateCreators([creator(['acme'], ['lint']), creator(['beta'], ['docs'])], new FakeJev(), store);

    const jev = new FakeJev(() => evaluation(0.3, 'marketing-sales'));
    const result = await gateCreators([creator(['acme'], ['lint', 'seo-copy']), creator(['beta'], ['docs'])], jev, store);

    expect(jev.calls).toHaveLength(1);
    expect(jev.calls[0]?.state).toContain('seo-copy');
    expect(isOk(result) && result.value.checks.map((c) => [c.creatorKey, c.techProbability, c.cached])).toEqual([
      ['acme', 0.3, false],
      ['beta', 0.9, true],
    ]);
    const saved = await store.getCreatorChecks(['acme']);
    expect(isOk(saved) && saved.value[0]?.domain).toBe('marketing-sales');
  });

  it('reports a failed owner, keeps going, and caches nothing for it', async () => {
    const jev = new FakeJev((state) =>
      state.includes('flaky') ? err(new JevError('unavailable', 'Jev returned 503')) : evaluation(0.9, 'software-dev'),
    );
    const store = new InMemoryMarketStore();

    const result = await gateCreators([creator(['flaky'], ['x']), creator(['acme'], ['lint'])], jev, store);

    expect(isOk(result) && result.value.failed).toEqual([{ creatorKey: 'flaky', message: 'Jev returned 503' }]);
    expect(isOk(result) && result.value.checks.map((c) => c.creatorKey)).toEqual(['acme']);
    const saved = await store.getCreatorChecks(['flaky']);
    expect(isOk(saved) && saved.value).toEqual([]);
  });

  it('treats answers of the wrong kind as a failed owner', async () => {
    const jev = new FakeJev(() =>
      ok({ answers: { tech: { kind: 'boolean', probability: 0.9 } }, modelVersion: 'jev-1', inputTokens: 1 }),
    );

    const result = await gateCreators([creator(['acme'], ['lint'])], jev, new InMemoryMarketStore());

    expect(isOk(result) && result.value.failed.map((f) => f.creatorKey)).toEqual(['acme']);
  });

  it('stops on a Jev auth error instead of failing every owner', async () => {
    const jev = new FakeJev(() => err(new JevError('auth', 'Jev returned 401', 401)));

    const result = await gateCreators([creator(['acme'], ['lint']), creator(['beta'], ['docs'])], jev, new InMemoryMarketStore());

    expect(isErr(result)).toBe(true);
    expect(jev.calls).toHaveLength(1);
  });

  it('returns the store error when the cache read fails', async () => {
    const store = new InMemoryMarketStore();
    store.getCreatorChecks = async () => err(new Error('db down'));
    const jev = new FakeJev();

    const result = await gateCreators([creator(['acme'], ['lint'])], jev, store);

    expect(isErr(result) && result.error.message).toBe('db down');
    expect(jev.calls).toHaveLength(0);
  });
});
