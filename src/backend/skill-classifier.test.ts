import { describe, expect, it } from 'vitest';
import { isOk } from '../core/result.js';
import { FakeSkillClassifier } from './skill-classifier.js';
import type { LabelPoolRow, TopicQuestion } from './market-types.js';

const row = (id: string): LabelPoolRow => ({
  id,
  name: id,
  source: id.split('/').slice(0, 2).join('/'),
  installs: 1,
  description: null,
  labelExcerpt: null,
  owner: id.split('/')[0] ?? id,
});

const question = (fieldSlug: string): TopicQuestion => ({ fieldSlug, prompt: `Is this about ${fieldSlug}?` });

const QUESTIONS = [question('frontend'), question('testing')];

describe('FakeSkillClassifier', () => {
  it('returns scripted probabilities, filling every question, and zeros for unknown ids', async () => {
    const classifier = new FakeSkillClassifier({
      probabilities: new Map([['a/r/known', { frontend: 0.9 }]]),
    });

    const result = await classifier.classify([row('a/r/known'), row('a/r/missing')], QUESTIONS);

    expect(isOk(result) && result.value.map(({ id, status, probabilities }) => ({ id, status, probabilities }))).toEqual([
      { id: 'a/r/known', status: 'ok', probabilities: { frontend: 0.9, testing: 0 } },
      { id: 'a/r/missing', status: 'ok', probabilities: { frontend: 0, testing: 0 } },
    ]);
  });

  it('fromSlugs scores labelled fields 1.0 and the rest 0', async () => {
    const classifier = FakeSkillClassifier.fromSlugs(new Map([['a/r/one', ['testing']]]));

    const result = await classifier.classify([row('a/r/one')], QUESTIONS);

    expect(isOk(result) && result.value[0]?.probabilities).toEqual({ frontend: 0, testing: 1 });
  });

  it('returns status error with empty probabilities for scripted failing ids', async () => {
    const classifier = new FakeSkillClassifier({
      probabilities: new Map([['a/r/bad', { frontend: 1 }]]),
      failIds: ['a/r/bad'],
    });

    const result = await classifier.classify([row('a/r/bad'), row('a/r/good')], QUESTIONS);

    expect(isOk(result) && result.value.map(({ id, status, probabilities }) => ({ id, status, probabilities }))).toEqual([
      { id: 'a/r/bad', status: 'error', probabilities: {} },
      { id: 'a/r/good', status: 'ok', probabilities: { frontend: 0, testing: 0 } },
    ]);
  });

  it('returns the scripted error for the whole call', async () => {
    const classifier = new FakeSkillClassifier({ error: new Error('jev down') });

    const result = await classifier.classify([row('a/r/one')], QUESTIONS);

    expect(!isOk(result) && result.error.message).toBe('jev down');
  });

  it('stamps stateHash and modelVersion, and records each call', async () => {
    const classifier = new FakeSkillClassifier({ stateHash: (r) => `h:${r.name}` });

    const result = await classifier.classify([row('a/r/one')], QUESTIONS);

    expect(isOk(result) && result.value[0]).toMatchObject({ stateHash: 'h:a/r/one', modelVersion: 'fake' });
    expect(classifier.calls).toEqual([{ rows: [row('a/r/one')], questions: QUESTIONS }]);
  });
});
