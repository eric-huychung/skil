import type { MarketClassifyRow } from './market-types.js';

/** Known mappings the assembler and classifier tests lock. */
export const GOLD_LABELS: Array<{ id: string; fieldSlugs: string[] }> = [
  { id: 'anthropics/skills/frontend-design', fieldSlugs: ['frontend'] },
  { id: 'mattpocock/skills/tdd', fieldSlugs: ['testing'] },
  { id: 'mattpocock/skills/code-review', fieldSlugs: ['review'] },
  { id: 'vercel-labs/agent-skills/vercel-react-best-practices', fieldSlugs: ['frontend'] },
  { id: 'mattpocock/skills/grill-me', fieldSlugs: ['workflow'] },
  { id: 'vercel-labs/skills/find-skills', fieldSlugs: ['workflow'] },
  { id: 'nexscope-ai/amazon-skills/amazon-product-research', fieldSlugs: ['integrations'] },
];

export const GOLD_LISTINGS: MarketClassifyRow[] = [
  row('anthropics/skills/frontend-design', 'frontend-design', 826843),
  row('clone/frontend-design', 'frontend-design', 100),
  row('mattpocock/skills/tdd', 'tdd', 783326),
  row('mattpocock/skills/code-review', 'code-review', 429859),
  row('vercel-labs/agent-skills/vercel-react-best-practices', 'vercel-react-best-practices', 669940),
  row('mattpocock/skills/grill-me', 'grill-me', 987948),
  row('vercel-labs/skills/find-skills', 'find-skills', 3141174),
  row('nexscope-ai/amazon-skills/amazon-product-research', 'amazon-product-research', 77596),
];

function row(id: string, name: string, installs: number): MarketClassifyRow {
  return { id, name, slug: name, installs, description: name, hash: 'gold' };
}
