-- Relevance-first search (design §3, tasks T21 + T22). Replaces "every word,
-- then installs" with a tiered rank so a better name match beats a popular
-- skill that only mentions the word:
--   0 exact name (case-insensitive)
--   1 name starts with the query
--   2 owner or topic: the query is the skill's owner (0006), or a field slug
--     in its topics for `taxonomy` (0007 labels, status 'ok', probability
--     >= min_prob and among its top max_topics fields, same rule as
--     `topicsFor`). Spaces in the query read as `-` (`design system`).
--   3 typo-close name (pg_trgm `%`, similarity >= 0.3 by default)
--   4 text match on name + description (`search_vector`, 0003)
-- An owner or topic hit sits below name hits (the user typed a skill's name)
-- and above typo/text hits (it is a deliberate filter, not a guess).
-- Within a tier: trigram similarity (tier 3) or ts_rank_cd (tier 4), then
-- installs, then id. `InMemoryMarketStore.searchListings` mirrors this rule;
-- keep the two in step. The caller passes taxonomy/min_prob/max_topics
-- (TAXONOMY_VERSION, TOPIC_THRESHOLD, MAX_TOPICS_PER_SKILL) so the numbers
-- live in one place.
--
-- Safe to re-run: if not exists / drop function if exists.

create extension if not exists pg_trgm;

-- Backs both `name % q` and the prefix `ilike`.
create index if not exists market_skills_name_trgm_idx
  on public.market_skills using gin (name gin_trgm_ops);

-- Drop first so a changed return type re-applies cleanly. The (text, int)
-- form is T21's draft of this file.
drop function if exists public.search_market_skills(text, int);
drop function if exists public.search_market_skills(text, int, text, real, int);

-- security invoker (default): callers see only what market_skills' RLS and
-- grants already allow. market_skill_labels has no anon policy, so for anon
-- callers topic hits are simply empty; the API calls with the service role.
-- `extensions` is on the path for Supabase, which installs pg_trgm there.
create function public.search_market_skills(q text, lim int, taxonomy text, min_prob real, max_topics int)
returns table (id text, name text, installs bigint)
language sql stable
set search_path = public, extensions
as $$
  with input as (
    select lower(btrim(q)) as term,
           regexp_replace(lower(btrim(q)), '\s+', '-', 'g') as topic,
           websearch_to_tsquery('english', q) as query
  ),
  -- Skills whose `topicsFor` topics at `taxonomy` include the query.
  topic_hits as (
    select l.skill_id
    from market_skill_labels l, input i,
         lateral (select (l.probabilities ->> i.topic)::float8 as p) t
    where l.taxonomy_version = taxonomy
      and l.status = 'ok'
      and t.p >= min_prob
      -- Fewer than max_topics fields rank above it (higher, or equal with a
      -- smaller slug: topicsFor's tie-break).
      and (select count(*)
           from jsonb_each_text(l.probabilities) f
           where f.value::float8 > t.p
              or (f.value::float8 = t.p and f.key < i.topic)) < max_topics
  ),
  hits as (
    select s.id, s.name, s.installs,
           case
             when lower(s.name) = i.term then 0
             when starts_with(lower(s.name), i.term) then 1
             when lower(s.owner) = i.term or th.skill_id is not null then 2
             when s.name % i.term then 3
             else 4
           end as tier,
           similarity(s.name, i.term) as sim,
           ts_rank_cd(s.search_vector, i.query) as text_rank
    from market_skills s
    cross join input i
    left join topic_hits th on th.skill_id = s.id
    where i.term <> ''
      and s.inactive = false
      and (
        -- Escape LIKE wildcards so `_` and `%` in a query match literally.
        s.name ilike replace(replace(replace(i.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or lower(s.owner) = i.term
        or th.skill_id is not null
        or s.name % i.term
        or s.search_vector @@ i.query
      )
  )
  select h.id, h.name, h.installs
  from hits h
  order by h.tier,
           case h.tier when 3 then h.sim when 4 then h.text_rank else 0 end desc,
           h.installs desc,
           h.id
  limit lim;
$$;

revoke all on function public.search_market_skills(text, int, text, real, int) from public;
grant execute on function public.search_market_skills(text, int, text, real, int) to anon, authenticated, service_role;
