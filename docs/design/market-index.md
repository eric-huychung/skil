# Market Index (Discover backend)

Separate from the engine. Feeds Discover only. Never the catalog in `.skil/state.json`. Engine: `docs/design/architecture.md`.

A curated Supabase copy of skills.sh (~20k rows), nested **role → category → top 30 by installs**. List rows are id / name / installs (rank on shelves only). Preview is live SKILL.md + audit — bodies stay off the DB. Landing copies `npx skills add`. GUI `+` calls `engine.install(skillId)` into the live pair.

## Seams

```typescript
interface MarketStore {            // src/backend/market-store.ts
  upsertRole / upsertField / listActiveFields / listTopListings
  upsertListing / getHash / setDetail / markInactiveBefore
  setFieldShelf / listShelves / searchListings / getListing
}

interface MarketSkillsClient {     // src/backend/market-client.ts
  listPage / getSkill / getAudit / getSkillMd   // live SKILL.md, never stored
}

class MarketSync {                 // src/backend/market-sync.ts
  crawlListing()                   // page the listing; queue ids with no hash
  hydrateDetails(ids)              // description + hash
  syncListing()                    // crawl, then markInactiveBefore (full success only)
  refreshActiveFields()            // top 1000 → dedup → LLM classify → rank
  sync({ maxDetail })              // weekly cron: shelves + cap hydrate; no listing crawl
}
```

Store adapters: `InMemoryMarketStore` (tests), `SupabaseMarketStore` (`supabase/migrations/0001_market_index.sql`). Seed: 6 roles / 21 fields in `src/backend/market-seed.ts`. `q` is unused for shelves. Weekly refresh classifies the top 1000 via Vercel AI Gateway (`LlmSkillClassifier`, `openai/gpt-4o-mini`). Laptop `scripts/sync-market.ts` and `api/cron/sync-market.ts` each construct `MarketSync` directly.

## Sync

- **First fill:** `npm run sync-market` — seed, crawl listing, paced hydrate, classify shelves. Resumable (re-discovers `hash: null`). Needs Supabase env + OIDC. Apply migrations first.
- **Weekly cron:** GitHub Actions (`/.github/workflows/sync-market.yml`) `GET https://www.skil.website/api/cron/sync-market` Sunday 00:00 UTC, `Authorization: Bearer $CRON_SECRET`. `sync({ maxDetail: 40 })` — shelves + 40 hydrates. No 20k listing crawl. 401 if secret missing/wrong. Same secret must exist in Vercel env (handler) and GitHub Actions secrets (caller).

## Read API

`src/backend/market-read.ts` behind `api/market/{shelves,search,preview}.ts`.

- **shelves** — `listShelves()`. Empty → `{ data: [] }`. CDN 1h.
- **search** — full index, not just shelves. `q` required. Limit 1–50. GIN/`tsvector` (`0003_market_search_index.sql`).
- **preview** — stored listing + live SKILL.md + audit. Unknown id → 404. Failed live fetch degrades. CDN 5m.

Landing (`web/`) fetches same-origin. GUI Discover proxies the same API through Electron main, plus live Top / Trending via `SkillsAdapter.browse`. Empty shelves stay on that nest and default to Top.

Why separate: own store, own sync loop, no on/off membership. It does not touch the engine catalog.
