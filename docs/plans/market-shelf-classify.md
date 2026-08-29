# Plan: Classify market shelves from the index

One phase. No UI change. Weekly cron already exists (`GET /api/cron/sync-market`, Sunday).

## What's different

**Today:** each category is a skills.sh **search** (`frontend ui`, `unit testing`, …) → take 30 hits → re-sort those 30 by installs. Top / Trending are a different API. Measured: **0/30** all-time top skills are on any shelf. `frontend-design` and `tdd` are missing; shelves are full of name-clones and false hits.

**After:** weekly sync takes the **top ~1000 skills already in our DB**, drops name-clones, **LLM-classifies** each into 0–2 categories via **Vercel AI Gateway**, then ranks by installs and writes shelves. GUI / Landing just render `listShelves()` — they pick up new tabs for free.

## Why it works better

Search is lexical and capped at 30 *before* popularity. Two-word `q` misses skills that don't contain both words. Keyword aliases also fail: they miss metaphor names (`grill-me`, Lark in Chinese) and mis-file word collisions (`find-skills` → Backend because the description says "express").

The LLM reads name + description and picks the **job**, not matching words. Popular skills land on the right shelf. Thin categories stay short instead of padding with junk.

## Cost (Vercel AI Gateway, `openai/gpt-4o-mini`)

Gateway has **no markup** — you pay the model list price ($0.15 / 1M in, $0.60 / 1M out). ~113k in + 25k out per run (~50 batches of 20).

| | |
|--|--|
| First run (same as one classify) | **~$0.03** |
| Weekly cron | **~$0.03** |
| Year (52 weeks) | **~$1.60** |

No classify-10k. No embeddings. Fail closed if the call fails — last week's shelves stay.

Cron on Vercel can use AI Gateway via **OIDC** (same pattern as skills.sh). Laptop `npm run sync-market` needs `AI_GATEWAY_API_KEY`. Never in Electron / `web/`.

## How it works

```
top 1000 in market_skills
        → dedup by lowercase name (keep highest installs)
        → SkillClassifier (Vercel AI Gateway, gpt-4o-mini)
        → ShelfAssembler (rank by installs, cap 30, leftover → Integrations)
        → setFieldShelf
```

- Pool is top 1000, not 10k, not “until every shelf has 30.”
- 0–2 fields per skill. Unknown slugs dropped.
- New data-only roles: **Agent / Workflow** and **Other / Integrations** (sort 5–6). `market_fields.q` stays in the schema; we stop reading it.
- Do not persist classifications in a new table. Reclassify every Sunday.

## Seams (test here)

| Seam | Assert |
|------|--------|
| `ShelfAssembler.build` | Dedup, 2-field cap, install rank, leftover → `integrations` |
| `SkillClassifier.classify` | Batch in / labels out |
| `MarketStore.listTopListings` | Active, installs desc, description included |
| `MarketSync.refreshActiveFields` | Uses top-N + classifier; on err writes **no** shelves; does **not** call `searchSkills` |

Fake classifier in tests. Prod adapter: `LlmSkillClassifier` → `https://ai-gateway.vercel.sh` (`openai/gpt-4o-mini`). Recorded HTTP fixture — no live key in CI.

## Gold labels (lock before the prompt)

| skill | field |
|-------|--------|
| `anthropics/skills/frontend-design` | `frontend` |
| `mattpocock/skills/tdd` | `testing` |
| `mattpocock/skills/code-review` | `review` |
| `vercel-labs/agent-skills/vercel-react-best-practices` | `frontend` |
| `mattpocock/skills/grill-me` | `workflow` |
| `vercel-labs/skills/find-skills` | `workflow` |
| `nexscope-ai/amazon-skills/amazon-product-research` | `integrations` (not Specs) |
| second `frontend-design` (lower installs) | dropped by dedup |

## Out of scope

Top / Trending stay live skills.sh. No GUI layout work. No typed-search change. No embeddings.

## Phase 1 (the whole job)

Verification: `npx vitest run` on the files a task touches. After all tasks: `npm test`. One live refresh, eyeball shelves vs Top, **then** leave Sunday cron on.

1. **`ShelfAssembler.build`** — pure. Dedup, rank, cap, leftovers → `integrations`. Gold fixture in `src/backend/shelf-gold.fixture.ts`.
2. **`MarketStore.listTopListings(limit)`** — both adapters. Active, installs desc, include description. No new index.
3. **Seed Agent + Other** — `market-seed.ts` + `supabase/migrations/0004_market_agent_other.sql` (`workflow`, `integrations`). Existing roles stay 1–4.
4. **`SkillClassifier` port + fake** — `classify(skills, fields) → Result<{ id, fieldSlugs }[]>`. Missing ids → `[]`. No network.
5. **Rewrite `refreshActiveFields`** — top 1000 → classify → assemble → `setFieldShelf`. Classify `Err` = write nothing. `failed` always `[]` (or drop the field). `queued` = pool ids with no hash.
6. **`LlmSkillClassifier`** — batch 20, Vercel AI Gateway, parse JSON. One failed batch → `Err`. Tests use fake `fetch` + recorded body. Key / OIDC injected; never imported by `gui/` or `web/`.
7. **Wire cron + `sync-market.ts`** — pass classifier into `MarketSync`. Missing gateway auth → refresh `Err` / cron 500. Human applies `0004` before first run. One local refresh, check Frontend / Testing / Agent / Other.
8. **Drop `MarketSkillsClient.searchSkills`** from the market client (CLI/GUI `/api/skills/search` stays). Update `docs/design/architecture.md`. Leave `market_fields.q`.

Done when: gold tests pass, `npm test` green, first live shelves look like Top (not a 2-word search).
