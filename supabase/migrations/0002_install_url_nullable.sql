-- Real skills.sh listing rows can omit `install_url` (already optional on
-- the existing non-market `Skill` type — see `src/types/index.ts` and
-- `src/adapters/skills-adapter.ts`). 0001 wrongly required it not-null,
-- which broke the first-fill crawl on real data. Safe to re-run.

alter table public.market_skills alter column install_url drop not null;
