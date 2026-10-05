# Market index (the Discover backend)

Separate from the engine. It only feeds Discover and never touches the catalog in `.skil/state.json`. Engine docs: `docs/design/architecture.md`.

It's a Supabase copy of the skills.sh listing (one source, about 9.7k rows), sorted **role → topic → top 30**. Every active skill gets topic labels from Jev, and shelves are built from those stored labels. A **Creators** tab sits next to the shelves with 30 owners from a hand-edited YAML. Preview fetches SKILL.md and the audit live, so bodies never live in the DB (only a 1,000-char `label_excerpt` for labeling). Landing copies `npx skills add`, the GUI `+` calls `engine.install(skillId)`.

## Pieces

```typescript
interface MarketStore {            // src/backend/market-store.ts
  upsertRole / upsertField / listActiveFields
  upsertListing / getHash / setDetail / markInactiveBefore
  listShelves / searchListings / getListing
  replaceShelves / getShelfMeta                        // one RPC, one transaction
  listLabelPool / listLabelKeys / saveLabels / listLabels
  getDetailState / listIdsMissingExcerpt               // excerpt backfill
  listOwnerStats / listTopOwners / listSkillsByOwners  // Creators
  getCreatorChecks / saveCreatorCheck                  // creator gate cache
}

interface MarketSkillsClient {     // src/backend/market-client.ts
  listPage / getSkill / getAudit / getSkillMd          // SKILL.md is live, never stored
}

interface SkillClassifier {        // src/backend/skill-classifier.ts
  classify(rows, questions)        // -> { probabilities, status: ok | error, stateHash }
}

class MarketSync {                 // src/backend/market-sync.ts
  crawlListing()                   // page the listing, queue ids with no hash
  hydrateDetails(ids)              // description + hash + label_excerpt
  syncListing()                    // crawl, then markInactiveBefore (only on full success)
  labelPool(classifier, { dryRun })// incremental Jev labels, saved per batch of 100
  rebuildShelves({ dryRun })       // coverage gate -> buildShelves -> replaceShelves
}
```

- **Stores:** `InMemoryMarketStore` (tests) and `SupabaseMarketStore` (migrations `0001`–`0008`).
- **Seed:** 6 roles / 27 fields in `src/backend/market-seed.ts`.
- **Classifier:** `JevSkillClassifier` → `GatewayJevClient` (`typesafe-ai/jev` through the Vercel AI Gateway, key is `AI_GATEWAY_API_KEY`). Tests use `FakeSkillClassifier`.
- **skills.sh client:** 15s timeout, 2 retries with 500ms/1s backoff.
- `scripts/sync-market.ts` builds `MarketSync` directly. GitHub Actions runs the same script.

## Labels

- **Questions:** `TOPIC_QUESTIONS` in `src/backend/topic-taxonomy.ts`, one yes/no prompt per field (27 now, seed parity is tested). `TAXONOMY_VERSION` (currently `6df5d25974d4`) is a hash of the questions. Edit a prompt and the version changes, which relabels. Never bump it by hand. Revert a prompt and the old labels come back for free.
- **What Jev reads:** name, repo, description, excerpt. `state_hash` is the sha256 of that text. A label row is keyed by (skill, taxonomy version) and holds every field's probability as `jsonb` plus `status` (`ok` / `error`).
- **Calls:** one per skill, one boolean question per field. 8 in flight, 600 call starts a minute. 15s timeout, up to 5 tries with jitter on 429/529/5xx/network/timeout (401 and 422 don't retry). A bad answer retries once, then the row is saved as `error`.
- **Incremental:** a row needs a label if it has none for this version, its `state_hash` changed, or it's in `error`. Batches of 100 save as they finish, so a failed run keeps its progress and the next one resumes. More than 2% errored rows = `bad_answers`, run fails.
- **Topics:** fields with probability ≥ 0.4 (`TOPIC_THRESHOLD`), best first, max 3. No topic is a fine answer: the skill stays off shelves but stays searchable. 0.4–0.6 is the review band (labeled, low confidence). `--taxonomy-review` prints unlabeled and review-band rows. Probabilities are stored, so changing the threshold means a shelf rebuild, not a relabel.
- **Excerpt:** first 1,000 chars of the SKILL.md body, cut at a word, written during hydrate. A row counts as unchanged only if the hash matches **and** the excerpt exists. `--backfill-excerpt` fills the gaps.
- **Last full run** (2026-10-05, 27 fields): 9,692 labeled, 0 errors, about 27% with no topic. `integrations` is now strictly one named vendor/platform, `workflow` and `frontend` are narrower. See `decisions.md` for the tradeoff.

## Shelves

`rebuildShelves`:
1. **Coverage gate.** Every active row needs a label for the current version with a matching `state_hash`. Any gap returns `incomplete_coverage`, shelves stay untouched and the run fails.
2. **`buildShelves`** (`src/backend/shelf-assembler.ts`, pure). Per field: assign topics → dedup by name (highest installs) → suite collapse → rank (probability ≥ 0.8 first, then installs) → owner cap of 5 → cut to shelf size (30).
3. **`replaceShelves`** calls the `replace_market_shelves` RPC. All shelves plus `market_shelf_meta` (`generated_at`, `taxonomy_version`) land in one transaction.

**Suite collapse:** 3 or more rows with the same `source` and the same name prefix (before the first `-`) become one entry led by the best-installed row, with `more_count` = group size − 1. Both UIs show "name, +N more". Clicking it searches the prefix. A suite counts once toward the owner cap.

`--dry-run` prints the label diff and shelf health and writes nothing.

## Creators

- **The list:** `data/market-creators.yaml`. Exactly 30 entries in display order (pinned first), plus `blocked`, `techCutoff` (report only) and `officialOwners`. `parseMarketCreators` validates it. Humans edit it, no job rewrites it.
- **Stats:** `owner` is a generated column (`split_part(source, '/', 1)`), and the `market_owner_stats` view (migration `0006`) gives each card its skill count and total installs.
- **Official badge:** "Official on skills.sh" when an owner is in `officialOwners`, a snapshot of `https://skills.sh/official`. Never say "verified".
- **Report:** `npm run sync-market -- --creators-report` (read-only). Top 100 owners by best single-skill installs, aliases merged, then a Jev "is this a tech creator" gate (cached in `market_creator_checks`), `tech:` overrides, `blocked`, cutoff, and `selectThirty`. It prints who would enter or leave plus a paste-ready YAML block. It never edits the YAML. `officialOwners` is still a partial snapshot until the next report.

## Running it

- **First fill:** `npm run sync-market`. Seed → crawl the listing (`per_page=500`, follows `nextCursor`) → hydrate details + excerpt → label → shelves. Resumable. Needs Supabase env, `VERCEL_OIDC_TOKEN` (for skills.sh) and `AI_GATEWAY_API_KEY`. Apply migrations first.
- **Weekly:** `.github/workflows/sync-market.yml`, Sundays 00:00 UTC, runs `npm run sync-market -- --classify-only`. Seed → incremental labels → shelves. No crawl, no skills.sh call. Needs `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY` (`SLACK_WEBHOOK_URL` optional). 45 min timeout.
- **Other flags:** `--dry-run`, `--backfill-excerpt`, `--creators-report`, `--taxonomy-review`, `--max-detail=N`.

## When it fails

A failed run never changes what users see. Shelves stay as they were and finished label batches stay saved.

- Every run writes `.sync-market/summary.json` (and Markdown to `$GITHUB_STEP_SUMMARY` in CI): status, failed step (`config` / `seed` / `crawl` / `hydrate` / `label` / `shelves`), failure kind (`config` / `auth` / `request` / `unavailable` / `bad_answers` / `incomplete_coverage` / `store`), first error (secrets redacted), label counts, whether shelves were written, tokens used. Exit code is 0 for ok, 1 otherwise.
- `scripts/notify-slack.ts` reads that file. A `failure` step posts the run URL and details. A `stale` step warns when shelves are older than 10 days. No webhook set = it logs and exits 0.
- Known gap: the stale check can't run if GitHub turns off the schedule after 60 quiet days (GitHub emails the owner then).

## Read API

`src/backend/market-read.ts`, wrapped by `api/market/*.ts`:

| Route | What it does | CDN cache |
|---|---|---|
| `shelves` | role → field → skills (with `moreCount`). Empty index = `{ data: [] }` | 1h |
| `search?q=` | whole index (not just shelves) via the `search_market_skills` RPC (`0008`, `pg_trgm`). Exact name > prefix > owner/topic > typo-close > text, then installs. `q` max 200 chars, `limit` 1–50 | 60s |
| `preview?id=` | stored listing + live SKILL.md + audit. Unknown id = 404, a failed live fetch degrades to `null` | 5m |
| `suggested?role=` | editorial picks from `data/market-picks.yaml`, filled in from the index | 1h |
| `creators` / `creators?slug=` | 30 cards in YAML order, or one creator's skills grouped by repo with topics. Unknown slug = 404 | 1h |

Search is public, so it has the length cap and the short cache to keep anyone from burning the skills.sh and Supabase budget. Row Level Security lets the public key SELECT only, the label/check/meta tables have no public policy, and writes use the service role.

Landing (`web/`) calls the same origin. GUI Discover goes through Electron main (`marketShelves`, `marketCreators`, …) and also shows live Top / Trending via `SkillsAdapter.browse`. Empty shelves fall back to Top.

## Open items

- Confirm on a live run that the crawl ends because the last page has no `nextCursor`, not a hidden server cap, and note the install floor (around 970 today).
- The crawl is still a manual laptop job, so new skills only show up after someone runs it. The stale-shelves warning doesn't cover a stale listing.
- Excerpt backfill and the gold-set comparison haven't run yet.
