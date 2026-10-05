import { describe, expect, it } from 'vitest';
import { SEED_FIELDS } from './market-seed.js';
import {
  MAX_TOPICS_PER_SKILL,
  REVIEW_BAND,
  TAXONOMY_VERSION,
  TOPIC_QUESTIONS,
  TOPIC_THRESHOLD,
  taxonomyVersion,
  topicsFor,
} from './topic-taxonomy.js';

describe('TOPIC_QUESTIONS', () => {
  it('has one question per active seed field, both directions', () => {
    const questionSlugs = TOPIC_QUESTIONS.map((q) => q.fieldSlug);
    const activeSlugs = SEED_FIELDS.filter((f) => f.active).map((f) => f.slug);
    const allSlugs = new Set(SEED_FIELDS.map((f) => f.slug));

    expect(new Set(questionSlugs).size).toBe(questionSlugs.length);
    for (const slug of questionSlugs) expect(allSlugs.has(slug)).toBe(true);
    for (const slug of activeSlugs) expect(questionSlugs).toContain(slug);
  });

  it('every prompt is a non-empty yes/no question', () => {
    for (const q of TOPIC_QUESTIONS) {
      expect(q.prompt.trim().length).toBeGreaterThan(0);
      expect(q.prompt.trim().endsWith('?')).toBe(true);
    }
  });

  it('rewords workflow and integrations concretely', () => {
    const prompt = (slug: string) => TOPIC_QUESTIONS.find((q) => q.fieldSlug === slug)?.prompt ?? '';
    expect(prompt('workflow')).toMatch(/coding agent/i);
    expect(prompt('integrations')).toMatch(/third-party|vendor/i);
  });
});

describe('TAXONOMY_VERSION', () => {
  it('is a 12-char hex hash of the questions', () => {
    expect(TAXONOMY_VERSION).toMatch(/^[0-9a-f]{12}$/);
    expect(taxonomyVersion(TOPIC_QUESTIONS)).toBe(TAXONOMY_VERSION);
  });

  it('changes when a prompt changes and reverts with it', () => {
    const changed = TOPIC_QUESTIONS.map((q, i) => (i === 0 ? { ...q, prompt: `${q.prompt} ` } : q));
    expect(taxonomyVersion(changed)).not.toBe(TAXONOMY_VERSION);
    expect(taxonomyVersion(TOPIC_QUESTIONS.map((q) => ({ ...q })))).toBe(TAXONOMY_VERSION);
  });

  it('changes when a field is added', () => {
    const added = [...TOPIC_QUESTIONS, { fieldSlug: 'new-field', prompt: 'Is this new?' }];
    expect(taxonomyVersion(added)).not.toBe(TAXONOMY_VERSION);
  });
});

describe('constants', () => {
  it('match the tuned values', () => {
    expect(TOPIC_THRESHOLD).toBe(0.4);
    expect(MAX_TOPICS_PER_SKILL).toBe(3);
    expect(REVIEW_BAND).toEqual({ low: 0.4, high: 0.6 });
  });
});

describe('topicsFor', () => {
  it('keeps fields at or above the threshold, highest first', () => {
    expect(topicsFor({ api: 0.7, testing: 0.95, viz: 0.59, review: 0.6 }, 0.6, 3)).toEqual([
      'testing',
      'api',
      'review',
    ]);
  });

  it('caps at max', () => {
    const probs = { a: 0.9, b: 0.8, c: 0.7, d: 0.65, e: 0.99 };
    expect(topicsFor(probs, 0.6, 3)).toEqual(['e', 'a', 'b']);
    expect(topicsFor(probs, 0.6, 1)).toEqual(['e']);
  });

  it('returns no topics when nothing clears the threshold', () => {
    expect(topicsFor({ a: 0.59, b: 0.1 }, 0.6, 3)).toEqual([]);
    expect(topicsFor({}, 0.6, 3)).toEqual([]);
  });

  it('breaks ties by slug for stable output', () => {
    expect(topicsFor({ zeta: 0.8, alpha: 0.8 }, 0.6, 3)).toEqual(['alpha', 'zeta']);
  });
});
