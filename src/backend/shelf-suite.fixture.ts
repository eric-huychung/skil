import type { MarketClassifyRow } from './market-types.js';
import type { SkillLabel } from './shelf-assembler.js';

/**
 * Vendor-heavy pools shaped like the real index: Microsoft's Azure repos
 * and Lark's CLI repo each flood one shelf. Ids and names follow the real
 * `owner/repo/skill` pattern; installs are made up but keep the ordering
 * the tests rely on. Rows are deliberately not in installs order, so the
 * suite lead has to be picked, not inherited from input order.
 */
export const AZURE_LISTINGS: MarketClassifyRow[] = [
  row('microsoft/github-copilot-for-azure/azure-diagnostics', 90_000),
  row('microsoft/github-copilot-for-azure/azure-cost-optimization', 70_000),
  row('microsoft/github-copilot-for-azure/azure-deploy', 120_000),
  row('microsoft/github-copilot-for-azure/azure-storage', 50_000),
  row('microsoft/github-copilot-for-azure/azure-rbac', 40_000),
  row('microsoft/skills/azure-cosmos-py', 25_000),
  row('microsoft/skills/azure-ai-projects-py', 30_000),
  row('microsoft/skills/azure-identity-py', 20_000),
  row('microsoft/skills/copilot-sdk', 16_000),
  row('microsoft/skills/m365-agents-ts', 15_000),
  row('microsoft/skills/fabric-notebooks', 12_000),
  row('microsoft/skills/entra-app-registration', 11_000),
  row('microsoft/skills/kql-queries', 9_000),
  row('vercel-labs/agent-skills/vercel-deploy', 100_000),
  row('hashicorp/agent-skills/terraform-style-guide', 80_000),
];

export const LARK_LISTINGS: MarketClassifyRow[] = [
  row('larksuite/cli/lark-im', 55_000),
  row('larksuite/cli/lark-doc', 50_000),
  row('larksuite/cli/lark-calendar', 60_000),
  row('larksuite/cli/lark-base', 45_000),
  row('larksuite/cli/lark-sheets', 40_000),
  row('larksuite/cli/lark-approval', 30_000),
  // Two rows with one prefix is not a suite.
  row('larksuite/openclaw-lark/feishu-bitable', 20_000),
  row('larksuite/openclaw-lark/feishu-calendar', 18_000),
  row('slackapi/agent-skills/slack-messaging', 35_000),
];

export const AZURE_LABELS: SkillLabel[] = AZURE_LISTINGS.map((listing) => ({ id: listing.id, fieldSlugs: ['cloud'] }));
export const LARK_LABELS: SkillLabel[] = LARK_LISTINGS.map((listing) => ({ id: listing.id, fieldSlugs: ['chat'] }));

function row(id: string, installs: number): MarketClassifyRow {
  const parts = id.split('/');
  const name = parts[parts.length - 1] ?? id;
  return { id, name, slug: name, installs, description: name, hash: 'fixture' };
}
