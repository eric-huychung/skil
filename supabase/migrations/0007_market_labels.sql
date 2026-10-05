-- Topics + safety net (design §3): Jev label state, creator tech-gate
-- cache, shelf build metadata, collapsed-suite counts, and an atomic
-- shelf replace.
--
-- The three new tables have RLS enabled and NO anon/authenticated
-- policies: only the service role (sync + server API) reads or writes
-- them, and it bypasses RLS.
--
-- Safe to re-run: if not exists / create or replace / on conflict.

-- Excerpt Jev reads. Capped at 1,000 chars by the parser, like
-- `description` is capped at 500. Never sent to clients.
alter table public.market_skills add column if not exists label_excerpt text;

-- One row per skill per taxonomy version. All field probabilities kept, so
-- threshold tuning needs no new model calls.
create table if not exists public.market_skill_labels (
  skill_id         text not null references public.market_skills (id) on delete cascade,
  -- Hash of the question set (src/backend/topic-taxonomy.ts).
  taxonomy_version text not null,
  -- sha256 of the exact text sent to Jev.
  state_hash       text not null,
  -- e.g. "typesafe-ai/jev@1.13.0", from the response.
  model_version    text not null,
  -- { "frontend": 0.91, "testing": 0.04, ... } all fields; {} on error.
  probabilities    jsonb not null,
  status           text not null check (status in ('ok', 'error')),
  labeled_at       timestamptz not null default now(),
  primary key (skill_id, taxonomy_version)
);
create index if not exists market_skill_labels_version_idx
  on public.market_skill_labels (taxonomy_version);

-- Tech-gate cache for the creators report. One row per owner group.
create table if not exists public.market_creator_checks (
  -- Sorted owner aliases joined by '+', e.g. "larksuite+open.feishu.cn".
  creator_key      text primary key,
  state_hash       text not null,
  tech_probability real not null,
  domain           text not null,
  model_version    text not null,
  checked_at       timestamptz not null default now()
);

-- When shelves were last built, and from which labels. Single row.
create table if not exists public.market_shelf_meta (
  id               boolean primary key default true check (id),
  generated_at     timestamptz not null,
  taxonomy_version text not null
);

alter table public.market_skill_labels enable row level security;
alter table public.market_creator_checks enable row level security;
alter table public.market_shelf_meta enable row level security;

-- Revoke in case the project's default privileges granted anything.
revoke all on public.market_skill_labels, public.market_creator_checks, public.market_shelf_meta
  from anon, authenticated;

-- Collapsed vendor suite: lead row plus "+N more".
alter table public.market_field_skills add column if not exists more_count integer not null default 0;

-- Replace every shelf and the shelf meta row in one transaction.
-- payload: [{ field_slug, skills: [{ id, more_count }] }], rank = array order.
-- `where true`: Supabase's safeupdate rejects an unqualified DELETE on
-- PostgREST (RPC) connections.
create or replace function public.replace_market_shelves(payload jsonb, taxonomy text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from market_field_skills where true;
  insert into market_field_skills (field_slug, skill_id, rank, more_count)
  select f->>'field_slug', s.value->>'id', s.ordinality::int, coalesce((s.value->>'more_count')::int, 0)
  from jsonb_array_elements(payload) f,
       jsonb_array_elements(f->'skills') with ordinality s;
  insert into market_shelf_meta (id, generated_at, taxonomy_version) values (true, now(), taxonomy)
  on conflict (id) do update
    set generated_at = excluded.generated_at, taxonomy_version = excluded.taxonomy_version;
end $$;

revoke all on function public.replace_market_shelves(jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_market_shelves(jsonb, text) to service_role;
