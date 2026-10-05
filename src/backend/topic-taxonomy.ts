import { createHash } from 'node:crypto';
import type { TopicQuestion } from './market-types.js';

export type { TopicQuestion };

/**
 * Questions as data. Editing a prompt (or adding a field) changes
 * TAXONOMY_VERSION, which relabels automatically. Never hand-bump a version.
 * Parity with SEED_FIELDS is enforced by the test.
 */
export const TOPIC_QUESTIONS: TopicQuestion[] = [
  // SWE
  q('frontend', 'Is this skill mainly about building web frontends (UI components, React, CSS, client-side code)?'),
  q('backend', 'Is this skill mainly about building backend services or server-side application code?'),
  q('api', 'Is this skill mainly about designing, building or documenting APIs?'),
  q('database', 'Is this skill mainly about databases, SQL, schemas, queries or migrations?'),
  q('testing', 'Is this skill mainly about writing or running software tests?'),
  q('security', 'Is this skill mainly about software security, vulnerabilities, compliance or security review?'),
  q(
    'devops',
    'Is this skill mainly about CI/CD, deployment, infrastructure, containers, cloud platforms (AWS, Azure, GCP), cloud operations or monitoring?',
  ),
  q('review', 'Is this skill mainly about reviewing code or pull requests?'),
  // SWE, added in T23 (tech clusters that left skills unlabeled)
  q('mobile', 'Is this skill mainly about building mobile or native apps (iOS and Swift, Android and Kotlin, Flutter, React Native, Expo)?'),
  q(
    'languages',
    'Is this skill mainly about a programming language itself (its syntax, idioms, type system, compiler or runtime, standard library or package manager, for example Rust, Go, C#, Python, TypeScript, Swift), not a framework, platform, office or file format, config file, or a general dev tool such as a linter or pre-commit hook?',
  ),
  q('game-dev', 'Is this skill mainly about game development or real-time 3D graphics (Unity, Unreal, Godot, game design, shaders)?'),
  q(
    'docs',
    'Is this skill mainly about writing or generating technical documentation (READMEs, ADRs, runbooks, API docs, changelogs, architecture diagrams)?',
  ),
  // UI/UX
  q('product-ui', 'Is this skill mainly about designing product UI or UX (screens, layouts, interaction design)?'),
  q('design-system', 'Is this skill mainly about design systems, design tokens, brand styles or component libraries?'),
  q('usability', 'Is this skill mainly about usability testing, accessibility or evaluating a user experience?'),
  // PM
  q('prd', 'Is this skill mainly about writing product requirements, specs or PRDs?'),
  q('roadmap', 'Is this skill mainly about product roadmaps, prioritization or planning what to build?'),
  q('user-research', 'Is this skill mainly about user or customer research (interviews, feedback, personas)?'),
  q('competitive', 'Is this skill mainly about competitive analysis or researching competitors and alternatives?'),
  q('pm-writing', 'Is this skill mainly about stakeholder communication (updates, announcements, memos, release notes)?'),
  // Data
  q('analysis', 'Is this skill mainly about analyzing data (exploring datasets, notebooks, statistics, reporting)?'),
  q('metrics', 'Is this skill mainly about product metrics, KPIs, A/B tests or experiment analysis?'),
  q('viz', 'Is this skill mainly about data visualization (charts, plots, dashboards)?'),
  // Agent: reworded concretely (spec: the abstract "agent workflow" question did not fire)
  q(
    'workflow',
    'Is this a skill that changes how a coding agent works on a task: how it plans, asks clarifying questions, breaks down or hands off work, communicates, or uses git safely?',
  ),
  // Agent, added in T23
  q(
    'ai-ml',
    'Is this skill mainly about building AI or machine-learning systems (LLM apps, RAG, embeddings, prompt engineering for LLM apps, evals, fine-tuning, model training or inference, computer vision), not using a model to generate images, video or audio, and not writing agent personas, or prompts or skills for coding agents?',
  ),
  q(
    'agent-tooling',
    'Is this skill mainly about extending or configuring AI coding agents: writing skills, plugins, MCP servers or hooks, AGENTS.md or CLAUDE.md files, agent memory or context?',
  ),
  // Other: reworded so it means a named vendor, not "anything left over"
  q(
    'integrations',
    'Is this skill mainly about connecting to or operating one named third-party SaaS or vendor service (for example Slack, Stripe, Salesforce, Lark), rather than a programming language, mobile or game platform, cloud platform, AI/ML framework, or a general technique?',
  ),
];

/** Lowered from 0.6 after the first label run left 41% of skills with no topic (26% at 0.4). Not part of the version: all probabilities are stored. */
export const TOPIC_THRESHOLD = 0.4;
export const MAX_TOPICS_PER_SKILL = 3;
export const REVIEW_BAND = { low: 0.4, high: 0.6 } as const;

/** sha256 of the question set's JSON, first 12 hex chars. */
export function taxonomyVersion(questions: readonly TopicQuestion[]): string {
  const json = JSON.stringify(questions.map(({ fieldSlug, prompt }) => ({ fieldSlug, prompt })));
  return createHash('sha256').update(json, 'utf8').digest('hex').slice(0, 12);
}

export const TAXONOMY_VERSION: string = taxonomyVersion(TOPIC_QUESTIONS);

/** Fields with probability >= threshold, highest first (ties by slug), at most `max`. */
export function topicsFor(probabilities: Record<string, number>, threshold: number, max: number): string[] {
  return Object.entries(probabilities)
    .filter(([, p]) => p >= threshold)
    .sort(([a, pa], [b, pb]) => pb - pa || a.localeCompare(b))
    .slice(0, max)
    .map(([slug]) => slug);
}

function q(fieldSlug: string, prompt: string): TopicQuestion {
  return { fieldSlug, prompt };
}
