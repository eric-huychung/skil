-- Agent + Other roles for classify-based shelves.
-- Keep in sync with src/backend/market-seed.ts. q is unused but NOT NULL.

insert into public.market_roles (slug, label, sort_order, active) values
  ('agent', 'Agent', 5, true),
  ('other', 'Other', 6, true)
on conflict (slug) do nothing;

insert into public.market_fields (slug, role_slug, label, q, sort_order, shelf_size, active) values
  ('workflow', 'agent', 'Workflow', 'agent workflow', 1, 30, true),
  ('integrations', 'other', 'Integrations', 'vendor integrations', 1, 30, true)
on conflict (slug) do nothing;
