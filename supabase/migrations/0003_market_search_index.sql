-- Task 10 (GET /api/market/search): name + description search across the
-- full ~20k index. LIKE/ILIKE can't use a btree index and would force a
-- sequential scan at that size (see
-- .agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md).
-- A generated tsvector column + GIN index makes `SupabaseMarketStore
-- .searchListings`'s `websearch_to_tsquery` lookup index-backed instead.
--
-- Safe to re-run: `add column if not exists` / `create index if not exists`.

alter table public.market_skills
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored;

create index if not exists market_skills_search_vector_idx
  on public.market_skills using gin (search_vector);
