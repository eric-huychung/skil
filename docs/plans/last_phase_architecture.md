# Last phase — architecture

Product: `docs/ideas/last-phase.md`. This is how it lands on the **current** tree. Do not edit `docs/design/architecture.md` from this file; fold in after it ships.

**Today:** `CollectionEngine` is the one deep module (`src/interfaces/engine.ts`). Scan / toggle / file / usage / originChecks already exist. Discover is a **separate** seam (`createDiscover` → `GET /api/market/shelves|search|preview` plus live Top/Trending). GUI main binds a folder via `createEngine(path)` and keeps recents in Electron `userData` (`recent-folders.json`). Shelf classify uses **our** Vercel AI Gateway key (`LlmSkillClassifier`) — never the user’s. No Settings, no `health()`, no `suggest()`.

**After:** same engine, two new methods. Same Discover HTTP. User LLM keys stay on the machine.

```
catalog + /build + usage + package.json + (optional) LLM
                         ↓
              engine.health() / engine.suggest(shelves)
                         ↓
     Commands strip · Discover Suggestion tab · skil doctor / suggest
```

## Constraints (don’t break)

- One deep module. Do **not** add HealthEngine / SuggestEngine.
- Market index stays out of the engine. `suggest` **takes shelves** from Discover (GUI already has `marketShelves()`; CLI already has `createDiscover`). No Supabase in Electron.
- User keys never go through AI Gateway, `web/`, or Vercel functions. `LlmSkillClassifier` stays the weekly classify job only.
- Keys never live in `.skil/state.json` (that file is the project map; it can be committed).
- `scan()` stays pull-only. Do not stuff findings into `ScanResult`.
- Scan / toggle / file / install never require a key.

## Seams

| Seam | Role | Tests |
|------|------|--------|
| `ICollectionEngine.health()` | Math + regex always. LLM conflict/vague only if an `LlmChat` is injected. Uses `usage()`, `readSkillMd`, `list()`, `rules()`, `originChecks` hashes. Persist nothing. | In-memory FS + fake usage + fake/no LLM |
| `ICollectionEngine.suggest(shelves)` | Fingerprint repo + catalog vs **caller-supplied** shelves → ~15–20 ids. LLM when `LlmChat` present; else `Err` `NEED_KEY` (GUI shows the empty state — engine does not invent a shelf list). | Fake shelves fixture + fake LLM |
| `LlmChat` | `complete({ system, user }) → Result<string>`. One OpenAI Chat Completions client. Three presets: Anthropic (`https://api.anthropic.com/v1/`), OpenAI (default), OpenRouter (`https://openrouter.ai/api/v1`). Hardcoded cheap model id per preset (swap later). | Fake `fetch`; recorded 200/401 |
| `LlmSettings` | Provider + secret. GUI: Electron `userData` + `safeStorage` (same place as recents, not plaintext JSON for the key). CLI: `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY`. `hasKey()` / `save` / `ping` (1-token call). | Parse + encrypt round-trip; ping 401 |

`createEngine` grows an optional `LlmChat` (default none), same pattern as `UsageCollector`. GUI `bindProject` rebuilds the engine with the current settings. Renderer never sees the raw key — IPC is `hasLlmKey`, `saveLlmSettings`, `pingLlm`, `health`, `suggest`.

## Doctor (`health()`)

Claude `/doctor` vibe: report, don’t rewrite.

**Always (no key):** idle description cost per command (filed skills’ YAML `description` chars); fat body (line/char cap on `SKILL.md`); `usage() = 0`; same-id hash split across `paths`; secrets/PII regex on bodies.

**If key:** LLM over **filed** skills on one command (descriptions + short body excerpts) → conflict pairs + vague triggers, one-line why each. No keyword-overlap fake.

**UI:** no Eval tab. Commands (`CollectionList`): health strip on each command (token-ish number + warn count). Click → findings list. Actions are existing `setSkillEnabled(false)` / `removeSkill` — confirm first. Skills/Rules: badge if that id is in a finding. CLI: `skil doctor`.

Unique object is **`commands[].skills`**, not a folder walk. Cursor/Codex get the same disk warns; usage stays Claude logs.

## Suggest (`suggest(shelves)`)

Fingerprint v1: `package.json` deps/devDeps + existing catalog ids (via `IFileSystemAdapter.readFile`). Rank shelf rows that match stack, minus already on. LLM reranks when key is set.

**UI:** third chip on Discover’s role tablist, next to Top / Trending (`MarketDiscover` `BROWSE_TABS`). Same rows + preview + per-row `+` (`bridge.install`). **No Add all.**

Empty states (GUI, not engine):

1. No bound folder (`getProjectRoot() === null`) → connect (Sync/pick).
2. Folder, `hasLlmKey() === false` → “No LLM key” + button to Settings.
3. Both → `shelves()` then `engine.suggest(shelves)`.

Run when that tab is selected, not on every Discover visit.

## BYOK

Settings = header gear (no Settings tab today). Fields: provider `anthropic | openai | openrouter`, API key, Save. Ping on save. No model picker in v1. No Ollama / base URL. No Hugging Face row (OpenRouter is the “everything else” slot). No auto-detect from `sk-` prefix.

## `SKILL.md` (last)

A skil skill that teaches: `scan`, `file` / `add`, `enable`/`disable`, `doctor`, `suggest`, `install`. Lives with the product (install into the live pair). MCP is not this phase.

## Order

1. Provenance is already shipped (`originHash` / Update / Reset). Don’t rebuild it.
2. Math+regex `health()` + `skil doctor` + Commands strip.
3. `LlmSettings` + Settings UI + ping.
4. LLM slice on `health()` (conflict/vague).
5. `suggest(shelves)` + Suggestion tab + empty states.
6. skil `SKILL.md`.

## Not doing

Auto-install / Add all. Public templates API. Folder linter as the product. Live Skill Lift. Bundled Ollama. Repo RAG. Team YAML. Login. Sending user keys through Vercel. Hugging Face / Vertex / Bedrock. Keyword-only conflict detection. New top-level Eval tab.

## Kill shots

Doctor that hides token counts until a key is set. Suggestion tab that is just Top installs. `suggest` that calls AI Gateway. Key in `state.json`. Splitting a second deep module.
