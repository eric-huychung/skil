-- Relevance-first search (design §3, task T21). Replaces "every word, then
-- installs" with a tiered rank so a better name match beats a popular
-- skill that only mentions the word:
--   0 exact name (case-insensitive)
--   1 name starts with the query
--   2 typo-close name (pg_trgm `%`, similarity >= 0.3 by default)
--   3 text match on name + description (`search_vector`, 0003)
-- Within a tier: trigram similarity (tier 2) or ts_rank_cd (tier 3), then
-- installs, then id. `InMemoryMarketStore.searchListings` mirrors this rule;
-- keep the two in step.
--
-- Safe to re-run: if not exists / drop function if exists.

create extension if not exists pg_trgm;

-- Backs both `name % q` and the prefix `ilike`.
create index if not exists market_skills_name_trgm_idx
  on public.market_skills using gin (name gin_trgm_ops);

-- Drop first so a changed return type re-applies cleanly.
drop function if exists public.search_market_skills(text, int);

-- security invoker (default): callers see only what market_skills' RLS and
-- grants already allow. `extensions` is on the path for Supabase, which
-- installs pg_trgm there.
create function public.search_market_skills(q text, lim int)
returns table (id text, name text, installs bigint)
language sql stable
set search_path = public, extensions
as $$
  with input as (
    select lower(btrim(q)) as term,
           websearch_to_tsquery('english', q) as query
  ),
  hits as (
    select s.id, s.name, s.installs,
           case
             when lower(s.name) = i.term then 0
             when starts_with(lower(s.name), i.term) then 1
             when s.name % i.term then 2
             else 3
           end as tier,
           similarity(s.name, i.term) as sim,
           ts_rank_cd(s.search_vector, i.query) as text_rank
    from market_skills s, input i
    where i.term <> ''
      and s.inactive = false
      and (
        -- Escape LIKE wildcards so `_` and `%` in a query match literally.
        s.name ilike replace(replace(replace(i.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or s.name % i.term
        or s.search_vector @@ i.query
      )
  )
  select h.id, h.name, h.installs
  from hits h
  order by h.tier,
           case h.tier when 2 then h.sim when 3 then h.text_rank else 0 end desc,
           h.installs desc,
           h.id
  limit lim;
$$;

revoke all on function public.search_market_skills(text, int) from public;
grant execute on function public.search_market_skills(text, int) to anon, authenticated, service_role;
