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
  ShelfEntry,
  ShelfRole,
  ShelfSkill,
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

  async listOwnerStats(_owners: string[]): Promise<Result<OwnerStats[]>> {
    return err(new Error('not implemented: listOwnerStats (T5)'));
  }

  async listTopOwners(_limit: number): Promise<Result<OwnerStats[]>> {
    return err(new Error('not implemented: listTopOwners (T5)'));
  }

  async listSkillsByOwners(_owners: string[], _taxonomyVersion: string): Promise<Result<CreatorSkillRow[]>> {
    return err(new Error('not implemented: listSkillsByOwners (T5)'));
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
