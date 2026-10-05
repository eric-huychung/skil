import type { SupabaseClient } from '@supabase/supabase-js';
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
  ShelfSkill,
  SkillScore,
} from './market-types.js';
import { MAX_TOPICS_PER_SKILL, TOPIC_THRESHOLD, topicsFor } from './topic-taxonomy.js';

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
  more_count: number;
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

  async listTopListings(limit: number): Promise<Result<MarketClassifyRow[]>> {
    const { data, error } = await this.client
      .from('market_skills')
      .select('id, name, slug, installs, description, hash')
      .eq('inactive', false)
      .order('installs', { ascending: false })
      .limit(Math.max(0, limit));
    if (error) return err(toError(error.message));

    return ok(
      data.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        installs: row.installs,
        description: row.description,
        hash: row.hash,
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

  /**
   * No-op if `id` is unknown: `.eq('id', id)` on an update just matches zero rows.
   * `label_excerpt` is only in the payload when `labelExcerpt` is given, so omitting it leaves the stored one.
   */
  async setDetail(id: string, detail: MarketDetailInput): Promise<Result<void>> {
    const { error } = await this.client
      .from('market_skills')
      .update({
        description: detail.description,
        hash: detail.hash,
        ...(detail.labelExcerpt === undefined ? {} : { label_excerpt: detail.labelExcerpt }),
        updated_at: new Date().toISOString(),
      })
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
        .select('field_slug, rank, more_count, market_skills(id, name, installs, inactive)')
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

  // --- T4 shelves ---

  /** One `replace_market_shelves` RPC (migration 0007): every shelf plus the meta row in one transaction. */
  async replaceShelves(shelves: AssembledShelfEntries[], taxonomyVersion: string): Promise<Result<void>> {
    const payload = shelves.map((shelf) => ({
      field_slug: shelf.fieldSlug,
      skills: shelf.entries.map((entry) => ({ id: entry.id, more_count: entry.moreCount })),
    }));
    const { error } = await this.client.rpc('replace_market_shelves', { payload, taxonomy: taxonomyVersion });
    if (error) return err(toError(error.message));

    return ok(undefined);
  }

  async getShelfMeta(): Promise<Result<ShelfMeta | null>> {
    const { data, error } = await this.client
      .from('market_shelf_meta')
      .select('generated_at, taxonomy_version')
      .maybeSingle();
    if (error) return err(toError(error.message));
    if (!data) return ok(null);

    return ok({ generatedAt: data.generated_at, taxonomyVersion: data.taxonomy_version });
  }

  // --- T5 owners (labels join: T19) ---

  /** PostgREST's default max rows per request; `listSkillsByOwners` pages with `.range()` past it. */
  private static readonly OWNER_PAGE_SIZE = 1000;

  private static toOwnerStats(row: {
    owner: string;
    skill_count: number;
    total_installs: number | string;
    best_installs: number | string;
  }): OwnerStats {
    // `bigint` columns may arrive as strings depending on PostgREST config.
    return {
      owner: row.owner,
      skillCount: Number(row.skill_count),
      totalInstalls: Number(row.total_installs),
      bestInstalls: Number(row.best_installs),
    };
  }

  /** From the `market_owner_stats` view (0006). Rows come back in `owners` order (deduped). */
  async listOwnerStats(owners: string[]): Promise<Result<OwnerStats[]>> {
    const wanted = [...new Set(owners)];
    if (wanted.length === 0) return ok([]);

    const { data, error } = await this.client
      .from('market_owner_stats')
      .select('owner, skill_count, total_installs, best_installs')
      .in('owner', wanted);
    if (error) return err(toError(error.message));

    const byOwner = new Map(data.map((row) => [row.owner as string, SupabaseMarketStore.toOwnerStats(row)]));
    return ok(wanted.map((owner) => byOwner.get(owner)).filter((row): row is OwnerStats => row !== undefined));
  }

  /** Ties broken by owner ascending. */
  async listTopOwners(limit: number): Promise<Result<OwnerStats[]>> {
    if (limit <= 0) return ok([]);

    const { data, error } = await this.client
      .from('market_owner_stats')
      .select('owner, skill_count, total_installs, best_installs')
      .order('best_installs', { ascending: false })
      .order('owner', { ascending: true })
      .limit(limit);
    if (error) return err(toError(error.message));

    return ok(data.map((row) => SupabaseMarketStore.toOwnerStats(row)));
  }

  /**
   * Pages with `.range()` until a short page. Installs descending, then id
   * ascending: a total order, so no row is skipped or repeated across pages.
   * For each page, a second query reads `market_skill_labels` for those ids at
   * `taxonomyVersion`; `ok` labels become `topics` via `topicsFor`, the rest `[]`.
   */
  async listSkillsByOwners(owners: string[], taxonomyVersion: string): Promise<Result<CreatorSkillRow[]>> {
    const wanted = [...new Set(owners)];
    if (wanted.length === 0) return ok([]);

    const pageSize = SupabaseMarketStore.OWNER_PAGE_SIZE;
    const rows: CreatorSkillRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('market_skills')
        .select('id, name, source, owner, installs')
        .eq('inactive', false)
        .in('owner', wanted)
        .order('installs', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return err(toError(error.message));

      // Ids go in the URL, so chunk them to keep each `.in()` request short.
      const topicsById = new Map<string, string[]>();
      const ids = data.map((row) => row.id as string);
      for (let i = 0; i < ids.length; i += 200) {
        const labels = await this.client
          .from('market_skill_labels')
          .select('skill_id, probabilities')
          .eq('taxonomy_version', taxonomyVersion)
          .eq('status', 'ok')
          .in('skill_id', ids.slice(i, i + 200));
        if (labels.error) return err(toError(labels.error.message));
        for (const label of labels.data) {
          topicsById.set(
            label.skill_id,
            topicsFor(label.probabilities as Record<string, number>, TOPIC_THRESHOLD, MAX_TOPICS_PER_SKILL),
          );
        }
      }

      for (const row of data) {
        rows.push({
          id: row.id,
          name: row.name,
          source: row.source,
          owner: row.owner,
          installs: row.installs,
          topics: topicsById.get(row.id) ?? [],
        });
      }
      if (data.length < pageSize) break;
    }
    return ok(rows);
  }

  // --- T15b detail ---

  async getDetailState(id: string): Promise<Result<{ hash: string | null; hasExcerpt: boolean }>> {
    const { data, error } = await this.client
      .from('market_skills')
      .select('hash, label_excerpt')
      .eq('id', id)
      .maybeSingle();
    if (error) return err(toError(error.message));
    return ok({ hash: data?.hash ?? null, hasExcerpt: data?.label_excerpt != null });
  }

  /** Paged past PostgREST's 1,000-row cap, ordered by id. */
  async listIdsMissingExcerpt(): Promise<Result<string[]>> {
    const res = await this.pageLabelRows<{ id: string }>((from, to) =>
      this.client
        .from('market_skills')
        .select('id')
        .eq('inactive', false)
        .is('label_excerpt', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (!res.ok) return res;
    return ok(res.value.map((row) => row.id));
  }

  // --- T17b labels ---

  private readonly labelPageSize = 1_000;

  /**
   * Reads every row past PostgREST's 1,000-row cap: `.range()` pages until
   * a short page. `fetchRange` must apply a stable `.order()` so pages
   * don't overlap or skip.
   */
  private async pageLabelRows<T>(
    fetchRange: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<Result<T[]>> {
    const rows: T[] = [];
    for (let from = 0; ; from += this.labelPageSize) {
      const { data, error } = await fetchRange(from, from + this.labelPageSize - 1);
      if (error) return err(toError(error.message));
      const page = data ?? [];
      rows.push(...page);
      if (page.length < this.labelPageSize) return ok(rows);
    }
  }

  async listLabelPool(): Promise<Result<LabelPoolRow[]>> {
    const res = await this.pageLabelRows<{
      id: string;
      name: string;
      source: string;
      installs: number;
      description: string | null;
      label_excerpt: string | null;
      owner: string;
    }>((from, to) =>
      this.client
        .from('market_skills')
        .select('id, name, source, installs, description, label_excerpt, owner')
        .eq('inactive', false)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (!res.ok) return res;

    return ok(
      res.value.map((row) => ({
        id: row.id,
        name: row.name,
        source: row.source,
        installs: row.installs,
        description: row.description,
        labelExcerpt: row.label_excerpt,
        owner: row.owner,
      })),
    );
  }

  async listLabelKeys(version: string): Promise<Result<Map<string, Pick<SkillScore, 'stateHash' | 'status'>>>> {
    const res = await this.pageLabelRows<{ skill_id: string; state_hash: string; status: SkillScore['status'] }>((from, to) =>
      this.client
        .from('market_skill_labels')
        .select('skill_id, state_hash, status')
        .eq('taxonomy_version', version)
        .order('skill_id', { ascending: true })
        .range(from, to),
    );
    if (!res.ok) return res;

    return ok(new Map(res.value.map((row) => [row.skill_id, { stateHash: row.state_hash, status: row.status }])));
  }

  /** One upsert on (skill_id, taxonomy_version). `labeled_at` is set explicitly so re-labels refresh it. */
  async saveLabels(version: string, scores: SkillScore[]): Promise<Result<void>> {
    if (scores.length === 0) return ok(undefined);

    const labeledAt = new Date().toISOString();
    const { error } = await this.client.from('market_skill_labels').upsert(
      scores.map((score) => ({
        skill_id: score.id,
        taxonomy_version: version,
        state_hash: score.stateHash,
        model_version: score.modelVersion,
        probabilities: score.probabilities,
        status: score.status,
        labeled_at: labeledAt,
      })),
      { onConflict: 'skill_id,taxonomy_version' },
    );
    if (error) return err(toError(error.message));
    return ok(undefined);
  }

  async listLabels(version: string): Promise<Result<SkillScore[]>> {
    const res = await this.pageLabelRows<{
      skill_id: string;
      state_hash: string;
      model_version: string;
      probabilities: Record<string, number>;
      status: SkillScore['status'];
    }>((from, to) =>
      this.client
        .from('market_skill_labels')
        .select('skill_id, state_hash, model_version, probabilities, status')
        .eq('taxonomy_version', version)
        .order('skill_id', { ascending: true })
        .range(from, to),
    );
    if (!res.ok) return res;

    return ok(
      res.value.map((row) => ({
        id: row.skill_id,
        status: row.status,
        probabilities: row.probabilities,
        stateHash: row.state_hash,
        modelVersion: row.model_version,
      })),
    );
  }

  // --- T12a creatorChecks ---

  /** One `in` query; the report asks for about 100 keys, well under the 1,000-row page. */
  async getCreatorChecks(keys: string[]): Promise<Result<CreatorCheck[]>> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return ok([]);

    const { data, error } = await this.client
      .from('market_creator_checks')
      .select('creator_key, state_hash, tech_probability, domain, model_version')
      .in('creator_key', unique);
    if (error) return err(toError(error.message));

    return ok(
      ((data ?? []) as {
        creator_key: string;
        state_hash: string;
        tech_probability: number;
        domain: string;
        model_version: string;
      }[]).map((row) => ({
        creatorKey: row.creator_key,
        stateHash: row.state_hash,
        techProbability: Number(row.tech_probability),
        domain: row.domain,
        modelVersion: row.model_version,
      })),
    );
  }

  /** Upsert on `creator_key`. `checked_at` is set explicitly so a re-check refreshes it. */
  async saveCreatorCheck(check: CreatorCheck): Promise<Result<void>> {
    const { error } = await this.client.from('market_creator_checks').upsert(
      {
        creator_key: check.creatorKey,
        state_hash: check.stateHash,
        tech_probability: check.techProbability,
        domain: check.domain,
        model_version: check.modelVersion,
        checked_at: new Date().toISOString(),
      },
      { onConflict: 'creator_key' },
    );
    if (error) return err(toError(error.message));
    return ok(undefined);
  }

  // --- T21 search ---

  /**
   * Calls the `search_market_skills` RPC (0008 migration): exact name >
   * name prefix > typo-close name (pg_trgm) > text match, then installs.
   * `InMemoryMarketStore.searchListings` mirrors the same ordering rule.
   */
  async searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>> {
    const { data, error } = await this.client.rpc('search_market_skills', { q, lim: opts.limit });
    if (error) return err(toError(error.message));

    const rows = (data ?? []) as Array<{ id: string; name: string; installs: number | string }>;
    return ok(rows.map((row) => ({ id: row.id, name: row.name, installs: Number(row.installs) })));
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
      const shelfSkill: ShelfSkill = { id: skill.id, name: skill.name, installs: skill.installs, rank: row.rank };
      return row.more_count > 0 ? { ...shelfSkill, moreCount: row.more_count } : shelfSkill;
    })
    .filter((row): row is ShelfSkill => row !== null);
}
