import { MarketSync } from './market-sync.js';
import type { MarketStore } from './market-store.js';
import { RealMarketSkillsClient } from './market-skills-client.js';
import { LlmSkillClassifier } from './llm-skill-classifier.js';

export interface CreateMarketSyncDeps {
  store: MarketStore;
  fetchImpl?: typeof fetch;
  getOidcToken: () => Promise<string>;
  getGatewayToken: () => Promise<string>;
}

/**
 * One factory for both `scripts/sync-market.ts` and `api/cron/sync-market.ts`.
 * Category step is always `refreshActiveFields` (top 1000 → dedup → LLM → shelves).
 */
export function createMarketSync(deps: CreateMarketSyncDeps): MarketSync {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return new MarketSync({
    store: deps.store,
    client: new RealMarketSkillsClient({ fetchImpl, getOidcToken: deps.getOidcToken }),
    classifier: new LlmSkillClassifier({ fetchImpl, getAccessToken: deps.getGatewayToken }),
  });
}
