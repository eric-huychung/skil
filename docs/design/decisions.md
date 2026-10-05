# skil decision log

Why things are the way they are. Newest first. Specs live in `architecture.md` and `market-index.md`. The old dock-picker era is squashed at the bottom, it's history only.

## 2026-10

- **Security + live-site audit (10-05).** The static pages 404'd on the live site because Vercel wasn't serving `cli.html` at `/cli`, so `cleanUrls: true` went into `vercel.json`. Public search endpoints now cap `q` at 200 chars and cache for 60s so nobody can drain the skills.sh/Supabase budget. Patched dependencies (Next.js critical, Electron, axios, vitest 4). Git history and all branches were scanned for secrets and came back clean, so no history rewrite. The only audit findings left are the dev-only `shadcn` CLI chain.
- **Taxonomy: six new tech topics, narrower broad ones (10-05, owner call).** 21 → 27 fields, version `6df5d25974d4`. Added `mobile`, `languages`, `game-dev`, `docs` (role `swe`) and `ai-ml`, `agent-tooling` (role `agent`). `languages` means the language itself, `ai-ml` skips media generation and coding-agent prompts. `integrations` now means one named vendor or platform (it had matched 46% of the index), `workflow` lost skill-finding and browser driving, `frontend` is web only, `devops` names clouds and containers. Wordings were tested on subsets, then one full relabel (9,692 labeled, 0 errors). Unlabeled went from 24.7% to 27.0%: we picked accurate shelves over coverage. The old `ff85d19cf77d` labels are still stored, so reverting the questions restores the old shelves with no new calls.
- **Discover expansion (10-04).** skills.sh stays the only source and Jev (`typesafe-ai/jev` via the AI Gateway) is the only topic model, no fallback. Choices that differ from the original spec (`reports/Skill discovery expansion.md`, design in `reports/Skill discovery system design.md`):
  1. One label row per (skill, taxonomy version) holding every field's probability plus `ok`/`error`, not one row per field. That gives an explicit "none", retuning without calls, and one write per skill.
  2. Labels key on `state_hash` (the text Jev read), so a description change or excerpt backfill relabels.
  3. `taxonomy_version` is a hash of the questions, never hand-bumped.
  4. The excerpt (`label_excerpt`, 1,000 chars) is stored because the weekly job can't reach skills.sh.
  5. Creator detail is `creators?slug=`, not `/creators/:slug`: one function, one `vercel.json` entry.
  6. No Org/Person badge, and no GitHub data in the YAML or read path.
  7. `--creators-report` prints a paste-ready block instead of editing the YAML, so the YAML keeps its comments.
  8. Creators ships on both the GUI and Landing.
  9. Three migrations: `0006` owner, `0007` labels/shelf meta/creator checks, `0008` search (needs `pg_trgm`).
  10. The stale-shelves Slack warning stays, with its known gap (it can't fire if GitHub disables the schedule).

  The weekly job (still `--classify-only`) is seed → incremental labels → coverage-gated shelf rebuild. It exits 1 and posts to Slack on failure, and a failed run leaves the shelves alone. First run: 41.1% had no topic at a 0.6 threshold, so `TOPIC_THRESHOLD` went to 0.4 (26.2% unlabeled then). Probabilities are stored, so only shelves were rebuilt.

## 2026-08-29: live trees pivot

- **On/off is a path, not a dock picker.** Two constant live trees (`.agents`, `.claude`). A skill, command or rule is on, off, leftover or deprecated purely by where its folder sits (live pair, `.skil/parked/…`, a leftover root, `.skil/deprecated/…`). Added `setSkillEnabled`, `setCommandEnabled`, `setSharedRuleEnabled`, `leftovers`, `adoptLeftovers`. Removed `copyTo`, `copyAll`, `importFrom`, `exportCommand`, `exportAll`, `exportRules`, the dock argument on every write, and Inbox. A command is now a human-only skill folder in both trees (`disable-model-invocation: true` + `agents/openai.yaml`) with its own parked tree so `/build` can't collide with a parked skill called `build`. Shared rules collapse into `AGENTS.md` sections, glob rules stay on disk read-only.
- **Inbox is gone.** A catalog row is on or off from the moment it exists, so there's nothing to stage. Gone from the engine, `State`, CLI and IPC.
- **Discover is one nest on Landing and the GUI.** Live Top / Trending plus role → topic shelves. Empty or failed shelves fall back to Top. Browse results cache per session.
- **Cleanup after the pivot.** Deleted the dead dock-picker UI leftovers and inlined the one-use MarketSync factory. Sync errors no longer leak raw Supabase/network text over HTTP, only a fixed message.
- **Rules tab is a disk listing, not a second map.** `rules()` walks known paths and merges same-name copies. It isn't persisted. The watcher also covers root `AGENTS.md` / `CLAUDE.md`.

## 2026-08-26 to 08-28: market index and Discover

- **Market index** is its own track with its own store and sync loop, separate from the engine catalog (Supabase, RLS select-only for the public key, service role for writes). Search moved from `ilike` to a `tsvector` + GIN index, later to the trigram RPC.
- **Weekly refresh** started as a Vercel Cron route and moved to GitHub Actions because the full crawl timed out on Vercel (300s). The cron route and `CRON_SECRET` are gone.
- **Manual Update from market** uses `originHash` (sha256 of the copied SKILL.md). Unedited + market moved = Update. Edited = Reset in the preview. No auto-sync.
- **Market vs Project** grouping is by whether a skill has paths on disk, not by `source`, so a freshly installed market skill doesn't jump groups.
- Copilot would get a real command file and Codex stays skills-only (Codex dropped custom prompts, and they lived in the user's home anyway). Only matters as history now that commands are skill folders.

## Basics that haven't changed

- **Name:** the product is skil, groupings are called commands (ContextKit and "collections" were the old names). Repo `eric-huychung/skil`, state at `.skil/state.json`, bin `skil` with `contextkit` as an alias, API origin `SKIL_API_URL` then `CONTEXTKIT_API_URL` then `website.json`. A leftover `.contextkit/state.json` is an error, move it.
- **Engine class** stays `CollectionEngine` until a rename is worth doing. Names store without the `/`.
- **Skills search/browse** goes through our OIDC backend, no user API key. It's a proxy plus CDN, not a registry.
- **Project root** is adapter config (`createEngine(projectRoot)`), no `chdir`.
- **README** documents the real loop. The PRD and architecture are the spec.
- **No separate SkillScanner adapter.** `IFileSystemAdapter` grew instead, and two real FS adapters make the seam real.
- **Not this phase:** SQLite / eval library, stamps on `SKILL.md`, live 3-way merge.

## Old dock-picker era (08-22 to 08-27), superseded

Before the pivot, commands stored per-IDE membership and had stamped markdown files for each IDE. There was an Inbox staging pool, an IDE picker on Commands, `export`/`copy --to`, Import-from-project, and a "Save" push button (Re-scan was pull). The schema went through v3 → v6 along the way (the v6 loader still reads all of them). All of that is removed from the code. If you hit an old term (dock, Export, Inbox, membership), it belongs to this era.
