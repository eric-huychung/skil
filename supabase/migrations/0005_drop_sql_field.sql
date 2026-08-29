-- Drop Data / SQL. Warehouse SQL skills are not in the classify pool
-- (top 1000). Keep in sync with src/backend/market-seed.ts.
-- market_field_skills rows cascade via field_slug FK.

delete from public.market_fields where slug = 'sql';

update public.market_fields set sort_order = 2 where slug = 'metrics';
update public.market_fields set sort_order = 3 where slug = 'viz';
