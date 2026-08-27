-- Market index (Discover backend). See docs/design/architecture.md
-- "Market Index sync (Discover backend)" and tasks/plan.md "Data".
--
-- Four tables: market_roles, market_fields (categories), market_skills
-- (thin listing + capped description, no file bodies), market_field_skills
-- (per-field rank). Anon/authenticated get SELECT only — sync and the
-- server API write with the service role, which bypasses RLS.
--
-- Safe to re-run: every statement is idempotent (if not exists / on
-- conflict do nothing).

create table if not exists public.market_roles (
  slug text primary key,
  label text not null,
  sort_order integer not null,
  active boolean not null default true
);

create table if not exists public.market_fields (
  slug text primary key,
  role_slug text not null references public.market_roles (slug) on delete cascade,
  label text not null,
  q text not null,
  sort_order integer not null,
  shelf_size integer not null default 30,
  active boolean not null default true
);

create index if not exists market_fields_role_slug_idx on public.market_fields (role_slug);

create table if not exists public.market_skills (
  id text primary key,
  name text not null,
  slug text not null,
  source text not null,
  installs bigint not null default 0,
  -- Nullable: real skills.sh listing rows can omit this (see 0002).
  install_url text,
  url text not null,
  -- Search-only, capped ~500 chars by parse-skill-description.ts. Never a
  -- full SKILL.md body.
  description text,
  hash text,
  is_duplicate boolean not null default false,
  last_seen_at timestamptz not null,
  inactive boolean not null default false,
  updated_at timestamptz not null default now()
);

-- markInactiveBefore scans/updates by last_seen_at; listShelves and the
-- read API filter out inactive rows.
create index if not exists market_skills_last_seen_at_idx on public.market_skills (last_seen_at);
create index if not exists market_skills_inactive_idx on public.market_skills (inactive);

create table if not exists public.market_field_skills (
  field_slug text not null references public.market_fields (slug) on delete cascade,
  skill_id text not null references public.market_skills (id) on delete cascade,
  rank integer not null,
  primary key (field_slug, skill_id)
);

-- FK columns are not auto-indexed by Postgres; skill_id needs its own
-- index for the join in SupabaseMarketStore.listShelves and for a fast
-- ON DELETE CASCADE from market_skills.
create index if not exists market_field_skills_skill_id_idx on public.market_field_skills (skill_id);
create unique index if not exists market_field_skills_field_rank_idx on public.market_field_skills (field_slug, rank);

alter table public.market_roles enable row level security;
alter table public.market_fields enable row level security;
alter table public.market_skills enable row level security;
alter table public.market_field_skills enable row level security;

-- Least privilege: anon/authenticated can only ever SELECT. Revoke first
-- so this is correct whether or not the project's default privileges
-- already granted something broader; the service role (sync + server
-- API) bypasses RLS entirely and is not touched here.
revoke all on public.market_roles, public.market_fields, public.market_skills, public.market_field_skills
  from anon, authenticated;
grant select on public.market_roles, public.market_fields, public.market_skills, public.market_field_skills
  to anon, authenticated;

drop policy if exists market_roles_select on public.market_roles;
create policy market_roles_select on public.market_roles for select to anon, authenticated using (true);

drop policy if exists market_fields_select on public.market_fields;
create policy market_fields_select on public.market_fields for select to anon, authenticated using (true);

drop policy if exists market_skills_select on public.market_skills;
create policy market_skills_select on public.market_skills for select to anon, authenticated using (true);

drop policy if exists market_field_skills_select on public.market_field_skills;
create policy market_field_skills_select on public.market_field_skills for select to anon, authenticated using (true);

-- v1 seed: 4 roles / 20 fields (categories). Not a schema cap — insert
-- more rows later; MarketStore.listActiveFields picks them up with no
-- code change. Keep this list in sync with src/backend/market-seed.ts.
insert into public.market_roles (slug, label, sort_order, active) values
  ('swe', 'SWE', 1, true),
  ('ui-ux', 'UI/UX', 2, true),
  ('pm', 'PM', 3, true),
  ('data', 'Data', 4, true)
on conflict (slug) do nothing;

insert into public.market_fields (slug, role_slug, label, q, sort_order, shelf_size, active) values
  -- SWE (8)
  ('frontend', 'swe', 'Frontend', 'frontend ui', 1, 30, true),
  ('backend', 'swe', 'Backend', 'backend services', 2, 30, true),
  ('api', 'swe', 'API', 'api design', 3, 30, true),
  ('database', 'swe', 'Database', 'sql database', 4, 30, true),
  ('testing', 'swe', 'Testing', 'unit testing', 5, 30, true),
  ('security', 'swe', 'Security', 'security review', 6, 30, true),
  ('devops', 'swe', 'DevOps', 'ci cd', 7, 30, true),
  ('review', 'swe', 'Review', 'code review', 8, 30, true),
  -- UI/UX (3)
  ('product-ui', 'ui-ux', 'Product UI', 'ui ux', 1, 30, true),
  ('design-system', 'ui-ux', 'Design system', 'design system', 2, 30, true),
  ('usability', 'ui-ux', 'Usability', 'usability research', 3, 30, true),
  -- PM (5)
  ('prd', 'pm', 'Specs', 'product requirements', 1, 30, true),
  ('roadmap', 'pm', 'Roadmap', 'product roadmap', 2, 30, true),
  ('user-research', 'pm', 'User research', 'user research', 3, 30, true),
  ('competitive', 'pm', 'Competitive', 'competitive analysis', 4, 30, true),
  ('pm-writing', 'pm', 'Writing', 'stakeholder communication', 5, 30, true),
  -- Data (4)
  ('analysis', 'data', 'Analysis', 'data analysis', 1, 30, true),
  ('sql', 'data', 'SQL', 'sql warehouse', 2, 30, true),
  ('metrics', 'data', 'Metrics', 'ab testing metrics', 3, 30, true),
  ('viz', 'data', 'Viz', 'data visualization', 4, 30, true)
on conflict (slug) do nothing;
