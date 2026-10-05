/**
 * Pure Creators ranking for the creators report (design §4.7).
 * Score = installs of a creator's single most-installed skill. No I/O here.
 */

// Local types until the shared market types land; same shape as a `market_owner_stats` row.
export interface OwnerStats {
  owner: string;
  skillCount: number;
  totalInstalls: number;
  bestInstalls: number;
}

/** One creator slot's owners, e.g. `lark` = `larksuite` + `open.feishu.cn`. */
export interface AliasGroup {
  slug: string;
  owners: readonly string[];
}

export interface CreatorCandidate {
  key: string;
  owners: string[];
  skillCount: number;
  totalInstalls: number;
  bestInstalls: number;
}

export interface SelectedCreator extends CreatorCandidate {
  pinned: boolean;
}

export interface SelectThirtyInput {
  ranked: readonly CreatorCandidate[];
  /** In display order; pins bypass the gate. */
  pins: readonly { key: string; owners: readonly string[] }[];
  blocked: readonly string[];
  /** Tech gate. Defaults to letting every candidate through. */
  passes?: (candidate: CreatorCandidate) => boolean;
  size?: number;
}

export const CREATOR_SLOTS = 30;

const norm = (owner: string): string => owner.toLowerCase();

/** Groups owner stats into creators: alias owners collapse into one candidate keyed by the alias slug. */
export function mergeAliases(stats: readonly OwnerStats[], aliases: readonly AliasGroup[]): CreatorCandidate[] {
  const slugByOwner = new Map<string, string>();
  for (const group of aliases) {
    for (const owner of group.owners) slugByOwner.set(norm(owner), group.slug);
  }
  const byKey = new Map<string, CreatorCandidate>();
  for (const row of stats) {
    const key = slugByOwner.get(norm(row.owner)) ?? row.owner;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        owners: [row.owner],
        skillCount: row.skillCount,
        totalInstalls: row.totalInstalls,
        bestInstalls: row.bestInstalls,
      });
      continue;
    }
    existing.owners.push(row.owner);
    existing.skillCount += row.skillCount;
    existing.totalInstalls += row.totalInstalls;
    existing.bestInstalls = Math.max(existing.bestInstalls, row.bestInstalls);
  }
  // Alias owners follow the YAML order, not the stats order.
  for (const group of aliases) {
    const candidate = byKey.get(group.slug);
    if (!candidate) continue;
    const order = group.owners.map(norm);
    candidate.owners.sort((a, b) => order.indexOf(norm(a)) - order.indexOf(norm(b)));
  }
  return [...byKey.values()];
}

/** Best single-skill installs first; ties broken by key so the report is stable. */
export function rankCandidates(candidates: readonly CreatorCandidate[]): CreatorCandidate[] {
  return [...candidates].sort((a, b) => b.bestInstalls - a.bestInstalls || a.key.localeCompare(b.key));
}

/** Pins first (bypassing the gate), then gate passers in rank order, minus blocked owners; at most 30. */
export function selectThirty(input: SelectThirtyInput): SelectedCreator[] {
  const size = input.size ?? CREATOR_SLOTS;
  const passes = input.passes ?? (() => true);
  const blocked = new Set(input.blocked.map(norm));
  const isBlocked = (owners: readonly string[]) => owners.some((owner) => blocked.has(norm(owner)));
  const rankedByKey = new Map(input.ranked.map((c) => [c.key, c]));

  const picked: SelectedCreator[] = [];
  const taken = new Set<string>();
  for (const pin of input.pins) {
    const { key } = pin;
    if (taken.has(key) || isBlocked(pin.owners)) continue;
    const stats = rankedByKey.get(key);
    picked.push(
      stats
        ? { ...stats, pinned: true }
        : { key, owners: [...pin.owners], skillCount: 0, totalInstalls: 0, bestInstalls: 0, pinned: true }
    );
    taken.add(key);
  }
  for (const candidate of input.ranked) {
    if (picked.length >= size) break;
    if (taken.has(candidate.key) || isBlocked(candidate.owners) || !passes(candidate)) continue;
    picked.push({ ...candidate, pinned: false });
    taken.add(candidate.key);
  }
  return picked.slice(0, size);
}
