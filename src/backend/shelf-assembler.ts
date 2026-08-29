import type { MarketClassifyRow, MarketField } from './market-types.js';

export interface SkillLabel {
  id: string;
  fieldSlugs: string[];
}

export interface AssembledShelf {
  fieldSlug: string;
  skillIds: string[];
}

const INTEGRATIONS = 'integrations';
const MAX_FIELDS_PER_SKILL = 2;

/** Keep one row per lowercase name — highest installs wins. Dedup before classify. */
export function dedupByName(listings: MarketClassifyRow[]): MarketClassifyRow[] {
  const best = new Map<string, MarketClassifyRow>();
  for (const row of listings) {
    const key = row.name.toLowerCase();
    const current = best.get(key);
    if (!current || row.installs > current.installs) {
      best.set(key, row);
    }
  }
  return [...best.values()];
}

/**
 * Turns a classified pool into per-field ranked id lists. Unknown slugs
 * dropped. At most two fields per skill. Unlabeled skills go on
 * `integrations` when that field is present.
 */
export function buildShelves(input: {
  listings: MarketClassifyRow[];
  labels: SkillLabel[];
  fields: MarketField[];
}): AssembledShelf[] {
  const unique = dedupByName(input.listings);
  const known = new Set(input.fields.map((field) => field.slug));
  const hasIntegrations = known.has(INTEGRATIONS);
  const labelById = new Map(input.labels.map((label) => [label.id, label.fieldSlugs]));
  const idsByField = new Map<string, MarketClassifyRow[]>(input.fields.map((field) => [field.slug, []]));

  for (const row of unique) {
    const slugs = (labelById.get(row.id) ?? [])
      .filter((slug) => known.has(slug))
      .slice(0, MAX_FIELDS_PER_SKILL);
    const dest = slugs.length > 0 ? slugs : hasIntegrations ? [INTEGRATIONS] : [];
    for (const slug of dest) {
      idsByField.get(slug)?.push(row);
    }
  }

  return input.fields.map((field) => {
    const rows = (idsByField.get(field.slug) ?? [])
      .sort((a, b) => b.installs - a.installs)
      .slice(0, field.shelfSize);
    return { fieldSlug: field.slug, skillIds: rows.map((row) => row.id) };
  });
}
