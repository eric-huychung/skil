# Market Index (Discover backend)

Separate from the engine. Feeds Discover only. Never the catalog in `.skil/state.json`. Engine: `docs/design/architecture.md`.

A curated Supabase copy of the skills.sh listing (single source, about 9.7k rows), nested **role → topic → top 30**. Every active row gets a topic label from Jev; shelves are built from stored labels. A **Creators** tab sits beside the shelves: 30 owners from a hand-edited YAML. List rows are id / name / source / installs (rank on shelves only). Preview is live SKILL.md + audit — bodies stay off the DB (a 1,000-char `label_excerpt` is stored for labeling only). Landing copies `npx skills add`. GUI `+` calls `engine.install(skillId)` into the live pair.

## Seams

```typescript
interface MarketStore {            // src/backend/market-store.ts
  upsertRole / upsertField / listActiveFields / listTopListings
  upsertListing / getHash / setDetail / markInactiveBefore
  listShelves / searchListings / getListing
  replaceShelves / getShelfMeta                        // one RPC, one transaction
  listLabelPool / listLabelKeys / saveLabels / listLabels
  getDetailState / listIdsMissingExcerpt               // excerpt backfill
  listOwnerStats / listTopOwners / listSkillsByOwners  // Creators
  getCreatorChecks / saveCreatorCheck                  // creator gate cache
}

interface MarketSkillsClient {     // src/backend/market-client.ts
  listPage / getSkill / getAudit / getSkillMd   // live SKILL.md, never stored
}

interface SkillClassifier {        // src/backend/skill-classifier.ts
  classify(rows, questions)        // → SkillScore { probabilities, status: ok | error, stateHash }
}

class MarketSync {                 // src/backend/market-sync.ts
  crawlListing()                   // page the listing; queue ids with no hash
  hydrateDetails(ids)              // description + hash + label_excerpt
  syncListing()                    // crawl, then markInactiveBefore (full success only)
  labelPool(classifier, { dryRun }) // incremental Jev labels, saved per batch of 100
  rebuildShelves({ dryRun })       // coverage gate → buildShelves → replaceShelves
}
```

Store adapters: `InMemoryMarketStore` (tests), `SupabaseMarketStore` (`supabase/migrations/0001`–`0008`). Seed: roles / fields in `src/backend/market-seed.ts`. Classifier: `JevSkillClassifier` → `GatewayJevClient` (`typesafe-ai/jev` via Vercel AI Gateway `/v1/evaluate`, `AI_GATEWAY_API_KEY`). Tests use `FakeSkillClassifier`. `refreshActiveFields` and `LlmSkillClassifier` (`gpt-4o-mini`, top 1000) are still in the tree; the script no longer calls them. Laptop `scripts/sync-market.ts` constructs `MarketSync` directly; GitHub Actions runs the same `--classify-only` path.

## Labels

- **Taxonomy:** `TOPIC_QUESTIONS` in `src/backend/topic-taxonomy.ts`, one yes/no prompt per field (parity with the seed is tested). `TAXONOMY_VERSION` = first 12 hex of sha256 over the question set. Editing a prompt changes the version, which relabels; never hand-bump it. Reverting a prompt restores the old version's stored labels at zero calls.
- **State:** `buildLabelState` = name, repo, description, excerpt. `state_hash` = sha256 of that text. Label key is (skill, taxonomy version); a row holds every field's probability in `jsonb` plus `status` (`ok` / `error`). Migration `0007`.
- **Jev:** one call per skill, one boolean question per field. 8 calls in flight, 600 call starts per minute. Client: 15s timeout, 5 tries with jitter on 429 / 529 / 5xx / network / timeout; 401 and 422 do not retry. A bad answer (missing question, probability outside 0–1) retries once, then the row is saved as `status: 'error'`.
- **Incremental:** a row needs a label when it has none for this version, its `state_hash` changed, or its status is `error`. Batches of 100 save as they finish, so a failed run keeps its finished batches and the next run **resumes** past them. More than 2% errored rows → `bad_answers`, run fails.
- **Topics:** `topicsFor` keeps fields ≥ 0.4, highest first, at most 3 (`TOPIC_THRESHOLD`; lowered from 0.6 after the first run). No topic is a valid answer: the row stays off shelves and stays searchable (no `integrations` dumping). 0.4–0.6 is the review band, labeled but low confidence; `--taxonomy-review` prints unlabeled and review-band rows. All probabilities are stored, so a threshold change needs a shelf rebuild, not relabeling.
- **Excerpt:** first 1,000 chars of the SKILL.md body, cut at a word, written by hydrate. Hydrate treats a row as unchanged only when the hash matches **and** the excerpt is present. `--backfill-excerpt` runs that path for every row missing one.
- First run (2026-10-05, taxonomy `ff85d19cf77d`, no excerpts yet): 9,692 labeled, 0 errors, 8.66M input tokens. At 0.6, 3,983 skills (41.1%) had no topic; at 0.4, 2,535 (26.2%). Review band 2,879. Every shelf holds 30 skills from 16–22 owners; top owner share ≤ 16.7%. Roughly 40% of the unlabeled skills fit no field (marketing, media, finance, science); `integrations` is broad and noisy at 0.4. Excerpt backfill and the gold-set comparison have not run.

## Shelves

`rebuildShelves`:
1. **Coverage gate:** every active row needs a label for `TAXONOMY_VERSION` whose `state_hash` matches (ok or error). Any gap → `{ written: false, reason: 'incomplete_coverage' }`; shelves untouched, run fails.
2. `buildShelves` (`src/backend/shelf-assembler.ts`, pure), per field: assign topics → dedup by name (highest installs; display only) → **suite collapse** → rank by tier (probability ≥ 0.8 first) then installs → **owner cap** 5 per shelf → cut to `shelfSize`.
3. `replaceShelves` → `replace_market_shelves` RPC: every shelf plus `market_shelf_meta` (`generated_at`, `taxonomy_version`) in one transaction.

**Suite collapse:** rows with the same `source` (owner/repo) and the same name prefix before the first `-`, 3 or more, become one entry led by the best-installed row; `more_count` = group size − 1. Both UIs render "name, +N more"; clicking "+N more" searches the prefix in the same view. A collapsed suite counts as one entry toward the owner cap.

`--dry-run` prints the label diff and shelf health (unlabeled share, per-shelf count and distinct owners, review band) and writes nothing.

## Creators

- **List:** `data/market-creators.yaml` — exactly 30 `creators` in display order (pins first: `slug`, `label`, `owners` aliases, `pinned`, optional `tech` override), `blocked`, `techCutoff` (report only), `officialOwners` + `officialFetchedAt`. Validated by `parseMarketCreators`. A human edits it; no job rewrites it.
- **Owner stats:** `owner` is a generated column (`split_part(source, '/', 1)`) with an index; `market_owner_stats` view (migration `0006`). Cards show skill count and total installs from it.
- **Official:** a creator is "Official on skills.sh" when any of its owners is in `officialOwners`, a snapshot of `https://skills.sh/official`. Never "verified".
- **Report:** `npm run sync-market -- --creators-report` (laptop, read-only except the gate cache). Top 100 owners by best single-skill installs, aliases merged → Jev tech gate (yes/no + domain, owner name + top 10 skills; cached in `market_creator_checks` by creator key + `state_hash`) → `tech:` overrides → `blocked` → cutoff → `selectThirty` (pins first). Fetches `/official` (on failure: "official list unchanged", keeps going) and GitHub followers (`GITHUB_TOKEN` optional, else "n/a"). Prints enter/leave against the YAML and a paste-ready YAML block. Writes nothing to the YAML.

## Sync

- **First fill:** `npm run sync-market` — seed, crawl the skills.sh listing (`per_page=500`, follows `nextCursor` until a page has none; no page cap in our code), hydrate missing details + excerpt, label, rebuild shelves. Resumable. Needs Supabase env, `VERCEL_OIDC_TOKEN` for skills.sh, and `AI_GATEWAY_API_KEY`. Apply migrations first.
- **Weekly cron:** GitHub Actions (`/.github/workflows/sync-market.yml`) runs `npm run sync-market -- --classify-only` Sunday 00:00 UTC: seed → label (incremental) → shelves. No crawl, no skills.sh call. Talks to Supabase + Vercel AI Gateway directly. Needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`; `SLACK_WEBHOOK_URL` optional. Timeout 45 min.
- Other flags: `--dry-run`, `--backfill-excerpt`, `--creators-report`, `--taxonomy-review`, `--max-detail=N`.

## Failure handling

A failed run never changes what users see: shelves stay as they were, finished label batches stay saved.

- **Summary + exit code:** every sync run writes `.sync-market/summary.json` (plus Markdown to `$GITHUB_STEP_SUMMARY` when set): `status`, `failedStep` (`config` / `seed` / `crawl` / `hydrate` / `label` / `shelves`), `failureKind` (`config` / `auth` / `request` / `unavailable` / `bad_answers` / `incomplete_coverage` / `store`), `firstError` (secrets redacted, 300 chars), labeled / needed / errored, `shelvesWritten`, `shelvesGeneratedAt`, `taxonomyVersion`, model calls, input tokens. Exit `0` on ok, `1` otherwise. Laptop and CI behave the same.
- **Slack:** `scripts/notify-slack.ts` reads the summary. `failure` step (`if: failure()`): run URL, failed step, labeled vs. needed, first error, shelf age. `stale` step (`if: always()`): warns when shelves are older than 10 days. No summary file → "sync-market failed before writing a summary". Empty `SLACK_WEBHOOK_URL` → logs "Slack not configured", exits 0.
- **Limit:** the stale check can't fire if GitHub disables the scheduled workflow (60 days without repo activity); GitHub emails the owner then.

## Read API

`src/backend/market-read.ts` behind `api/market/{shelves,search,preview,creators}.ts`.

- **shelves** — `listShelves()`, entries carry `moreCount`. Empty → `{ data: [] }`. CDN 1h.
- **search** — full index, not just shelves. `q` required. Limit 1–50. `search_market_skills` RPC (`0008`, `pg_trgm`): exact name > name prefix > owner or topic > typo-close name > text match, then installs.
- **preview** — stored listing + live SKILL.md + audit. Unknown id → 404. Failed live fetch degrades. CDN 5m.
- **creators** — no `slug`: 30 cards in YAML order (label, official, pinned, skill count, total installs). `?slug=`: one creator's skills grouped by repo, with topics for the current `TAXONOMY_VERSION` (`[]` until labels exist). Not deduped by name. Unknown slug → 404; bad YAML → 500 `config_error`; store error → 500 `store_error`. CDN 1h. Never calls Jev, GitHub or skills.sh. `vercel.json` ships `data/market-creators.yaml` with the function.

Landing (`web/`) fetches same-origin. GUI Discover proxies the same API through Electron main (`marketShelves` / `marketCreators` / `marketCreator` …), plus live Top / Trending via `SkillsAdapter.browse`. Empty shelves stay on that nest and default to Top.

Why separate: own store, own sync loop, no on/off membership. It does not touch the engine catalog.

## Open items

- Crawl-cap check (spec task 2): confirm on a live run that the skills.sh crawl ends naturally (last page has no `nextCursor`) rather than at a server-side page cap, and record the install floor (about 970 installs today).
- The crawl stays a laptop job; new skills appear only after a manual crawl. The stale-shelves warning does not cover a stale listing.
- `officialOwners` is a partial snapshot until the next `--creators-report`.
