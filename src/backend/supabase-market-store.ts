import type { SupabaseClient } from '@supabase/supabase-js';
import { err, ok, type Result } from '../core/result.js';
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
  ShelfSkill,
} from './market-types.js';

interface RoleRow {
  slug: string;
  label: string;
  sort_order: number;
}

interface FieldRow {
  slug: string;
  role_slug: string;
  label: string;
  sort_order: number;
  shelf_size: number;
}

interface FieldSkillRow {
  field_slug: string;
  rank: number;
  market_skills: { id: string; name: string; installs: number; inactive: boolean } | null;
}

function toError(message: string): Error {
  return new Error(`SupabaseMarketStore: ${message}`);
}

/**
 * `MarketStore` backed by Supabase (four tables — see
 * `supabase/migrations/0001_market_index.sql`). Takes an already-configured
 * `SupabaseClient` (service role — sync and the server API only, never
 * `gui/` or `web/`). Pure adapter: no schema decisions, no seed data.
 */
export class SupabaseMarketStore implements MarketStore {
  constructor(private readonly client: SupabaseClient) {}

  async upsertRole(role: MarketRole): Promise<Result<void>> {
    const { error } = await this.client
      .from('market_roles')
      .upsert(
        { slug: role.slug, label: role.label, sort_order: role.sortOrder, active: role.active },
        { onConflict: 'slug' },
      );
    if (error) return err(toError(error.message));
    return ok(undefined);
  }

  async upsertField(field: MarketField): Promise<Result<void>> {
    const { error } = await this.client
      .from('market_fields')
      .upsert(
        {
          slug: field.slug,
          role_slug: field.roleSlug,
          label: field.label,
          q: field.q,
          sort_order: field.sortOrder,
          shelf_size: field.shelfSize,
          active: field.active,
        },
        { onConflict: 'slug' },
      );
    if (error) return err(toError(error.message));
    return ok(undefined);
  }

  async listActiveFields(): Promise<Result<MarketField[]>> {
    const { data, error } = await this.client
      .from('market_fields')
      .select('slug, role_slug, label, q, sort_order, shelf_size, active')
      .eq('active', true);
    if (error) return err(toError(error.message));

    return ok(
      data.map((row) => ({
        slug: row.slug,
        roleSlug: row.role_slug,
        label: row.label,
        q: row.q,
        sortOrder: row.sort_order,
        shelfSize: row.shelf_size,
        active: row.active,
      })),
    );
  }

  /**
   * Upsert only touches listing columns. `description`/`hash` are never
   * in the payload, so Postgres leaves them alone on an existing row (and
   * defaults them to NULL on a brand-new one) — detail hydrate is the only
   * writer for those two columns.
   */
  async upsertListing(listing: MarketListingInput, seenAt: string): Promise<Result<void>> {
    const { error } = await this.client.from('market_skills').upsert(
      {
        id: listing.id,
        name: listing.name,
        slug: listing.slug,
        source: listing.source,
        installs: listing.installs,
        install_url: listing.installUrl,
        url: listing.url,
        last_seen_at: seenAt,
        inactive: false,
      },
      { onConflict: 'id' },
    );
    if (error) return err(toError(error.message));
    return ok(undefined);
  }

  async getHash(id: string): Promise<Result<string | null>> {
    const { data, error } = await this.client.from('market_skills').select('hash').eq('id', id).maybeSingle();
    if (error) return err(toError(error.message));
    return ok(data?.hash ?? null);
  }

  /** No-op if `id` is unknown: `.eq('id', id)` on an update just matches zero rows. */
  async setDetail(id: string, detail: MarketDetailInput): Promise<Result<void>> {
    const { error } = await this.client
      .from('market_skills')
      .update({ description: detail.description, hash: detail.hash, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return err(toError(error.message));
    return ok(undefined);
  }

  async markInactiveBefore(seenAt: string): Promise<Result<void>> {
    const inactivated = await this.client.from('market_skills').update({ inactive: true }).lt('last_seen_at', seenAt);
    if (inactivated.error) return err(toError(inactivated.error.message));

    const reactivated = await this.client
      .from('market_skills')
      .update({ inactive: false })
      .gte('last_seen_at', seenAt);
    if (reactivated.error) return err(toError(reactivated.error.message));

    return ok(undefined);
  }

  /** Replaces the shelf: delete this field's rows, then insert the new ranked list (rank 1..N by array order). */
  async setFieldShelf(fieldSlug: string, rankedSkillIds: string[]): Promise<Result<void>> {
    const deleted = await this.client.from('market_field_skills').delete().eq('field_slug', fieldSlug);
    if (deleted.error) return err(toError(deleted.error.message));

    if (rankedSkillIds.length === 0) {
      return ok(undefined);
    }

    const rows = rankedSkillIds.map((skillId, index) => ({
      field_slug: fieldSlug,
      skill_id: skillId,
      rank: index + 1,
    }));
    const inserted = await this.client.from('market_field_skills').insert(rows);
    if (inserted.error) return err(toError(inserted.error.message));

    return ok(undefined);
  }

  /**
   * Three plain queries (roles, active fields, field-skill ranks joined to
   * skills) assembled in JS — the same shape `InMemoryMarketStore` builds —
   * rather than one nested PostgREST embed. That keeps the "slice raw
   * ranks to shelf_size, then drop inactive/missing, without renumbering"
   * rule (matches `InMemoryMarketStore.skillsForField`) easy to get right
   * and easy to read.
   */
  async listShelves(): Promise<Result<ShelfRole[]>> {
    const rolesRes = await this.client
      .from('market_roles')
      .select('slug, label, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (rolesRes.error) return err(toError(rolesRes.error.message));
    const roles = rolesRes.data as RoleRow[];

    const fieldsRes = await this.client
      .from('market_fields')
      .select('slug, role_slug, label, sort_order, shelf_size')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (fieldsRes.error) return err(toError(fieldsRes.error.message));
    const fields = fieldsRes.data as FieldRow[];

    const fieldSlugs = fields.map((field) => field.slug);
    let fieldSkillRows: FieldSkillRow[] = [];
    if (fieldSlugs.length > 0) {
      const fieldSkillsRes = await this.client
        .from('market_field_skills')
        .select('field_slug, rank, market_skills(id, name, installs, inactive)')
        .in('field_slug', fieldSlugs)
        .order('rank', { ascending: true });
      if (fieldSkillsRes.error) return err(toError(fieldSkillsRes.error.message));
      // Global order-by-rank means each field's own rows still come out in
      // ascending rank order even though fields are interleaved.
      fieldSkillRows = fieldSkillsRes.data as unknown as FieldSkillRow[];
    }

    const rawByField = new Map<string, FieldSkillRow[]>();
    for (const row of fieldSkillRows) {
      const list = rawByField.get(row.field_slug) ?? [];
      list.push(row);
      rawByField.set(row.field_slug, list);
    }

    const fieldsByRole = new Map<string, FieldRow[]>();
    for (const field of fields) {
      const list = fieldsByRole.get(field.role_slug) ?? [];
      list.push(field);
      fieldsByRole.set(field.role_slug, list);
    }

    const shelfRoles: ShelfRole[] = roles.map((role) => ({
      slug: role.slug,
      label: role.label,
      fields: (fieldsByRole.get(role.slug) ?? []).map((field) => ({
        slug: field.slug,
        label: field.label,
        skills: skillsForField(field, rawByField.get(field.slug) ?? []),
      })),
    }));

    return ok(shelfRoles);
  }

  /**
   * `websearch_to_tsquery` against the generated `search_vector` column
   * (0003 migration) — index-backed via the GIN index, unlike `ilike`.
   * `websearch` syntax treats space-separated words as AND, matching
   * `InMemoryMarketStore`'s "every word must appear" behavior.
   */
  async searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>> {
    const { data, error } = await this.client
      .from('market_skills')
      .select('id, name, installs')
      .eq('inactive', false)
      .textSearch('search_vector', q, { type: 'websearch', config: 'english' })
      .order('installs', { ascending: false })
      .limit(opts.limit);
    if (error) return err(toError(error.message));

    return ok(data.map((row) => ({ id: row.id, name: row.name, installs: row.installs })));
  }

  async getListing(id: string): Promise<Result<MarketListingDetail | null>> {
    const { data, error } = await this.client
      .from('market_skills')
      .select('id, name, installs, url, install_url')
      .eq('id', id)
      .maybeSingle();
    if (error) return err(toError(error.message));
    if (!data) return ok(null);

    return ok({ id: data.id, name: data.name, installs: data.installs, url: data.url, installUrl: data.install_url });
  }
}

/** Slice the raw (rank-ordered) rows to `shelf_size` first, then drop inactive/missing — no renumbering. */
function skillsForField(field: FieldRow, rawRows: FieldSkillRow[]): ShelfField['skills'] {
  return rawRows
    .slice(0, field.shelf_size)
    .map((row): ShelfSkill | null => {
      const skill = row.market_skills;
      if (!skill || skill.inactive) {
        return null;
      }
      return { id: skill.id, name: skill.name, installs: skill.installs, rank: row.rank };
    })
    .filter((row): row is ShelfSkill => row !== null);
}
