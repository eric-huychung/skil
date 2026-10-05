import { createHash } from 'node:crypto';
import { err, ok, type Result } from '../core/result.js';
import { JevError, type JevClient, type JevQuestion } from './jev-client.js';
import type { MarketStore } from './market-store.js';

/**
 * Creator tech gate for the creators report (design §4.7, report step 2).
 * One Jev call per owner group, cached in `market_creator_checks` by state hash,
 * so an owner whose top skills haven't changed costs nothing on the next run.
 */

/** Skills per creator sent to Jev. */
export const CREATOR_STATE_SKILLS = 10;

/** Long descriptions are cut so one verbose skill can't dominate the state. */
const DESCRIPTION_MAX_CHARS = 300;

/** Domain choice options (spec: "the domain answer tells you why a creator was excluded"). */
export const CREATOR_DOMAINS: Record<string, string> = {
  'software-dev': 'Software development: writing, reviewing or testing application code',
  'devops-infra': 'DevOps and infrastructure: CI/CD, deployment, cloud, operations, monitoring',
  'data-ai': 'Data and AI: data analysis, databases, machine learning, AI agents and tooling',
  'design-ui': 'Design and UI: product UI/UX, design systems, frontend look and feel',
  'marketing-sales': 'Marketing and sales: copywriting, SEO, ads, sales enablement',
  'media-generation': 'Media generation: producing images, video, audio or avatars',
  'productivity-office': 'Productivity and office: notes, documents, spreadsheets, calendars, office tools',
  other: 'Something else',
};

/** Questions as data. Editing one changes every state hash, so every owner is re-asked once. */
export const CREATOR_QUESTIONS: Record<string, JevQuestion> = {
  tech: {
    kind: 'boolean',
    prompt:
      'Are most of these skills for building, testing, deploying, operating or designing software, doing data work, or building AI agents and tooling?',
  },
  domain: {
    kind: 'choice',
    prompt: "What is the main domain of this creator's skills?",
    options: CREATOR_DOMAINS,
  },
};

export interface CreatorGateSkill {
  name: string;
  description: string | null;
  installs: number;
}

/** One creator slot: its owner aliases and their active skills (any order). */
export interface CreatorGateInput {
  owners: readonly string[];
  skills: readonly CreatorGateSkill[];
}

export type CreatorGateCache = Pick<MarketStore, 'getCreatorChecks' | 'saveCreatorCheck'>;

export interface CreatorGateCheck {
  creatorKey: string;
  techProbability: number;
  domain: string;
  modelVersion: string;
  /** True when the answer came from `market_creator_checks` (no Jev call). */
  cached: boolean;
}

export interface CreatorGateOutcome {
  /** In input order, failed owners left out. */
  checks: CreatorGateCheck[];
  /** Owners Jev couldn't answer this run; nothing is cached for them. */
  failed: { creatorKey: string; message: string }[];
}

/** Sorted owner aliases joined by '+', the `market_creator_checks` primary key. */
export function creatorKey(owners: readonly string[]): string {
  return [...owners].sort().join('+');
}

/** Owner names plus the top skills by installs (name: description), one per line. */
export function buildCreatorState(owners: readonly string[], skills: readonly CreatorGateSkill[]): string {
  const top = [...skills]
    .sort((a, b) => b.installs - a.installs || a.name.localeCompare(b.name))
    .slice(0, CREATOR_STATE_SKILLS);
  const lines = top.map((skill, i) => {
    const description = (skill.description ?? '').replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX_CHARS);
    return `${i + 1}. ${description ? `${skill.name}: ${description}` : skill.name}`;
  });
  return [`Creator: ${owners.join(', ')}`, `Top skills:`, ...lines].join('\n');
}

/** sha256 of the state plus the questions, so a reworded question also invalidates the cache. */
function stateHash(state: string): string {
  return createHash('sha256').update(JSON.stringify({ state, questions: CREATOR_QUESTIONS }), 'utf8').digest('hex');
}

/**
 * Tech probability + domain per creator. Cache hits make no Jev call. A Jev
 * error fails only that owner, except `auth`, which stops the run (every
 * later call would fail the same way). Store errors stop the run.
 */
export async function gateCreators(
  creators: readonly CreatorGateInput[],
  jev: JevClient,
  cache: CreatorGateCache,
): Promise<Result<CreatorGateOutcome>> {
  const prepared = creators.map((creator) => {
    const state = buildCreatorState(creator.owners, creator.skills);
    return { key: creatorKey(creator.owners), state, hash: stateHash(state) };
  });

  const cachedRows = await cache.getCreatorChecks(prepared.map((p) => p.key));
  if (!cachedRows.ok) return cachedRows;
  const cachedByKey = new Map(cachedRows.value.map((row) => [row.creatorKey, row]));

  const outcome: CreatorGateOutcome = { checks: [], failed: [] };
  for (const { key, state, hash } of prepared) {
    const hit = cachedByKey.get(key);
    if (hit && hit.stateHash === hash) {
      outcome.checks.push({
        creatorKey: key,
        techProbability: hit.techProbability,
        domain: hit.domain,
        modelVersion: hit.modelVersion,
        cached: true,
      });
      continue;
    }

    const answer = await jev.evaluate(state, CREATOR_QUESTIONS);
    if (!answer.ok) {
      if (answer.error instanceof JevError && answer.error.kind === 'auth') return answer;
      outcome.failed.push({ creatorKey: key, message: answer.error.message });
      continue;
    }
    const tech = answer.value.answers.tech;
    const domain = answer.value.answers.domain;
    if (tech?.kind !== 'boolean' || domain?.kind !== 'choice') {
      outcome.failed.push({ creatorKey: key, message: 'Jev answer is missing the tech or domain question' });
      continue;
    }

    const check = {
      creatorKey: key,
      stateHash: hash,
      techProbability: tech.probability,
      domain: domain.option,
      modelVersion: answer.value.modelVersion,
    };
    const saved = await cache.saveCreatorCheck(check);
    if (!saved.ok) return err(saved.error);
    outcome.checks.push({
      creatorKey: key,
      techProbability: check.techProbability,
      domain: check.domain,
      modelVersion: check.modelVersion,
      cached: false,
    });
  }
  return ok(outcome);
}
