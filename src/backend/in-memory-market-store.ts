import { ok, type Result } from '../core/result.js';
import type { MarketStore } from './market-store.js';
import type {
  MarketDetailInput,
  MarketField,
  MarketListingDetail,
  MarketListingInput,
  MarketRole,
  MarketSearchRow,
  ShelfField,
  ShelfRole,
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
}
