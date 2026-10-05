import { err, ok, type Result } from '../core/result.js';
import type { MarketStore } from './market-store.js';
import type {
  AssembledShelfEntries,
  CreatorCheck,
  CreatorSkillRow,
  LabelPoolRow,
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  OwnerStats,
  ShelfField,
  ShelfMeta,
  ShelfEntry,
  ShelfRole,
  ShelfSkill,
  SkillScore,
} from './market-types.js';
import { MAX_TOPICS_PER_SKILL, TAXONOMY_VERSION, TOPIC_THRESHOLD, topicsFor } from './topic-taxonomy.js';

interface SkillRow extends MarketListingInput {
  description: string | null;
  hash: string | null;
  labelExcerpt: string | null;
  isDuplicate: boolean;
  lastSeenAt: string;
  inactive: boolean;
}

/** In-memory `MarketStore` for tests. No network, no disk. */
export class InMemoryMarketStore implements MarketStore {
  private roles = new Map<string, MarketRole>();
  private fields = new Map<string, MarketField>();
  private skills = new Map<string, SkillRow>();
  /** field slug -> ranked entries, index 0 = rank 1 */
  private shelves = new Map<string, ShelfEntry[]>();
  private shelfMeta: ShelfMeta | null = null;

  async upsertRole(role: MarketRole): Promise<Result<void>> {
    this.roles.set(role.slug, { ...role });
    return ok(undefined);
  }

  async upsertField(field: MarketField): Promise<Result<void>> {
    this.fields.set(field.slug, { ...field });
    return ok(undefined);
  }

  async listActiveFields(): Promise<Result<MarketField[]>> {
    return ok([...this.fields.values()].filter((field) => field.active));
  }

  async upsertListing(listing: MarketListingInput, seenAt: string): Promise<Result<void>> {
    const existing = this.skills.get(listing.id);
    this.skills.set(listing.id, {
      ...listing,
      description: existing?.description ?? null,
      hash: existing?.hash ?? null,
      labelExcerpt: existing?.labelExcerpt ?? null,
      isDuplicate: existing?.isDuplicate ?? false,
      lastSeenAt: seenAt,
      inactive: false,
    });
    return ok(undefined);
  }

  async getHash(id: string): Promise<Result<string | null>> {
    return ok(this.skills.get(id)?.hash ?? null);
  }

  async setDetail(id: string, detail: MarketDetailInput): Promise<Result<void>> {
    const existing = this.skills.get(id);
    if (!existing) {
      return ok(undefined);
    }
    this.skills.set(id, {
      ...existing,
      description: detail.description,
      hash: detail.hash,
      labelExcerpt: detail.labelExcerpt === undefined ? existing.labelExcerpt : detail.labelExcerpt,
    });
    return ok(undefined);
  }

  async markInactiveBefore(seenAt: string): Promise<Result<void>> {
    for (const [id, row] of this.skills) {
      this.skills.set(id, { ...row, inactive: row.lastSeenAt < seenAt });
    }
    return ok(undefined);
  }

  async listShelves(): Promise<Result<ShelfRole[]>> {
    const roles = [...this.roles.values()]
      .filter((role) => role.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const shelfRoles: ShelfRole[] = roles.map((role) => ({
      slug: role.slug,
      label: role.label,
      fields: this.fieldsForRole(role.slug),
    }));

    return ok(shelfRoles);
  }

  private fieldsForRole(roleSlug: string): ShelfField[] {
    return [...this.fields.values()]
      .filter((field) => field.roleSlug === roleSlug && field.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((field) => ({
        slug: field.slug,
        label: field.label,
        skills: this.skillsForField(field),
      }));
  }

  async getListing(id: string): Promise<Result<MarketListingDetail | null>> {
    const row = this.skills.get(id);
    if (!row) {
      return ok(null);
    }
    return ok({ id: row.id, name: row.name, installs: row.installs, url: row.url, installUrl: row.installUrl });
  }

  private skillsForField(field: MarketField): ShelfField['skills'] {
    const entries = this.shelves.get(field.slug) ?? [];
    return entries
      .slice(0, field.shelfSize)
      .map((entry, index): ShelfSkill | null => {
        const skill = this.skills.get(entry.id);
        if (!skill || skill.inactive) {
          return null;
        }
        const row: ShelfSkill = { id: skill.id, name: skill.name, installs: skill.installs, rank: index + 1 };
        return entry.moreCount > 0 ? { ...row, moreCount: entry.moreCount } : row;
      })
      .filter((row): row is ShelfSkill => row !== null);
  }

  // --- T4 shelves ---

  /**
   * Builds the new shelves aside and swaps them in only if every row is
   * valid, so a failure part-way leaves the old shelves and meta — the
   * same all-or-nothing the `replace_market_shelves` transaction gives.
   * Unknown fields/skills and duplicate placements fail like the
   * Postgres FK/PK constraints would.
   */
  async replaceShelves(shelves: AssembledShelfEntries[], taxonomyVersion: string): Promise<Result<void>> {
    const next = new Map<string, ShelfEntry[]>();
    for (const shelf of shelves) {
      if (!this.fields.has(shelf.fieldSlug)) {
        return err(new Error(`InMemoryMarketStore: unknown field ${shelf.fieldSlug}`));
      }
      const placed = next.get(shelf.fieldSlug) ?? [];
      for (const entry of shelf.entries) {
        if (!this.skills.has(entry.id)) {
          return err(new Error(`InMemoryMarketStore: unknown skill ${entry.id}`));
        }
        if (placed.some((existing) => existing.id === entry.id)) {
          return err(new Error(`InMemoryMarketStore: ${entry.id} placed twice on ${shelf.fieldSlug}`));
        }
        placed.push({ id: entry.id, moreCount: entry.moreCount });
      }
      next.set(shelf.fieldSlug, placed);
    }

    this.shelves = next;
    this.shelfMeta = { generatedAt: new Date().toISOString(), taxonomyVersion };
    return ok(undefined);
  }

  async getShelfMeta(): Promise<Result<ShelfMeta | null>> {
    return ok(this.shelfMeta === null ? null : { ...this.shelfMeta });
  }

  // --- T5 owners (labels join: T19) ---

  /** Simulates PostgREST's 1,000-row cap so `listSkillsByOwners` must page like the Supabase adapter. */
  private readonly ownerPageSize = 1000;

  /** Same rule as the generated `owner` column (0006): `split_part(source, '/', 1)`. */
  private ownerOf(source: string): string {
    return source.split('/')[0] ?? '';
  }

  private ownerStatsRows(): Map<string, OwnerStats> {
    const byOwner = new Map<string, OwnerStats>();
    for (const row of this.skills.values()) {
      if (row.inactive) continue;
      const owner = this.ownerOf(row.source);
      const stats = byOwner.get(owner) ?? { owner, skillCount: 0, totalInstalls: 0, bestInstalls: 0 };
      byOwner.set(owner, {
        owner,
        skillCount: stats.skillCount + 1,
        totalInstalls: stats.totalInstalls + row.installs,
        bestInstalls: Math.max(stats.bestInstalls, row.installs),
      });
    }
    return byOwner;
  }

  /** Rows come back in `owners` order (deduped). */
  async listOwnerStats(owners: string[]): Promise<Result<OwnerStats[]>> {
    const byOwner = this.ownerStatsRows();
    return ok(
      [...new Set(owners)]
        .map((owner) => byOwner.get(owner))
        .filter((row): row is OwnerStats => row !== undefined),
    );
  }

  /** Ties broken by owner ascending. */
  async listTopOwners(limit: number): Promise<Result<OwnerStats[]>> {
    return ok(
      [...this.ownerStatsRows().values()]
        .sort((a, b) => b.bestInstalls - a.bestInstalls || a.owner.localeCompare(b.owner))
        .slice(0, Math.max(0, limit)),
    );
  }

  /**
   * Installs descending, then id ascending (a stable order is what makes paging safe).
   * `topics` come from `taxonomyVersion`'s `ok` labels via `topicsFor`; unlabelled or errored rows get `[]`.
   */
  async listSkillsByOwners(owners: string[], taxonomyVersion: string): Promise<Result<CreatorSkillRow[]>> {
    const labels = this.labels.get(taxonomyVersion);
    const rows: CreatorSkillRow[] = [];
    for (let from = 0; ; from += this.ownerPageSize) {
      const page = this.ownerSkillsPage(owners, from);
      for (const row of page) {
        const label = labels?.get(row.id);
        if (label?.status === 'ok') {
          row.topics = topicsFor(label.probabilities, TOPIC_THRESHOLD, MAX_TOPICS_PER_SKILL);
        }
      }
      rows.push(...page);
      if (page.length < this.ownerPageSize) break;
    }
    return ok(rows);
  }

  private ownerSkillsPage(owners: string[], from: number): CreatorSkillRow[] {
    const wanted = new Set(owners);
    return [...this.skills.values()]
      .filter((row) => !row.inactive && wanted.has(this.ownerOf(row.source)))
      .sort((a, b) => b.installs - a.installs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(from, from + this.ownerPageSize)
      .map((row) => ({
        id: row.id,
        name: row.name,
        source: row.source,
        owner: this.ownerOf(row.source),
        installs: row.installs,
        topics: [],
      }));
  }

  // --- T15b detail ---

  async getDetailState(id: string): Promise<Result<{ hash: string | null; hasExcerpt: boolean }>> {
    const row = this.skills.get(id);
    return ok({ hash: row?.hash ?? null, hasExcerpt: row?.labelExcerpt != null });
  }

  /** Sorted by id so the backfill walks a stable order. */
  async listIdsMissingExcerpt(): Promise<Result<string[]>> {
    return ok(
      [...this.skills.values()]
        .filter((row) => !row.inactive && row.labelExcerpt === null)
        .map((row) => row.id)
        .sort((a, b) => a.localeCompare(b)),
    );
  }

  // --- T17b labels ---

  /** Simulated PostgREST page size; tests shrink it to exercise paging. */
  labelPageSize = 1_000;
  /** taxonomy version -> skill id -> score */
  private labels = new Map<string, Map<string, SkillScore>>();

  /** Reads `fetchRange(from, to)` (inclusive, like `.range()`) until a short page. */
  private pageLabelRows<T>(fetchRange: (from: number, to: number) => T[]): T[] {
    const rows: T[] = [];
    for (let from = 0; ; from += this.labelPageSize) {
      const page = fetchRange(from, from + this.labelPageSize - 1);
      rows.push(...page);
      if (page.length < this.labelPageSize) return rows;
    }
  }

  private sortedLabels(version: string): SkillScore[] {
    return [...(this.labels.get(version)?.values() ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  }

  async listLabelPool(): Promise<Result<LabelPoolRow[]>> {
    const active = [...this.skills.values()]
      .filter((row) => !row.inactive)
      .sort((a, b) => a.id.localeCompare(b.id));
    const rows = this.pageLabelRows((from, to) => active.slice(from, to + 1));
    return ok(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        source: row.source,
        installs: row.installs,
        description: row.description,
        labelExcerpt: row.labelExcerpt,
        owner: row.source.split('/')[0] ?? '',
      })),
    );
  }

  async listLabelKeys(version: string): Promise<Result<Map<string, Pick<SkillScore, 'stateHash' | 'status'>>>> {
    const sorted = this.sortedLabels(version);
    const rows = this.pageLabelRows((from, to) => sorted.slice(from, to + 1));
    return ok(new Map(rows.map((row) => [row.id, { stateHash: row.stateHash, status: row.status }])));
  }

  async saveLabels(version: string, scores: SkillScore[]): Promise<Result<void>> {
    const byId = this.labels.get(version) ?? new Map<string, SkillScore>();
    for (const score of scores) {
      byId.set(score.id, { ...score, probabilities: { ...score.probabilities } });
    }
    this.labels.set(version, byId);
    return ok(undefined);
  }

  async listLabels(version: string): Promise<Result<SkillScore[]>> {
    const sorted = this.sortedLabels(version);
    return ok(this.pageLabelRows((from, to) => sorted.slice(from, to + 1)).map((row) => ({ ...row })));
  }

  // --- T12a creatorChecks ---

  /** creatorKey -> cached tech-gate row */
  private creatorChecks = new Map<string, CreatorCheck>();

  async getCreatorChecks(keys: string[]): Promise<Result<CreatorCheck[]>> {
    const rows: CreatorCheck[] = [];
    for (const key of new Set(keys)) {
      const row = this.creatorChecks.get(key);
      if (row) rows.push({ ...row });
    }
    return ok(rows);
  }

  async saveCreatorCheck(check: CreatorCheck): Promise<Result<void>> {
    this.creatorChecks.set(check.creatorKey, { ...check });
    return ok(undefined);
  }

  // --- T21 search ---

  /**
   * Mirrors `search_market_skills` (0008 migration). Tier first: exact name,
   * then name prefix, then owner or topic (the query is the owner, or a field
   * slug in the skill's `topicsFor` topics at TAXONOMY_VERSION; spaces in the
   * query read as `-`), then typo-close name (pg_trgm similarity >= 0.3), then
   * a text match (every word in name + description). Within the trigram tier
   * the most similar name wins; then installs, then id. Postgres orders the
   * text tier by `ts_rank_cd` before installs; this store treats every text
   * match as equal rank, so installs decide there.
   */
  async searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>> {
    const term = q.trim().toLowerCase();
    if (!term) return ok([]);
    const words = term.split(/\s+/);
    const topic = words.join('-');
    const labels = this.labels.get(TAXONOMY_VERSION);
    const hasTopic = (id: string) => {
      const label = labels?.get(id);
      return label?.status === 'ok' && topicsFor(label.probabilities, TOPIC_THRESHOLD, MAX_TOPICS_PER_SKILL).includes(topic);
    };

    const ranked = [...this.skills.values()]
      .filter((row) => !row.inactive)
      .map((row) => {
        const name = row.name.toLowerCase();
        const sim = InMemoryMarketStore.trigramSimilarity(name, term);
        const haystack = `${name} ${row.description ?? ''}`.toLowerCase();
        const tier =
          name === term ? 0
          : name.startsWith(term) ? 1
          : this.ownerOf(row.source).toLowerCase() === term || hasTopic(row.id) ? 2
          : sim >= InMemoryMarketStore.TRIGRAM_THRESHOLD ? 3
          : words.every((word) => haystack.includes(word)) ? 4
          : null;
        return { row, tier, sim };
      })
      .filter((hit): hit is { row: SkillRow; tier: number; sim: number } => hit.tier !== null)
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          (a.tier === 3 ? b.sim - a.sim : 0) ||
          b.row.installs - a.row.installs ||
          a.row.id.localeCompare(b.row.id),
      )
      .slice(0, opts.limit);

    return ok(ranked.map(({ row }) => ({ id: row.id, name: row.name, installs: row.installs })));
  }

  /** pg_trgm's default `similarity_threshold`, used by the `%` operator. */
  private static readonly TRIGRAM_THRESHOLD = 0.3;

  /**
   * pg_trgm `similarity()`: each alphanumeric word padded as "  word ", its
   * distinct 3-char windows collected, then shared / union.
   */
  private static trigramSimilarity(a: string, b: string): number {
    const trigrams = (text: string) => {
      const set = new Set<string>();
      for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
        const padded = `  ${word} `;
        for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
      }
      return set;
    };
    const left = trigrams(a);
    const right = trigrams(b);
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    for (const gram of left) if (right.has(gram)) shared++;
    return shared / (left.size + right.size - shared);
  }
}
