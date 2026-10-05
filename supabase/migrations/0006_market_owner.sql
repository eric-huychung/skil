-- Creators (design §3). `owner` is the first path segment of `source`
-- ("vercel-labs/agent-skills" -> "vercel-labs"), generated so sync never
-- has to write it. `market_owner_stats` gives one row per owner (ranking +
-- card numbers) without paging ~10k skill rows past PostgREST's 1,000 cap.
--
-- Safe to re-run: add column if not exists / create index if not exists /
-- create or replace view.

alter table public.market_skills
  add column if not exists owner text generated always as (split_part(source, '/', 1)) stored;

-- Partial: every Creators read filters out inactive rows.
create index if not exists market_skills_owner_idx
  on public.market_skills (owner) where inactive = false;
create index if not exists market_skills_active_installs_idx
  on public.market_skills (installs desc) where inactive = false;

-- Plain view (not materialized): ~10k rows to group is milliseconds.
-- security_invoker so the caller's privileges apply, not the view owner's.
create or replace view public.market_owner_stats with (security_invoker = true) as
  select owner,
         count(*)::int         as skill_count,
         sum(installs)::bigint as total_installs,
         max(installs)::bigint as best_installs
  from public.market_skills
  where inactive = false
  group by owner;

-- Only the service role (sync + server API) reads it.
revoke all on public.market_owner_stats from anon, authenticated;
