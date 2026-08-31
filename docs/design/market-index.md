# Market Index (Discover backend)

Separate track from the engine. See `architecture.md` for the engine and `tasks/plan.md` for the full spec.


**Status: Phases 1–4 shipped (sync core, persist + first fill, read API + UI, weekly cron).** Full spec: `tasks/plan.md`; task breakdown: `tasks/todo.md`.

Discover today calls `SkillsAdapter.search` / `.browse` live against skills.sh. The **market index** is a separate, precomputed alternative: a curated Supabase copy of skills.sh (~20k rows), nested **role → category (field) → top 30 skills by installs**, refreshed on a schedule instead of hit live. It is not the engine catalog (`skills[]` in `.skil/state.json`) — always say **market index**, never "engine." Roles and fields are **data rows**, not a hardcoded list of 20. **List** (shelf/search) is rank/name/installs (rank on shelves only). **Preview** is live GitHub + SKILL.md + audit — bodies stay off the DB. **Landing copies** `npx skills add`; **GUI `+` calls `engine.install(skillId)`** — live trees pivot, no Inbox step.

**Module boundary (pure logic, store/client both injected — same DI pattern as the engine):**

```typescript
interface MarketStore {           // src/backend/market-store.ts
  upsertRole(role: MarketRole): Promise<Result<void>>
  upsertField(field: MarketField): Promise<Result<void>>
  listActiveFields(): Promise<Result<MarketField[]>>
  listTopListings(limit: number): Promise<Result<MarketClassifyRow[]>>
  upsertListing(listing: MarketListingInput, seenAt: string): Promise<Result<void>>
  getHash(id: string): Promise<Result<string | null>>
  setDetail(id: string, detail: MarketDetailInput): Promise<Result<void>>
  markInactiveBefore(seenAt: string): Promise<Result<void>>
  setFieldShelf(fieldSlug: string, rankedSkillIds: string[]): Promise<Result<void>>
  listShelves(): Promise<Result<ShelfRole[]>>
  searchListings(q: string, opts: { limit: number }): Promise<Result<MarketSearchRow[]>>  // Task 10
  getListing(id: string): Promise<Result<MarketListingDetail | null>>                     // Task 11
}

interface MarketSkillsClient {    // src/backend/market-client.ts
  listPage(cursor?: string): Promise<Result<MarketListingPage>>
  getSkill(id: string): Promise<Result<MarketSkillDetail>>
  getAudit(id: string): Promise<Result<MarketAudit>>
  getSkillMd(id: string): Promise<Result<string | null>>  // Task 11 — live only, never stored
}

class MarketSync {                // src/backend/market-sync.ts
  crawlListing(): Promise<Result<CrawlListingResult>>       // page until no nextCursor; queue ids with no hash
  hydrateDetails(ids: string[]): Promise<Result<HydrateDetailsResult>>  // description + hash; same hash = no-op
  syncListing(): Promise<Result<CrawlListingResult>>         // crawlListing, then markInactiveBefore — only on full success
  refreshActiveFields(): Promise<Result<RefreshShelvesResult>>  // top 1000 → dedup → LLM classify → rank by installs
  sync(opts: { maxDetail: number }): Promise<Result<MarketSyncRunResult>>  // weekly cron: shelves + cap hydrate; no listing crawl
}
```

`InMemoryMarketStore` backs tests (`src/backend/in-memory-market-store.ts`). `SupabaseMarketStore` (`src/backend/supabase-market-store.ts`, Task 7, shipped) implements the same interface against four Supabase tables — see `tasks/plan.md` "Data" and `supabase/migrations/0001_market_index.sql`. `src/backend/market-seed.ts` holds the seed: 6 roles / 21 fields (Agent/Workflow + Other/Integrations added for classify; Data/SQL removed). New rows in `market_roles` / `market_fields` are picked up by `listActiveFields` with no code change. `q` is unused for shelves. `src/backend/parse-skill-description.ts` trims a SKILL.md's YAML `description` to ≤500 chars for the search field. Weekly shelf refresh (`MarketSync.refreshActiveFields`) classifies the top 1000 by installs via Vercel AI Gateway (`openai/gpt-4o-mini`) — laptop `scripts/sync-market.ts` and `api/cron/sync-market.ts` each construct `MarketSync` directly (store + `RealMarketSkillsClient` + `LlmSkillClassifier`); the shared behavior is `MarketSync` itself, not a factory.

`src/backend/market-skills-client.ts` (`RealMarketSkillsClient`, Task 8, shipped) is the real `MarketSkillsClient` against skills.sh's documented API (listing is page-based, not cursor-based — `listPage`'s cursor is the next page number as a string; `getSkill` parses `description` out of the returned `SKILL.md` file and falls back to hashing it locally when skills.sh's `hash` is `null`; `getAudit` reduces every partner's status to the worst of pass/warn/fail, or `none` on a 404 or empty list). Same OIDC-bearer-token pattern as `skills-proxy.ts`.

`scripts/sync-market.ts` (Task 8, shipped) is the first-fill/resumable runner: seeds roles/fields, then `syncListing` → paced `hydrateDetails` (batches of 8, ~1s apart, to stay under skills.sh's 600 req/min) → `refreshActiveFields`. Run with `npm run sync-market` after `.env` (Supabase) and `vercel env pull` (`VERCEL_OIDC_TOKEN` into `.env.local`) are set up. Re-running is safe: `syncListing` re-discovers every id whose `hash` is still `null`, so a killed run resumes on its own. Lives outside `src/` (its own `tsconfig.scripts.json`, run via `tsx` — not compiled into `dist/`) since it is a one-off operator script, not part of the CLI/GUI/Vercel-function build.

**Weekly Cron (Task 14, shipped):** `GET /api/cron/sync-market` (`api/cron/sync-market.ts`, same dist-import pattern). Vercel hits it Sunday 00:00 UTC (`vercel.json` `crons`, `0 0 * * 0`). Auth is `Authorization: Bearer $CRON_SECRET` — Vercel sends this when `CRON_SECRET` is in the project env; missing or wrong secret → 401 (fail closed, never calls skills.sh). Same `MarketSync` as the script, via `sync({ maxDetail: 40 })`: **refresh active field shelves + at most 40 SKILL.md hydrates**. No full listing crawl and no inactive reconcile — that 20k walk timed out at Vercel's 300s cap. Installs/inactive on unshelved rows lag until the next laptop `npm run sync-market`. Native OIDC (no `SKILLS_API_KEY`). `maxDuration` 300s. The weekly cron does **not** replace the laptop script.

**Read API (Tasks 9–11, shipped):** `src/backend/market-read.ts` holds three thin handlers, each a Vercel Function entry (`api/market/{shelves,search,preview}.ts`, same dist-import pattern as `api/skills/*.ts`).
- `handleShelvesRequest` — thin pass-through of `store.listShelves()`. Empty index → `{ data: [] }`, not an error. CDN `s-maxage=3600` (shelves only change on the weekly cron).
- `handleMarketSearchRequest` — `store.searchListings(q, { limit })` across the **full** stored index (not just shelved skills), same query for Landing and GUI. Missing `q` → 400. `limit` clamps 1–50, default 25. Rows are `{ id, name, installs }` — no rank (search has no rank concept), no description/hash. Backed by a generated `tsvector` column + GIN index (`supabase/migrations/0003_market_search_index.sql`) — `ilike` can't use an index at ~20k rows (see `.agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md`). `InMemoryMarketStore` mirrors the same "every word must match" semantics with a plain substring check, not real tsvector.
- `handleMarketPreviewRequest` — combines stored listing fields (`store.getListing`: installs/url/installUrl) with two **live** skills.sh calls (`client.getSkillMd`, `client.getAudit`) — SKILL.md bodies and audit status are never persisted, so preview always re-fetches them. Unknown id → 404. A failed live fetch degrades to `skillMd: null` / `audit.status: 'none'` rather than failing the whole preview. `installCommand` reuses `toSkillsAddSource` (`src/backend/skills-add-source.ts`, extracted out of `SkillsAdapter.install` so both the real installer and this display-only string agree on the `owner/repo@skill` form for 3-part ids). CDN `s-maxage=300` — shorter than shelves since audits can change independently of the weekly sync.

**Why separate from the engine:** the market index has its own store (Supabase, not `.skil/state.json`), its own sync loop (script + weekly cron, not scan), and no per-tree membership concept. It only feeds Discover's read path; it does not touch `SkillsAdapter` or the catalog.

**Landing (Task 12, shipped):** `web/lib/market-api.ts` (same-origin `fetch` for `/api/market/*` and live `/api/skills?view=` — `web/` is a static export on the same Vercel project as `api/`, no OIDC, no `src/` dependency) and `web/components/landing/discover.tsx` (Top / Trending, then role chips → category chips → 30-row list; a search box overrides the nest with the full-index search; row click opens a preview dialog with the live SKILL.md excerpt, audit badge, and a copy-to-clipboard `npx skills add` button). Empty or failed shelves keep the section and default to Top. Browse results are cached in-session (one fetch per view).

**GUI Discover (Task 13, shipped; `+` behavior updated by the live-trees pivot):** Three bridge methods (`marketShelves` / `marketSearch` / `marketPreview`) proxy the same read API through the **main process** via `axios` — not `fetch` in the renderer, for the same CORS reason `SkillsAdapter.search`/`.browse` already go through IPC. `MarketDiscover.tsx` is the same nest as Landing (Top / Trending + role → category), with a **+** button per row that calls `bridge.install(skillId)` — on immediately, live pair written, no staging step. Empty or failed shelves stay on this nest and default to Top — there is no second Discover component. A market search or browse error surfaces inline (`role="alert"`). Browse results are cached in-session. Selecting Top / Trending swaps the row list to the live skills.sh result and hides the category row.

**GUI Skills-tab preview:** Clicking a row opens the same `SkillPreviewDialog` Discover uses. Catalog rows (any `paths`) read `engine.readSkillMd` — first readable `SKILL.md`, plus the path list so live/leftover/parked copies are all visible. Discover-only ids (not yet in the catalog) call `marketPreview` (live SKILL.md + audit + copy `npx skills add`). Delete stays on the trash control (`stopPropagation`), preview-only, and hard-deletes live + parked copies of that **catalog id** (folder path under the skills root, e.g. `.agents/skills/tdd` and `.claude/skills/tdd` are one id `tdd`), not every similarly named folder or any leftover copy. Reset/Update confirm is portaled to `document.body` above the preview (`modal-backdrop` z-index 60, preview 50). Project rows with a market origin show a Synced / Edited / New copy badge (text + color, matching Discover audit colors). `updateFromMarket` downloads the market copy first, then swaps both live folders, so a scan cannot treat the id as gone mid-reset.

The migration is written but **a human still applies it** in the Supabase dashboard/CLI before the first `npm run sync-market` run — same as `tasks/plan.md` specifies for Task 7 (and 0003 for Task 10's search index). Until that first run, both Landing and GUI Discover show Top / Trending with no role tabs. After first fill, the weekly cron refreshes shelves and hydrates at most 40 details; it does not re-crawl the full listing.

