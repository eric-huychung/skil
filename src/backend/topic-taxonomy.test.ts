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

describe('T23 tech topics', () => {
  const NEW_SLUGS = ['mobile', 'ai-ml', 'languages', 'agent-tooling', 'game-dev', 'docs'];

  const REWORDED_SLUGS = ['integrations', 'workflow', 'frontend', 'devops'];

  it('leaves the other 17 earlier questions byte-for-byte unchanged', () => {
    const untouched = TOPIC_QUESTIONS.filter((q) => ![...NEW_SLUGS, ...REWORDED_SLUGS].includes(q.fieldSlug));
    expect(untouched).toHaveLength(17);
    // Hash of those 17 as they stood in the first label run (ff85d19cf77d).
    expect(taxonomyVersion(untouched)).toBe('8f1d389f9de9');
  });

  it('narrows the four broad earlier questions word for word', () => {
    const prompt = (slug: string) => TOPIC_QUESTIONS.find((q) => q.fieldSlug === slug)?.prompt;
    expect(prompt('integrations')).toBe(
      'Is this skill mainly about connecting to or operating one named third-party SaaS, developer platform or vendor service (for example Slack, Stripe, Salesforce, Lark, Firebase), rather than a programming language, mobile or game platform, cloud platform, AI/ML framework, or a general technique?',
    );
    expect(prompt('workflow')).toBe(
      'Is this a skill that changes how a coding agent itself works: how it plans, asks clarifying questions, breaks down or hands off tasks, or uses git safely?',
    );
    expect(prompt('frontend')).toBe(
      'Is this skill mainly about building web frontends (UI components, React, CSS, client-side code)?',
    );
    expect(prompt('devops')).toBe(
      'Is this skill mainly about CI/CD, deployment, infrastructure, containers, cloud platforms (AWS, Azure, GCP), cloud operations or monitoring?',
    );
  });

  it('asks the six approved questions word for word', () => {
    const prompt = (slug: string) => TOPIC_QUESTIONS.find((q) => q.fieldSlug === slug)?.prompt;
    expect(TOPIC_QUESTIONS).toHaveLength(27);
    expect(prompt('mobile')).toBe(
      'Is this skill mainly about building mobile or native apps (iOS and Swift, Android and Kotlin, Flutter, React Native, Expo)?',
    );
    expect(prompt('ai-ml')).toBe(
      'Is this skill mainly about building AI or machine-learning systems (LLM apps, RAG, embeddings, prompt engineering for LLM apps, evals, fine-tuning, model training or inference, computer vision), not using a model to generate images, video or audio, and not writing agent personas, or prompts or skills for coding agents?',
    );
    expect(prompt('languages')).toBe(
      'Is this skill mainly about a programming language itself (its syntax, idioms, type system, compiler or runtime, standard library or package manager, for example Rust, Go, C#, Python, TypeScript, Swift), not a framework, platform, office or file format, config file, or a general dev tool such as a linter or pre-commit hook?',
    );
    expect(prompt('agent-tooling')).toBe(
      'Is this skill mainly about extending or configuring AI coding agents: writing skills, plugins, MCP servers or hooks, AGENTS.md or CLAUDE.md files, agent memory or context?',
    );
    expect(prompt('game-dev')).toBe(
      'Is this skill mainly about game development or real-time 3D graphics (Unity, Unreal, Godot, game design, shaders)?',
    );
    expect(prompt('docs')).toBe(
      'Is this skill mainly about writing or generating technical documentation (READMEs, ADRs, runbooks, API docs, changelogs, architecture diagrams)?',
    );
  });

  it('has a new version, so the next sync relabels', () => {
    expect(TAXONOMY_VERSION).not.toBe('ff85d19cf77d');
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
