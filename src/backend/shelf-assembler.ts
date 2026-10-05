import type { AssembledShelfEntries, MarketClassifyRow, MarketField, ShelfEntry } from './market-types.js';

export interface SkillLabel {
  id: string;
  fieldSlugs: string[];
}

const INTEGRATIONS = 'integrations';
const MAX_FIELDS_PER_SKILL = 2;
/** Most entries one owner may hold on a shelf. A collapsed suite counts once. */
export const OWNER_CAP = 5;
/** Same repo + same name prefix with at least this many rows on a shelf collapses into one entry. */
const SUITE_MIN = 3;

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
 * Turns a classified pool into per-field ranked entries. Unknown slugs
 * dropped. At most two fields per skill. Unlabeled skills go on
 * `integrations` when that field is present. Per shelf: collapse suites
 * (3+ rows, same repo and name prefix) under their best-installed row,
 * rank by installs, cap each owner at `ownerCap` entries, then cut to
 * `shelfSize`.
 */
export function buildShelves(input: {
  listings: MarketClassifyRow[];
  labels: SkillLabel[];
  fields: MarketField[];
  ownerCap?: number;
}): AssembledShelfEntries[] {
  const ownerCap = input.ownerCap ?? OWNER_CAP;
  const unique = dedupByName(input.listings);
  const known = new Set(input.fields.map((field) => field.slug));
  const hasIntegrations = known.has(INTEGRATIONS);
  const labelById = new Map(input.labels.map((label) => [label.id, label.fieldSlugs]));
  const rowsByField = new Map<string, MarketClassifyRow[]>(input.fields.map((field) => [field.slug, []]));

  for (const row of unique) {
    const slugs = (labelById.get(row.id) ?? [])
      .filter((slug) => known.has(slug))
      .slice(0, MAX_FIELDS_PER_SKILL);
    const dest = slugs.length > 0 ? slugs : hasIntegrations ? [INTEGRATIONS] : [];
    for (const slug of dest) {
      rowsByField.get(slug)?.push(row);
    }
  }

  return input.fields.map((field) => {
    const ranked = collapseSuites(rowsByField.get(field.slug) ?? []).sort((a, b) => b.installs - a.installs);
    const perOwner = new Map<string, number>();
    const entries: ShelfEntry[] = [];
    for (const group of ranked) {
      if (entries.length >= field.shelfSize) {
        break;
      }
      const owner = ownerOf(group.id);
      const held = perOwner.get(owner) ?? 0;
      if (held >= ownerCap) {
        continue;
      }
      perOwner.set(owner, held + 1);
      entries.push({ id: group.id, moreCount: group.moreCount });
    }
    return { fieldSlug: field.slug, entries };
  });
}

/** One shelf candidate: a lone row, or a suite's lead with how many rows it hides. */
interface ShelfGroup {
  id: string;
  installs: number;
  moreCount: number;
}

/** Groups one shelf's rows by repo + name prefix; groups of `SUITE_MIN`+ become one entry led by best installs. */
function collapseSuites(rows: MarketClassifyRow[]): ShelfGroup[] {
  const groups = new Map<string, MarketClassifyRow[]>();
  for (const row of rows) {
    const key = `${sourceOf(row.id)}\u0000${namePrefix(row.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: ShelfGroup[] = [];
  for (const members of groups.values()) {
    if (members.length < SUITE_MIN) {
      out.push(...members.map((row) => ({ id: row.id, installs: row.installs, moreCount: 0 })));
      continue;
    }
    const lead = members.reduce((best, row) => (row.installs > best.installs ? row : best));
    out.push({ id: lead.id, installs: lead.installs, moreCount: members.length - 1 });
  }
  return out;
}

/** skills.sh ids are `owner/repo/skill`: the source is everything before the last segment. */
function sourceOf(id: string): string {
  const cut = id.lastIndexOf('/');
  return (cut === -1 ? id : id.slice(0, cut)).toLowerCase();
}

function ownerOf(id: string): string {
  return (id.split('/')[0] ?? id).toLowerCase();
}

/** Name before the first `-` (`azure-deploy` → `azure`); a name with no `-` is its own prefix. */
function namePrefix(name: string): string {
  return name.toLowerCase().split('-')[0] ?? '';
}
