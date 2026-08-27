import type { MarketField, MarketRole } from './market-types.js';

/**
 * v1 seed: 4 roles / 20 fields (categories). Not a schema cap — insert
 * more rows into `market_roles` / `market_fields` later; the next sync
 * picks them up (`MarketStore.listActiveFields`, `MarketSync.refreshActiveFields`).
 * Prefer 2+ word `q` (semantic search). See `tasks/plan.md`, "v1 seed".
 */
export const SEED_ROLES: MarketRole[] = [
  { slug: 'swe', label: 'SWE', sortOrder: 1, active: true },
  { slug: 'ui-ux', label: 'UI/UX', sortOrder: 2, active: true },
  { slug: 'pm', label: 'PM', sortOrder: 3, active: true },
  { slug: 'data', label: 'Data', sortOrder: 4, active: true },
];

const SHELF_SIZE = 30;

export const SEED_FIELDS: MarketField[] = [
  // SWE (8)
  field('frontend', 'swe', 'Frontend', 'frontend ui', 1),
  field('backend', 'swe', 'Backend', 'backend services', 2),
  field('api', 'swe', 'API', 'api design', 3),
  field('database', 'swe', 'Database', 'sql database', 4),
  field('testing', 'swe', 'Testing', 'unit testing', 5),
  field('security', 'swe', 'Security', 'security review', 6),
  field('devops', 'swe', 'DevOps', 'ci cd', 7),
  field('review', 'swe', 'Review', 'code review', 8),
  // UI/UX (3)
  field('product-ui', 'ui-ux', 'Product UI', 'ui ux', 1),
  field('design-system', 'ui-ux', 'Design system', 'design system', 2),
  field('usability', 'ui-ux', 'Usability', 'usability research', 3),
  // PM (5)
  field('prd', 'pm', 'Specs', 'product requirements', 1),
  field('roadmap', 'pm', 'Roadmap', 'product roadmap', 2),
  field('user-research', 'pm', 'User research', 'user research', 3),
  field('competitive', 'pm', 'Competitive', 'competitive analysis', 4),
  field('pm-writing', 'pm', 'Writing', 'stakeholder communication', 5),
  // Data (4)
  field('analysis', 'data', 'Analysis', 'data analysis', 1),
  field('sql', 'data', 'SQL', 'sql warehouse', 2),
  field('metrics', 'data', 'Metrics', 'ab testing metrics', 3),
  field('viz', 'data', 'Viz', 'data visualization', 4),
];

function field(slug: string, roleSlug: string, label: string, q: string, sortOrder: number): MarketField {
  return { slug, roleSlug, label, q, sortOrder, shelfSize: SHELF_SIZE, active: true };
}
