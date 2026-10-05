import type { AssembledShelfEntries, MarketField, ShelfEntry } from './market-types.js';
import { topicsFor } from './topic-taxonomy.js';

/** Slug labels from the old classify path; fixtures still describe pools this way. */
export interface SkillLabel {
  id: string;
  fieldSlugs: string[];
}

/** One labeled pool row as `buildShelves` sees it: `probabilities` is `{}` for an errored label. */
export interface ShelfInputRow {
  id: string;
  name: string;
  /** `owner/repo`: rows from one repo with one name prefix collapse into a suite. */
  source: string;
  owner: string;
  installs: number;
  probabilities: Record<string, number>;
}

/** Most entries one owner may hold on a shelf. A collapsed suite counts once. */
export const OWNER_CAP = 5;
/** A topic at or above this probability is tier 0 (confident); lower topics are tier 1. */
export const CONFIDENT_PROBABILITY = 0.8;
/** Same repo + same name prefix with at least this many rows on a shelf collapses into one entry. */
const SUITE_MIN = 3;

/** Keep one row per lowercase name — highest installs wins. */
export function dedupByName<T extends { name: string; installs: number }>(listings: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of listings) {
    const key = row.name.toLowerCase();
    const current = best.get(key);
    if (!current || row.installs > current.installs) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

/** `topicsFor` over known fields only, so an inactive field never takes one of the `max` slots. */
export function shelfTopics(
  probabilities: Record<string, number>,
  known: ReadonlySet<string>,
  threshold: number,
  max: number,
): string[] {
  const knownOnly = Object.fromEntries(Object.entries(probabilities).filter(([slug]) => known.has(slug)));
  return topicsFor(knownOnly, threshold, max);
}

/**
 * Turns a labeled pool into per-field ranked entries. Each row goes on its
 * topics (known fields at or above `threshold`, highest first, at most
 * `maxTopics`); a row with none is unlabeled and goes nowhere — no
 * `integrations` fallback. Per shelf: dedup by name (highest installs),
 * collapse suites (3+ rows, same repo and name prefix) under their
 * best-installed row, rank by confidence tier then installs, cap each owner
 * at `ownerCap` entries, then cut to `shelfSize`.
 */
export function buildShelves(input: {
  rows: ShelfInputRow[];
  fields: MarketField[];
  threshold: number;
  maxTopics: number;
  ownerCap: number;
}): AssembledShelfEntries[] {
  const known = new Set(input.fields.map((field) => field.slug));
  const rowsByField = new Map<string, ShelfCandidate[]>(input.fields.map((field) => [field.slug, []]));

  for (const row of input.rows) {
    for (const slug of shelfTopics(row.probabilities, known, input.threshold, input.maxTopics)) {
      const tier = (row.probabilities[slug] ?? 0) >= CONFIDENT_PROBABILITY ? 0 : 1;
      rowsByField.get(slug)?.push({ ...row, tier });
    }
  }

  return input.fields.map((field) => {
    const ranked = collapseSuites(dedupByName(rowsByField.get(field.slug) ?? [])).sort(
      (a, b) => a.tier - b.tier || b.installs - a.installs,
    );
    const perOwner = new Map<string, number>();
    const entries: ShelfEntry[] = [];
    for (const group of ranked) {
      if (entries.length >= field.shelfSize) {
        break;
      }
      const owner = group.owner.toLowerCase();
      const held = perOwner.get(owner) ?? 0;
      if (held >= input.ownerCap) {
        continue;
      }
      perOwner.set(owner, held + 1);
      entries.push({ id: group.id, moreCount: group.moreCount });
    }
    return { fieldSlug: field.slug, entries };
  });
}

/** A row on one shelf, with its confidence tier for that shelf's field. */
interface ShelfCandidate extends ShelfInputRow {
  tier: 0 | 1;
}

/** One shelf candidate: a lone row, or a suite's lead with how many rows it hides. */
interface ShelfGroup {
  id: string;
  owner: string;
  installs: number;
  /** Best tier among the group's rows: a suite with one confident member ranks as confident. */
  tier: 0 | 1;
  moreCount: number;
}

/** Groups one shelf's rows by repo + name prefix; groups of `SUITE_MIN`+ become one entry led by best installs. */
function collapseSuites(rows: ShelfCandidate[]): ShelfGroup[] {
  const groups = new Map<string, ShelfCandidate[]>();
  for (const row of rows) {
    const key = `${row.source.toLowerCase()}\u0000${namePrefix(row.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: ShelfGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < SUITE_MIN) {
      for (const row of members) {
        out.push({ id: row.id, owner: row.owner, installs: row.installs, tier: row.tier, moreCount: 0 });
      }
      continue;
    }
    const lead = members.reduce((best, row) => (row.installs > best.installs ? row : best));
    const tier = members.some((row) => row.tier === 0) ? 0 : 1;
    out.push({ id: lead.id, owner: lead.owner, installs: lead.installs, tier, moreCount: members.length - 1 });
  }
  return out;
}

/** Name before the first `-` (`azure-deploy` → `azure`); a name with no `-` is its own prefix. */
function namePrefix(name: string): string {
  return name.toLowerCase().split('-')[0] ?? '';
}
