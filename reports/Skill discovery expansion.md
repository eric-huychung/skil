# Skill discovery expansion: Creators shelf and better topics (skills.sh only)

Status: reviewed with the product owner on 2026-10-04; all open decisions are settled (see "Decisions log" at the end). Ready to build. Data was measured on 2026-10-04 against the live `market_skills` table and Jev was called live through the Vercel AI Gateway. This replaces the earlier multi-source report (still in git history, commit `126b655`).

In one paragraph: Skil keeps skills.sh as its only source. It adds a Creators shelf of 30 creators (2 pins plus the top 28 tech creators by most-installed skill, with an "Official on skills.sh" badge copied from skills.sh's own page). It replaces the weekly top-1,000 classifier with Jev, a cheap decision model, that labels every skill once, stores labels by content hash, and only relabels what changed. A failed run changes nothing for users and posts to Slack.

## Decision

1. **skills.sh stays the only source.** No SkillsMP, AgenticSkills, or other adapters. No merged 20k table.
2. **Add a Creators shelf** of 30 creators: 2 pins first, then the highest-ranked creators that pass a **tech-relevance gate** (Jev reads each creator's skills and says whether they are tech related). Ranking is by each creator's **single most-installed skill**. There is no follower gate and no review band. The proposed list is below, already run through the gate. The Official badge comes from skills.sh's own `/official` page.
3. **Replace the topic classifier's weak points** instead of adding more sources: label every skill (not just the top 1,000) with **Jev**, a decision model that can only answer from a list we give it, remember labels between weeks, and stop one vendor's suite from flooding shelves.
4. **Jev is the only model, with no fallback.** If a Jev call fails, the job stops, keeps last week's labels and shelves, and sends a Slack alert from CI. See "Failure handling and alerts".
5. **No counters or telemetry.** Decided: skip.
6. **Defer** trust tiers, evidence tables, canonical identity/revision tables, ranking vectors, teams. Each has a revisit trigger at the end.

Why this fits the product: the PRD says Skil wraps skills.sh and does not host a marketplace, and the moat in `note.txt` is the map, doctor and collections. Discovery should be good enough to feed that loop, not a second product.

## What the data says today

| Fact | Measured value | Why it matters |
|---|---|---|
| Rows in `market_skills` | 10,249 total, **9,692 active**, 557 inactive | Not 20k. The "20k" in `docs/design/market-index.md` and the `sync-market.ts` header was a target from the multi-source plan. |
| Install floor | Lowest active row is about 970 installs; 9,245 rows have 1,000 or more | The table looks like the whole skills.sh listing above a roughly 1k-install floor, not a partial crawl. Unverified: confirm the crawl ends naturally rather than hitting a page cap. |
| Rows classified each week | Top 1,000 by installs (about 10%), cut off at 17.6k installs | 90% of skills never get a topic. |
| Labels stored | None. Only the ranked shelf rows are written (`market_field_skills`) | Every Sunday re-pays for all 1,000, and nothing can be queried or evaluated later. |
| Shelf fill | 550 shelf slots hold only **426 distinct skills**. `roadmap` 7, `viz` 5, `competitive` 8, `prd` 20 | Same skill appears in two shelves; some shelves are thin. |
| Shelf quality | Azure skills appear under backend, devops, security, testing, database, metrics. Lark skills appear under api, database, integrations. | The 21 fields describe jobs, but vendor suites dominate by installs and the classifier forces a field. |
| Unlabeled skills | `buildShelves` sends any unlabeled skill to **`integrations`** | `integrations` is a dumping ground, not a topic. |
| Dedup | `dedupByName` runs before classify. 8,719 distinct names across 9,692 rows. 50 of the top 1,000 are dropped | Fine for clone-heavy names like `frontend-design`, wrong for a Creators shelf: it hides a creator's skill behind someone else's copy. |
| Description size | Average 295 characters, median 276, p90 500 | About 0.8M tokens for the whole table. Embedding or labeling every row once is cheap. |
| Search | English `tsvector`, results ordered by installs | A match on one word beats a better match with fewer installs. |

### Install counts are not a clean popularity signal

- **Bundle inflation.** In `open.feishu.cn`, the top skill (633k) is about the same as the median skill (631k) across 29 skills. That pattern means one install of the pack is counted once per skill. Summing installs gives 27.4M for Lark across both owners, which is not 27M people.
- **Accounts with odd numbers.** All of these are ordinary skills.sh publishers; "odd" is my label, based on their numbers and GitHub profiles, and I cannot prove any manipulation. `prime-skills` (30 skills, 10.9M installs; one repo, `runcomfy-agent-skills`, RunComfy media-generation routers at about 409k installs each), `skills-101` (26 skills, 2.4M; one repo, inference.sh video/image/avatar tools at about 443k each), `genmedia-labs` (5 skills, 1.2M; also RunComfy, about 230k each), `lllllllama` (12 skills, 4.0M; deep-learning repo reproduction skills at about 450k each), and `uizze.com` (4 skills; UI inspiration, one skill at 554k). They have 0 to 16 GitHub followers, one repo, and most accounts were created in 2026. The near-identical install counts across a pack's skills point to pack installs being counted once per skill. All 30 `prime-skills` rows are in the top 1,000, so they are on the classify pool and the Top list today. Decisions: Top and Trending are left alone; on Creators, `prime-skills` and `genmedia-labs` are removed by the tech gate (media generation), while `skills-101`, `lllllllama` and `uizze.com` pass the gate and stay on the list.
- **Catalog sprawl.** `affaan-m` (283 skills), `forcedotcom` (215), `github` (288) and `anthropics` (274) have hundreds of skills, most under 10k installs. A plain sum rewards sprawl.

That is why the Creators ranking below uses each creator's single most-installed skill, not a sum.

## Creators shelf

### Definition

A **creator** is one GitHub owner, or a small alias group for the same entity, that publishes skills on skills.sh. The owner is the first segment of `source` (`vercel-labs/agent-skills` gives `vercel-labs`). Creators are a different axis from topics: topic is a Jev label per skill, creator is derived for free from `source`.

### How the 30 are picked (the query)

1. Group active rows by owner. Merge aliases for the same entity: `larksuite` + `open.feishu.cn` become `lark`; `google` + `googleworkspace` + `google-labs-code` become `google`.
2. **Score = installs of the owner's single most-installed skill.** One number, no rules. A pack of 5 skills counts once (not 5 times), and an owner with hundreds of skills gets no advantage from sprawl. This replaces both the old follower gate and the earlier "top-5 with bundle damping" idea.
3. **Tech-relevance gate (Jev).** Only creators whose skills are tech related are eligible. See below. There is **no GitHub follower gate**; followers are shown in the report for information only.
4. **Pins** are placed first and bypass the gate. The shelf has exactly **30 slots**: pins take their slots and the ranked creators that pass the gate fill the rest from the top, so each pin pushes the lowest-ranked creator off.
5. A `blocked` list in `data/market-creators.yaml` can remove any owner by hand. It starts empty.

### Tech-relevance gate

**Goal:** keep the Creators shelf about building, running and using software, data and AI tools, and keep out creators whose skills are mainly marketing, sales, media generation or general productivity.

**Definition (plain):** a creator is *tech related* if most of their skills help someone build, test, deploy, operate, secure or design **software**, work with **data**, or build **AI agents and tooling**. UI/UX and design-system work counts, because it ships as software. Marketing copy, SEO, sales enablement, video/image generation, and note-taking or office tools do not count by themselves.

**How it works (cheap and automatic):**
1. For each candidate owner (about the top 70 to 100 by score, so about 100 calls), build one state: the owner name and the name plus short description of their top 10 skills by installs.
2. Ask Jev in one call: a yes/no question ("Are most of these skills for building, testing, deploying, operating or designing software, doing data work, or building AI agents and tooling?") and a **choice** question for the main domain (software dev, devops/infra, data/AI, design/UI, marketing/sales, media generation, productivity/office, other). The domain answer tells you *why* a creator was excluded.
3. **Pass at 0.4 or higher; below 0.4 is rejected automatically.** No review band, no manual list. A human can still override a single owner with `tech: true|false` in the YAML (needed only if Jev gets one wrong).
4. Cache the result by owner plus a hash of the state. A creator is re-asked only when their top skills change. Weekly cost is close to zero.
5. The cutoff (0.4) is one number in the YAML (`techCutoff`), so changing it needs no code change.

**Why Jev and not a rule:** the shelf needs the same judgement on 100 owners with different catalogs, and "design" is tech while "marketing" is not. A keyword rule gets that inconsistent; a decision model gives a probability and a domain label for each owner.

### Result of running the gate on the top 70 owners (2026-10-04, one call each)

Without any follower gate, the full run produced this:

| Outcome | Owners (tech probability) |
|---|---|
| **Fail (below 0.4)** | lark (0.10), prime-skills (0.10), genmedia-labs (0.18), coreyhaines31 (0.03), higgsfield-ai (0.32), kepano (0.29), useosint (0.09), flowkit-labs (0.12), jimliu (0.14), nexscope-ai (0.04), code.deepline.com (0.36), dontbesilent2025 (0.04), wecomteam (0.10), op7418 (0.19), alchaincyf (0.12), wind-information-co-ltd (0.23) |
| **Pass (0.4 or higher)** | Everyone else in the top 70, including all of the final list below. The lowest passers are intellectronica (0.40), autonnel (0.44), juliusbrussee (0.52), tavily-ai (0.51), heygen-com (0.56), stripe (0.62), dietrichgebert (0.64), skills-101 (0.69) |

Notes: at the chosen 0.4 cutoff, `heygen-com` (0.56) and `skills-101` (0.69), both media-generation by Jev's domain answer, get in. This was a deliberate choice; a higher cutoff (for example 0.6) would drop `heygen-com` and `juliusbrussee` and is a one-number change. `stripe` and `tavily-ai` score low because their skills lean on payments and search APIs, which shows the gate is least sure about API vendors. `remotion-dev` was labeled "media generation" but passed at 0.82 because its skills are programmatic video code.

### The launch list: 2 pins + 28 ranked creators

Ranked by each creator's most-installed skill. Official = listed on skills.sh's `/official` page (see "Official badge" below). I checked that no owner outside the 70 gated ones has a skill above 90k installs, so this list is complete for the cutoff (the 28th creator has 102k).

| # | Creator | Best skill installs | Tech | Official on skills.sh |
|---|---|---|---|---|
| pin | addyosmani | n/a | 0.86 | no |
| pin | antfu | n/a | 0.94 | no |
| 1 | vercel-labs | 3.16M | 0.97 | yes |
| 2 | mattpocock | 1.00M | 0.82 | no |
| 3 | anthropics | 832k | 0.85 | yes |
| 4 | microsoft | 560k | 0.97 | yes |
| 5 | uizze.com | 554k | 0.92 | no |
| 6 | remotion-dev | 501k | 0.82 | yes |
| 7 | juliusbrussee | 466k | 0.52 | no |
| 8 | heygen-com | 455k | 0.56 | no |
| 9 | lllllllama | 451k | 0.87 | no |
| 10 | skills-101 | 443k | 0.69 | no |
| 11 | leonxlnx | 419k | 0.95 | no |
| 12 | supabase | 376k | 0.95 | yes |
| 13 | obra | 344k | 0.95 | no |
| 14 | nextlevelbuilder | 336k | 0.85 | no |
| 15 | shadcn | 272k | 0.89 | no |
| 16 | pbakaus | 253k | 0.87 | no |
| 17 | prisma | 246k | 0.94 | yes |
| 18 | scrapegraphai | 245k | 0.83 | no |
| 19 | emilkowalski | 237k | 0.92 | no |
| 20 | stablyai | 187k | 0.85 | no |
| 21 | firebase | 141k | 0.95 | yes |
| 22 | sentry | 135k | 0.77 | no (skills.sh lists `getsentry`) |
| 23 | arvindrk | 128k | 0.84 | no |
| 24 | neondatabase | 122k | 0.95 | yes |
| 25 | google | 110k | 0.96 | yes |
| 26 | get-convex | 109k | 0.96 | no (skills.sh lists `convex-dev`) |
| 27 | browser-act | 108k | 0.83 | no |
| 28 | better-auth | 102k | 0.91 | yes |

Next in line: firecrawl (100k), browser-use (93k), stripe (79k), cloudflare (72k). 10 of the 28 ranked creators carry the Official badge.

Things to be honest about:

- **Ranking by the single best skill is simple but narrow.** It favors creators with one hit over creators with several solid skills (for example `cloudflare` and `wshobson` fall out). The report can show a second column (number of skills over 10k installs) if you want a tie-breaker later.
- **`heygen-com`, `skills-101` and `juliusbrussee` are in because of the 0.4 cutoff**, even though the first two are media-generation by Jev's domain answer. Accepted by the product owner.
- **Small accounts** `lllllllama` (16 GitHub followers), `uizze.com` and `browser-act` are in because they are on topic and popular. Accepted by the product owner. The `blocked` list can remove any of them later.
- The ranking is by adoption on skills.sh, not by quality.
- The 30 creators own 1,040 active skills. Only 502 of them are in the current top 1,000 (the set that gets a topic today), so 538 would show no topic on a creator's page. That is one reason topics must cover every row.
- The list is a snapshot from 2026-10-04. The weekly job does not change it; `--creators-report` shows who would enter or leave, and a human edits the YAML.

### Official badge

The badge is **not our judgement**. skills.sh publishes an `/official` page: "Official skills from the companies and organizations that build the technology." It lists about 98 owners (Anthropic, AWS, Cloudflare, Firebase, GitHub, Google, Microsoft, NVIDIA, OpenAI, Vercel, Supabase, Stripe, Clerk and so on). Findings:
- skills.sh does **not document the criteria** for being listed, and I found **no API field** for it. The only machine-readable source is the page itself, which is server-rendered with each owner as a link, so a script can read it.
- Plan: a small script (`--creators-report`, also runnable on its own) reads the `/official` page and writes the owner list, with a date, into `data/market-creators.yaml` (`officialOwners`). The badge reads "Official on skills.sh", never just "Official" or "Verified". The list is refreshed when you run the report, not on every build, so a layout change on skills.sh cannot break the weekly job.
- This replaces my earlier hand-picked list. For example `get-convex` is not on the page (skills.sh lists `convex-dev`), `mattpocock`, `obra` and `addyosmani` are people and not listed, and `lark` is not listed.
- Risk: a page scrape is brittle. If the page changes or cannot be parsed, keep the last saved list and alert, same as other failures.

### Data shape

- **Migration (additive, idempotent, like the existing ones):** add a generated `owner` column (`split_part(source, '/', 1)`) with an index. No new source data, nothing existing is changed.
- **File: `data/market-creators.yaml`**, same style as `data/market-picks.yaml`:
  - `updatedAt` and `techCutoff` (0.4).
  - `creators`: one entry per slot in display order: `slug`, `label`, `owners` (aliases, for example `lark` = `larksuite` + `open.feishu.cn`), `pinned` (true for the 2 pins), and an optional `tech: true|false` override.
  - `blocked`: owners excluded even if they pass the gate. Starts empty.
  - `officialOwners` plus `officialFetchedAt`: the snapshot of skills.sh's `/official` page.
  - Org or person type and follower counts are read from the public GitHub API by the report and shown there; they are not stored as truth in the YAML.
- **Script: `npm run sync-market -- --creators-report`** (read-only, prints to the terminal) shows the current top candidates with best-skill installs, Jev's tech probability and domain, who would enter or leave the 30, GitHub followers (information only), and the refreshed skills.sh official list. It proposes changes; a human edits the YAML. The list is not auto-refreshed, because automatic refresh is how a gamed or off-topic account would get a shelf.
- **Read API:** `GET /api/market/creators` returns the 30 in order with skill count and total installs; `GET /api/market/creators/:slug` returns that creator's skills ranked by installs, grouped by repo, with topic labels. New files next to `api/market/shelves.ts`, with the same CDN caching.
- **Not deduped by name** on this shelf. Each creator's page shows their own skills.

### GUI behavior

- Discover gets a Creators tab: a grid of creator cards (label, Org/Person badge, optional Official badge, skill count, total installs), then a detail view with their skills grouped by repo, each with topic chips and the existing `+` install.
- Show where the number comes from ("installs, skills.sh") and never call a creator "verified".

## Better topic classification

### Diagnosis

1. Only 10% of rows are labeled, so most skills (and most of the Creators' skills) have no topic.
2. Labels are thrown away. Weekly cost and consistency are both poor, and there is nothing to evaluate.
3. The prompt forces 0 to 2 slugs from a fixed 21, and unlabeled rows fall into `integrations`.
4. Input is name plus a 500-character description. That is thin for ambiguous names (`teach`, `launch`, `research`).
5. A vendor suite is a **product**, not a topic. Azure is not backend, devops and security at once; it is one vendor with many skills.
6. The only test is 7 gold labels in `shelf-gold.fixture.ts`.

### The model: Jev (TypeSafe AI)

Jev is a **decision model**, not a chat model. You send it some text (the "state") and a list of typed questions, and it answers only from the options you define: pick one from a list (Choice), rate on a scale (Score), or give a yes/no probability. Each answer comes with probabilities. It cannot return a value that is not in the list you gave it. That is the property that fits this job: a topic label can never be an invented slug.

What I confirmed (from TypeSafe's public docs, news and pricing pages; the live test call result is recorded in "Jev test call" below):
- Released 2026-09-15. Price is **$0.042 per million input tokens, output free**.
- **It is already on your Vercel AI Gateway** as `typesafe-ai/jev`. I checked your gateway's model list. The gateway lists it as type `evaluation`, with a 32,000-token limit for the state plus the longest question and 64,000 tokens per request. Current model is Jev 1.13.0, with `jev-latest` as an alias.
- **Direct API** (TypeSafe docs): `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <key>`. The request has `state` (string, object or array), `model` (for example `jev-latest`), and `questions`, a map of named questions. Question types: `noul` (yes/no, returns a 0–1 probability), `choice` (up to 255 options, returns the option, per-option probabilities and a confidence), `score` (2–10 levels). All questions in one call are evaluated in parallel and independently. The response has `answers` and `usage` (input and output tokens). Errors: 401 bad key, 422 invalid body, 429 rate limit (back off), 529 overloaded (back off).
- **Batching is the intended use:** TypeSafe's own cookbook reports 13 questions in one call being about 12x cheaper and 10x faster than 13 separate calls. That fits asking one yes/no question per topic field in a single call per skill.
- Rate limits reported by a pricing page: 250,000 tokens per second and 1,200 requests per minute.
- Reported to be in limited early access, and one source says new signups were paused. Whether the **gateway** exposes it with the same request shape is part of the test call.

What Jev does **not** guarantee:
- **Repeat runs are very consistent but not promised to be identical.** TypeSafe's own test showed identical answers across repeats; a news report says there is no guarantee of the same answer or confidence on a later run.
- It can still pick the wrong option from the list. It cannot invent one.
- It gives no reasoning, so a wrong label cannot be explained.
- Performance claims are self-reported by TypeSafe, and there is no published architecture or paper.

So the thing that makes weekly results stable is not the model, it is **storing each label against the skill's content hash** (Stage 0). A skill keeps its label until its content changes or the topic list changes. The gold set (below) is what catches wrong-but-valid labels.

### Cost

| Job | Volume | Approximate cost |
|---|---|---|
| Label all 9,692 rows once with Jev | about 900 input tokens per skill including the 21 repeated questions, so about 8.7M tokens (measured in the test call) | roughly $0.37 |
| Tech gate on about 100 creators | about 100 calls | a fraction of a cent |
| Weekly delta (new or changed rows only) | a few hundred rows | cents |

At this price, cost stops being a factor. The real cost is engineering and checking quality.

### Proposed pipeline

**Stage 0. Persist labels and make them incremental.**
New table `market_skill_labels(skill_id, field_slug, probability, content_hash, taxonomy_version, model_version, labeled_at)`. A row needs relabeling only when its `hash` changed or `taxonomy_version` was bumped. Shelf building reads labels instead of calling the model. The existing fail-closed behavior stays: a failed run leaves last week's shelves untouched. Labels are saved batch by batch, so a run that fails halfway keeps its finished work and the next run resumes from where it stopped (see "Failure handling and alerts").

**Stage 1. Richer input at no extra request.**
`hydrateDetails` already calls `getSkill` for every new or changed skill. Capture a short excerpt of the `SKILL.md` body (first 800 to 1,000 characters, not stored beyond what classification needs, still not the full body) alongside the description. Unverified: confirm `getSkill` returns the body text. If it does not, fall back to name plus description plus repo path.

**Stage 2. Topic assignment with Jev.**
1. For each skill, send the state: name, owner/repo, description and the body excerpt.
2. Ask one yes/no question per field ("Is this skill mainly about frontend work?") in a single call, so every field gets a probability. This lets a skill belong to more than one topic. The test call (below) used yes/no questions and they worked; a `choice` question also worked for the creator domain. Keep yes/no for topics unless the gold set shows `choice` is better.
3. Keep a field when its probability is above a threshold (start around 0.6, tuned on the gold set), up to 3 fields per skill, and store the probability.
4. **No label is a valid answer.** If nothing clears the threshold, the skill is left unlabeled: it stays out of shelves and remains searchable. Stop routing unlabeled rows into `integrations`.
5. Low-confidence rows (best probability between roughly 0.4 and 0.6) are saved to a review list. There is no second model; a human looks at the list, and large clusters of low-confidence rows are a signal to adjust the field list (Stage 4).
6. **Jev only, no fallback model.** Keep the call behind the existing `SkillClassifier` interface because that is how the code is already tested with fakes, not to enable a fallback. The old `gpt-4o-mini` classifier is deleted once Jev beats its baseline on the gold set (roadmap task 12).

Embeddings are **not needed for topics anymore**. They are still useful for search and for overlap detection in Doctor, so they move to the optional part of the roadmap.

**Stage 3. Separate the vendor facet from topic.**
Derive `owner` and repo for free. Treat "ecosystem" (Azure, Lark, HeyGen) as a facet or a collapsed group, not a topic. On any shelf:
- **per-owner cap** (for example at most 5 rows from one owner per shelf), and
- **suite collapse**: rows from the same repo with a shared prefix (`azure-*`, `lark-*`) render as one card, "azure-skills, +14 more".

These two rules fix most of the visible pollution with no model at all, so they ship first.

**Stage 4. Taxonomy is data, not a guess.**
After the first full Jev run, look at the unlabeled and low-confidence rows. If many of them share a theme, that is a missing field. Fields with almost no skills (`roadmap`, `viz`, `competitive`) either merge into a neighbor or stay thin on purpose. Media and video generation looks like a large share of the high-install rows and may deserve its own field. Bump `taxonomy_version` when fields change so only affected rows are relabeled; because Jev is cheap, relabeling everything is also fine.

### Failure handling and alerts

Rule: **a failed run never changes what users see.** Failure means "stop, keep last week's shelves and the saved labels, and tell a human."

| Failure | Behavior |
|---|---|
| 429 or 529 (rate limit, overloaded), network drop, timeout | Retry with exponential backoff and jitter, up to 5 tries per batch. Respect the pace limits (batches sized well under the reported 1,200 requests per minute). |
| 401 (bad or missing key) | Do not retry. Fail immediately; this is a config problem. |
| 422 (invalid request) | Do not retry. Fail and log the first rejected payload (without secrets); it means the question or state format is wrong. |
| Malformed or incomplete answer (missing question, probability outside 0–1, unknown option) | Treat as a failure for that skill. Retry once; if still bad, skip that skill and count it. If more than 2% of the batch fails this way, fail the run. |
| Jev down for the whole run | After retries are exhausted, fail the run. No other model is used. |
| Any failure | Labels already saved for finished batches stay (they are keyed by content hash, so they are valid). Shelves are rebuilt **only** when every active skill has a current label or an explicit "none". Otherwise shelves are untouched. |

**Alerts:** the GitHub Actions job exits non-zero on failure, and a final `if: failure()` step posts to Slack using an incoming-webhook secret (`SLACK_WEBHOOK_URL`). The message includes the workflow run URL, which step failed, rows labeled vs. needed, the first error text (status code and short message, never the API key), and the age of the current shelves. A second, cheap check: if the shelves' `generated_at` is older than 10 days, the job also posts a "shelves are stale" warning, so a repeated silent failure still gets noticed. The existing workflow has no notification step today, so this is new work. Jev uses the same `AI_GATEWAY_API_KEY` already in your GitHub secrets, so no new model secret is needed unless the direct TypeSafe API is chosen instead of the gateway.

Exit codes and the failure summary are produced by the script (not by the workflow YAML) so the same behavior holds when you run `npm run sync-market` on a laptop.

### Search and indexing

Do the model-free search fixes first; add vectors only if they prove needed.

- **Now (no new extension):** rank by the existing `tsvector` relevance (`ts_rank_cd`) first, then use `log(installs)` as a mild boost and tie-breaker instead of sorting by installs alone.
- **Now:** a trigram index (`pg_trgm`, a standard Postgres extension) on `name` for short names and typos (`tdd`, `shadcn`).
- **Now:** search can also match on topic labels and owner once labels exist.
- **Later, optional:** `pgvector` embeddings for meaning-based search ("something to help me write tests"), a "similar skills" feature, and overlap detection for Doctor. Add it when keyword search visibly misses things, or when you build overlap detection.
- Indexes: GIN on `tsvector` (exists), btree on `owner`, partial index on `inactive = false`, btree on `(content_hash, taxonomy_version)` for the incremental queries.
- Keep a small `generated_at` on shelves and expose it.

### Evaluation (so changes are measurable)

- Grow the gold set from 7 to about 200 labeled skills, stratified across fields, vendor suites and ambiguous names. Draft the labels with a general-purpose LLM (not Jev, so the test is independent) and have a human review them.
- Report precision and recall per field and the share of rows left unlabeled.
- A classifier or taxonomy change ships only if it does not regress the gold set. This replaces judging by eyeballing shelves.
- Track `distinct skills per shelf slot` (today 426 of 550) and `share of any shelf taken by one owner` as shelf-health numbers. I did not compute the per-shelf owner share per shelf, only the overall shelf counts (for example `coreyhaines31` holds 77 of the 550 slots and `microsoft` 59).

### Shelf assembly changes

- Apply the owner cap and suite collapse before the shelf is cut to its size.
- Rank in a shelf by installs within label confidence, so a weak label does not outrank a strong one.
- Write shelves in one transaction so a mid-write failure cannot leave a partial shelf. Today the path is delete then insert.
- Keep `dedupByName` for shelf display only, not for classification and not for Creators.

### Jev test call (run 2026-10-04)

**Setup.** Called Jev through your Vercel AI Gateway with your existing `AI_GATEWAY_API_KEY`. Endpoint `POST https://ai-gateway.vercel.sh/v1/evaluate`, body `{ model: "typesafe-ai/jev", state, questions }`. Question types on the gateway are `boolean`, `choice` (criteria is an object of option → description) and `score`. The response has `answers`, `usage` (`inputTokens`, `outputTokens`) and `providerMetadata.gateway.cost`. This is not the same shape as TypeSafe's own API (`noul`, `/v1/systemone`), so code must use the gateway shape. No new secret or signup was needed. Gateway "evaluation fallbacks" exist as an opt-in feature; we do not enable them, per the no-fallback decision.

**What was tested (89 calls, about $0.0033 total, 79k input tokens):**
- 20 skills x 3 repeats, with 21 yes/no questions each (one per current field), state is name, owner/repo and description only (no body excerpt).
- 10 creators x 3 repeats, one yes/no "tech related" question plus one `choice` domain question, state is the creator's top 10 skills.

**Results:**

| Check | Result |
|---|---|
| Access and shape | Worked on the first call. Median latency about 330 ms per call. No errors in 89 calls. |
| Repeat consistency | 283 of 420 probabilities were identical across 3 repeats, the rest differed by at most 0.06. Labels did not flip across a 0.6 threshold in this sample. Consistent, but not identical, as expected. |
| Cost | About 900 input tokens per skill call, mostly the 21 repeated questions. Labeling all 9,692 skills once is about 8.7M tokens, roughly $0.37. A weekly delta costs cents. |
| Creator tech gate | Clear separation, stable across repeats (table below). |
| Topic quality | Good on clear skills, weak on abstract ones (details below). This is a first pass with no wording tuning. |

**Creator tech gate (tech probability, 3 repeats; domain chosen by Jev):**

| Creator | Tech probability | Domain | Outcome at the 0.4 cutoff |
|---|---|---|---|
| vercel-labs | 0.97 | software dev | pass |
| leonxlnx | 0.95 | design/UI | pass |
| emilkowalski | 0.92 | design/UI | pass |
| nextlevelbuilder | 0.85 | design/UI | pass |
| mattpocock | 0.81–0.83 | software dev | pass |
| heygen-com | 0.51–0.56 | media generation | pass (barely) |
| higgsfield-ai | 0.31–0.34 | media generation | fail |
| kepano | 0.25–0.29 | productivity/office | fail |
| lark | 0.11–0.12 | productivity/office | fail |
| coreyhaines31 | 0.03 | marketing/sales | fail |

This matches the earlier guesses. `lark` fails and is not pinned, so a 27M-install bundle does not take a Creators slot. The full run over the top 70 owners is in the Creators section.

**Topic labels on 20 skills (single pass, threshold 0.5):**
- Correct or reasonable: `tdd` testing 0.95; `code-review` review 0.87; `supabase-postgres-best-practices` database 0.99; `to-prd` prd 0.91; `customer-research` user-research 0.95; `competitor-alternatives` competitive 0.74; `vercel-react-best-practices` frontend 0.68; Azure and Lark skills fire `integrations` plus a job field (Azure compliance: security 0.92 and integrations 0.84), which fits the planned "vendor facet" idea.
- Misses and oddities: `frontend-design` scored design-system 0.81 and product-ui 0.67 but frontend only 0.32; `amazon-product-research` came out as user-research 0.58 instead of integrations; **`find-skills`, `grill-me`, `agent-browser`, `git-guardrails-claude-code` and `launch-strategy` got no label at all** (the `workflow` question did not fire on them, `grill-me` best was roadmap 0.43).
- Reading: Jev is confident and stable on concrete topics, and the weakness is **question wording and the field list**, not noise. Abstract fields like `workflow` need a much more concrete instruction (for example "Is this a skill that changes how a coding agent plans, asks questions, hands off or finds tools?") plus examples in the criteria. Adding the body excerpt (Stage 1) should help the short or vague descriptions. All of this is tuned against the gold set, not by eye.

**Decision for the build:** use Jev through the gateway `/v1/evaluate` endpoint for both the creator gate and the topics, use `boolean` questions, use a 0.4 creator cutoff and a starting 0.5 to 0.6 topic threshold, and rewrite the `workflow` and `integrations` questions before the first full run.

## Roadmap (small tasks, each testable)

| # | Task | Done when |
|---|---|---|
| 1 | Correct docs: `docs/design/market-index.md` and `sync-market.ts` header drop the merged multi-source and "20k" claims | Docs describe skills.sh-only and the real 9.7k |
| 2 | Verify crawl ends naturally (no page cap) and the install floor | One note recorded in the design doc |
| 3 | Jev test call through the gateway (**done 2026-10-04**: 89 calls, about $0.003) | Request shape, consistency and cost recorded in "Jev test call" above |
| 4 | Migration: generated `owner` column + index | Query by owner is indexed; existing tests pass |
| 5 | Failure handling in the sync script: retries, error classes, exit codes, failure summary; Slack `if: failure()` step in `sync-market.yml` and a stale-shelves warning | A forced failure (bad key, fake 529s) exits non-zero, leaves shelves untouched and posts to Slack |
| 6 | `data/market-creators.yaml` with pins and overrides, the 30-slot pins-first rule, and `--creators-report` (score, tech gate results, skills.sh official list) | Total is exactly 30; pins first; report is read-only and cached by owner + state hash |
| 7 | Tech-relevance gate with Jev on the top ~100 owners | Owners at or above 0.4 pass automatically; final 30 recorded in the YAML |
| 8 | Creators read API and Discover Creators tab | Cards and detail view render; `+` installs |
| 9 | Owner cap and suite collapse in `buildShelves` | Test with Azure and Lark fixtures; no owner over the cap |
| 10 | Gold set to about 200 plus per-field precision and recall report, run first against the **current** `gpt-4o-mini` classifier | Baseline numbers recorded before any model change |
| 11 | `JevSkillClassifier` behind the existing `SkillClassifier` seam, with fake-model unit tests | Passes the same unit tests as the current classifier |
| 12 | `market_skill_labels` table, incremental labeling by `hash` + `taxonomy_version`, per-batch saves and resume; label all active rows; unlabeled rows no longer go to `integrations`; delete the `gpt-4o-mini` classifier | Second run with no changes makes zero model calls; gold-set scores at least match task 10; every row has a label or an explicit "none" |
| 13 | Capture body excerpt in hydrate | Excerpt used as classifier input, bodies still not persisted |
| 14 | Search: relevance-first ranking with installs as a boost, plus trigram on name | Query tests: exact name, typo, concept query |
| 15 | Transactional shelf writes | Injected failure leaves old shelves intact |
| 16 | Taxonomy review from unlabeled and low-confidence rows; bump `taxonomy_version` | Fields reviewed against gold; changes logged |
| 17 | Optional: `pgvector` embeddings for semantic search, similar skills, overlap detection | Only after keyword search visibly misses things |

Tasks 1 to 3 are checks and the Jev test (3 is done). Tasks 4 to 9 are the Creators shelf and the safety net, and they ship the largest visible improvement first. Tasks 10 to 12 fix the classifier foundation and bring in Jev for topics. Tasks 13 to 17 are the upgrade.

## Testing approach

- **Unit tests with fakes, no network.** Jev is called behind the existing `SkillClassifier` seam, so tests use a fake that returns canned probabilities. Cases: threshold handling, up to 3 fields per skill, "no label" when nothing clears, malformed answers, 429/529 retry then success, 401 and 422 fail immediately, more than 2% bad answers fails the run.
- **Contract test for the gateway shape.** One small test checks request and response parsing against recorded real responses from the 2026-10-04 test call, so a change in the gateway format is caught early. It does not call the network in CI.
- **Store tests** with the in-memory market store: labels saved per batch, resume after a mid-run failure, unchanged skills cause zero model calls, shelves untouched when a run fails.
- **Shelf tests** with Azure and Lark fixtures: owner cap, suite collapse, no unlabeled skills on `integrations`.
- **Creators tests:** 30 slots exactly, pins first, blocked owners removed, aliases merged, official flag read from the saved list.
- **Gold set** (about 200 skills) is a script, not a unit test: it reports precision and recall per field and is run before any model, prompt or taxonomy change ships.
- **Dry run:** the sync script gets a `--dry-run` that does everything except writing labels or shelves, so a new question wording can be compared on real data first.

## Rollout order and rollback

1. Docs fixes and the failure-handling plus Slack step go first, because everything else depends on a safe failure mode.
2. Migrations are additive (`owner` column, `market_skill_labels` table). Nothing existing is dropped or renamed, so they can be applied before the code that uses them.
3. Creators ship before the new topics: they need only the `owner` column, the YAML and the read API.
4. Topics: run the gold-set baseline on the current classifier, then run Jev with `--dry-run`, compare, then label for real. Shelves switch to the new labels in one transaction only after every skill has a label or an explicit "none".
5. **Rollback:** shelves are only replaced on a fully successful run, so the old shelves are the rollback. If new labels look wrong, restore the previous shelves by re-running with the previous `taxonomy_version` (labels are versioned, not overwritten). The `gpt-4o-mini` classifier is deleted only after Jev matches or beats its gold-set baseline.

## Files expected to change (verify when building)

- `src/backend/`: `market-sync.ts`, `shelf-assembler.ts`, `skill-classifier.ts` (seam), a new Jev classifier next to `llm-skill-classifier.ts` (which is later deleted), `market-store.ts`, `supabase-market-store.ts`, `in-memory-market-store.ts`, `market-read.ts`, `market-types.ts`.
- `api/market/`: new creators endpoints beside `shelves.ts`.
- `supabase/migrations/`: two new files after `0005`.
- `data/market-creators.yaml` (new) and `scripts/sync-market.ts`.
- `.github/workflows/sync-market.yml`: failure Slack step.
- `gui/src/`: Discover Creators tab.
- Docs: `docs/design/market-index.md` (remove the merged multi-source and 20k claims, add Creators, labels and failure handling), `docs/requirements/prd.md` (Discover gains a Creators tab) and `docs/design/decisions.md`.

## Known gaps (not solved by this plan)

- **The listing crawl is still manual** (laptop `npm run sync-market`). The weekly GitHub job labels and rebuilds shelves but does not recrawl skills.sh, so new skills appear only after a manual crawl. The stale-shelves warning does not cover a stale listing. Adding a listing-age check or a scheduled crawl is a later decision.
- **Top and Trending are unchanged** and still reflect raw install counts, including the accounts with odd numbers.
- **The creator list is a snapshot.** A new strong creator appears only when someone edits the YAML after reading the report.

## Metrics

- Share of active rows with a topic (target: every row labeled or explicitly "none").
- Gold-set precision and recall per field, and model calls per weekly run.
- Share of any shelf taken by one owner, and distinct skills per shelf slot.
- Creators: how many `tech:` or `blocked` overrides humans have to make (a measure of how good the tech gate is).
- Run health: weekly job success rate, retries per run, and age of the current shelves. No user-behavior counters, by decision.

## Risks

- **Install-count gaming and bundle inflation** distort Top, Trending and any shelf order. Ranking by best skill and the tech gate only protect the Creators list. Top and Trending are left as they are for now (see open questions).
- **No follower gate means small accounts can enter** the Creators list if they are on topic and have high installs. The `blocked` list is the only remedy; the report shows followers so a human can notice.
- **Tech gate can be wrong** on borderline creators (design, workspace tools, AI media). The `tech:` and `blocked` overrides in the YAML handle those, and the cutoff is one number to change.
- **Official badge depends on a page scrape** of skills.sh's `/official` page, which has no documented criteria or API. Mitigated by caching the last good list and labeling the badge "Official on skills.sh".
- **Jev is new and is the only model.** It is a weeks-old model in early access, with self-reported performance and no published papers. It can pick a wrong option from the list, and repeat answers are very consistent but not guaranteed identical. There is no fallback model by decision, so an outage or withdrawn access stops the weekly job; the safety net is failure handling plus Slack alerts, stored labels keyed by content hash, and unchanged shelves. If this becomes a recurring problem, revisit the no-fallback decision.
- **Threshold tuning** can silently over- or under-label. The gold set is the guardrail.
- **Body excerpts** are third-party content. They are used only as classifier input, never executed, and not stored beyond what is needed. Creator bios and skill text sent to Jev are public GitHub and skills.sh content.
- **Provider dependency**: still one upstream (skills.sh). Mitigated by keeping the last-known-good index and shelves.

## Deferred, with a trigger to revisit

| Deferred | Revisit when |
|---|---|
| More sources (SkillsMP, AgenticSkills, others) | Users report "I can't find X" and X demonstrably exists elsewhere, or skills.sh becomes unreliable |
| Trust tiers, publisher claims, evidence tables, canonical identity and revision tables | You ship featured or "recommended" labels that need dated evidence, or you add an update-alert feature |
| Explainable multi-signal ranking | Shelves or search keep surfacing the wrong skills in ways the owner cap and suite collapse do not fix |
| Team catalogs and policy export | There is demand from teams; no work before that |
| Usage counters for search and creator clicks | Decided to skip; revisit only if you need evidence that Creators or search are used |
| A second model as fallback | Jev failures happen often enough that Slack alerts become noise |
| `pgvector` and embeddings | Keyword search visibly misses things, or you build overlap detection for Doctor |

## Decisions log

All questions from review are settled (2026-10-04):

| Topic | Decision |
|---|---|
| Sources | skills.sh only; no merged table, no other adapters |
| Model | Jev only, through the Vercel AI Gateway; no fallback model |
| Failure | Stop, keep last week's shelves and saved labels, post to Slack. You set up the webhook with the CLI (`SLACK_WEBHOOK_URL` repository secret) |
| Creators size | 30 slots: 2 pins plus 28 ranked |
| Pins | `addyosmani`, `antfu`; they bypass the tech gate. `lark` is not pinned |
| Ranking | Each creator's single most-installed skill; no follower gate; no bundle damping |
| Tech gate | Jev yes/no at 0.4 or higher passes; below 0.4 is rejected automatically; no review band |
| Small accounts | `lllllllama`, `uizze.com` and `browser-act` stay in |
| Cutoff side effect | `heygen-com`, `skills-101` and `juliusbrussee` are in; accepted |
| Official badge | "Official on skills.sh", from skills.sh's `/official` page, not our judgement |
| Top and Trending | Left alone |
| Counters | None |
| pgvector and embeddings | Later, only if needed |
| Slack | Webhook secret set later with the CLI; nothing needed now |
