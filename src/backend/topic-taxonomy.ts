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
  q('frontend', 'Is this skill mainly about building web or app frontends (UI components, React, CSS, client-side code)?'),
  q('backend', 'Is this skill mainly about building backend services or server-side application code?'),
  q('api', 'Is this skill mainly about designing, building or documenting APIs?'),
  q('database', 'Is this skill mainly about databases, SQL, schemas, queries or migrations?'),
  q('testing', 'Is this skill mainly about writing or running software tests?'),
  q('security', 'Is this skill mainly about software security, vulnerabilities, compliance or security review?'),
  q('devops', 'Is this skill mainly about CI/CD, deployment, infrastructure, cloud operations or monitoring?'),
  q('review', 'Is this skill mainly about reviewing code or pull requests?'),
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
    'Is this a skill that changes how a coding agent itself works: how it plans, asks clarifying questions, breaks down or hands off tasks, uses git safely, finds or manages other skills and tools, or drives a browser or terminal?',
  ),
  // Other: reworded so it means a named vendor, not "anything left over"
  q(
    'integrations',
    'Is this skill mainly about using one specific third-party product, platform or vendor service (for example a named SaaS app, cloud provider or API such as Slack, Stripe, Azure or Lark)?',
  ),
];

/** Starting value, tuned on the gold set. Not part of the version: all probabilities are stored. */
export const TOPIC_THRESHOLD = 0.6;
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
