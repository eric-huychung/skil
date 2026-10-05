import { err, ok, type Result } from '../core/result.js';
import type { MarketStore } from './market-store.js';
import type {
  AssembledShelfEntries,
  CreatorCheck,
  CreatorSkillRow,
  LabelPoolRow,
  MarketClassifyRow,
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  OwnerStats,
  ShelfField,
  ShelfMeta,
  ShelfRole,
  SkillScore,
} from './market-types.js';

interface SkillRow extends MarketListingInput {
  description: string | null;
  hash: string | null;
  isDuplicate: boolean;
  lastSeenAt: string;
  inactive: boolean;
}

/** In-memory `MarketStore` for tests. No network, no disk. */
export class InMemoryMarketStore implements MarketStore {
  private roles = new Map<string, MarketRole>();
  private fields = new Map<string, MarketField>();
  private skills = new Map<string, SkillRow>();
  /** field slug -> ranked skill ids, index 0 = rank 1 */
  private shelves = new Map<string, string[]>();

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

  async listTopListings(limit: number): Promise<Result<MarketClassifyRow[]>> {
    const rows = [...this.skills.values()]
      .filter((row) => !row.inactive)
      .sort((a, b) => b.installs - a.installs)
      .slice(0, Math.max(0, limit))
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        installs: row.installs,
        description: row.description,
        hash: row.hash,
      }));
    return ok(rows);
  }

  async upsertListing(listing: MarketListingInput, seenAt: string): Promise<Result<void>> {
    const existing = this.skills.get(listing.id);
    this.skills.set(listing.id, {
      ...listing,
      description: existing?.description ?? null,
      hash: existing?.hash ?? null,
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
    this.skills.set(id, { ...existing, description: detail.description, hash: detail.hash });
    return ok(undefined);
  }

  async markInactiveBefore(seenAt: string): Promise<Result<void>> {
    for (const [id, row] of this.skills) {
      this.skills.set(id, { ...row, inactive: row.lastSeenAt < seenAt });
    }
    return ok(undefined);
  }

  async setFieldShelf(fieldSlug: string, rankedSkillIds: string[]): Promise<Result<void>> {
    this.shelves.set(fieldSlug, [...rankedSkillIds]);
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
    const rankedIds = this.shelves.get(field.slug) ?? [];
    return rankedIds
      .slice(0, field.shelfSize)
      .map((id, index) => {
        const skill = this.skills.get(id);
        if (!skill || skill.inactive) {
          return null;
        }
        return { id: skill.id, name: skill.name, installs: skill.installs, rank: index + 1 };
      })
      .filter((row): row is ShelfField['skills'][number] => row !== null);
  }

  // --- T4 shelves ---

  async replaceShelves(_shelves: AssembledShelfEntries[], _taxonomyVersion: string): Promise<Result<void>> {
    return err(new Error('not implemented: replaceShelves (T4)'));
  }

  async getShelfMeta(): Promise<Result<ShelfMeta | null>> {
    return err(new Error('not implemented: getShelfMeta (T4)'));
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

  /** Installs descending, then id ascending (a stable order is what makes paging safe). */
  async listSkillsByOwners(owners: string[], _taxonomyVersion: string): Promise<Result<CreatorSkillRow[]>> {
    const rows: CreatorSkillRow[] = [];
    for (let from = 0; ; from += this.ownerPageSize) {
      const page = this.ownerSkillsPage(owners, from);
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

  async getDetailState(_id: string): Promise<Result<{ hash: string | null; hasExcerpt: boolean }>> {
    return err(new Error('not implemented: getDetailState (T15b)'));
  }

  async listIdsMissingExcerpt(): Promise<Result<string[]>> {
    return err(new Error('not implemented: listIdsMissingExcerpt (T15b)'));
  }

  // --- T17b labels ---

  async listLabelPool(): Promise<Result<LabelPoolRow[]>> {
    return err(new Error('not implemented: listLabelPool (T17b)'));
  }

  async listLabelKeys(_version: string): Promise<Result<Map<string, Pick<SkillScore, 'stateHash' | 'status'>>>> {
    return err(new Error('not implemented: listLabelKeys (T17b)'));
  }

  async saveLabels(_version: string, _scores: SkillScore[]): Promise<Result<void>> {
    return err(new Error('not implemented: saveLabels (T17b)'));
  }

  async listLabels(_version: string): Promise<Result<SkillScore[]>> {
    return err(new Error('not implemented: listLabels (T17b)'));
  }

  // --- T12a creatorChecks ---

  async getCreatorChecks(_keys: string[]): Promise<Result<CreatorCheck[]>> {
    return err(new Error('not implemented: getCreatorChecks (T12a)'));
  }

  async saveCreatorCheck(_check: CreatorCheck): Promise<Result<void>> {
    return err(new Error('not implemented: saveCreatorCheck (T12a)'));
  }

  // --- T21 search ---

  async searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>> {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = [...this.skills.values()]
      .filter((row) => !row.inactive)
      .filter((row) => {
        const haystack = `${row.name} ${row.description ?? ''}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .sort((a, b) => b.installs - a.installs)
      .slice(0, opts.limit);

    return ok(matches.map((row) => ({ id: row.id, name: row.name, installs: row.installs })));
  }
}
