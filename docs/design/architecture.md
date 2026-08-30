# skil Architecture

## Overview

**skil** (one L) scans the messy world of skill/command/rule folders and keeps exactly two **live trees** in sync: `.agents` and `.claude`. On or off is a path, not a flag. There is no dock picker and no Export step.

It is a thin orchestration layer (CLI + GUI) over a **connected project folder**. No login. Work vs side project = two folders = two maps.

- **Skills** = folders that contain `SKILL.md`. Disk is the source of truth for the body. One catalog (`skills[]`), many `paths`.
- **Live trees** = `.agents/skills` + `.claude/skills` (and `.agents/commands`-equivalent, see Commands below). A constant, not a per-user picker. Toggle on writes both. Toggle off removes both.
- **Parked** = off-but-yours. `.skil/parked/skills/<id>`, `.skil/parked/commands/<name>`, `.skil/parked/rules/<id>`. Toggling back on restores from here (or re-fetches if it's a market skill and parked is gone).
- **Leftover** = every other skill root we still scan (`.cursor/skills`, `.codex/skills`, `.github/skills`, `.windsurf/skills`) plus stray always-on rule files. Catalogued, previewable, never written to. A leftover cleanup modal offers **adopt-and-deprecate**: copy into the live pair if missing, then move the old path to `.skil/deprecated/<original-path>`.
- **Deprecated** = a leftover tree we already retired via that modal. Recoverable (it's just a moved folder), never scanned.
- **Commands** = named SDLC knobs (`/build`, `/tdd`). **One list per project.** A live command is a human-only skill folder in both live trees (`disable-model-invocation: true`, plus `agents/openai.yaml`). Filing a skill onto a command edits that command skill's `## Skills` list — it does not install or enable the filed skill.
- **Rules** = shared law lives in one place: `AGENTS.md`. Toggling a shared rule upserts or removes a section there. `CLAUDE.md` is `@AGENTS.md` plus real Claude-only notes. Path-scoped glob rules (`.cursor/rules/*.mdc`, `.claude/rules`) are left alone on disk — never copied into `AGENTS.md`, never toggled.
- We **do not** scan or own the user's unstamped `commands/` files, and command markdown under a `commands/` tree is not a product path at all anymore (see Not Doing).
- We **do not** model runtime overlap (Cursor may also load `.agents`). Writes only ever go to the two live trees.

We are **not** SoT for skill or rule file contents.
We **are** SoT for: which skills/commands/rules exist in this project, their on/off state (inferred from path), and which skills sit on which command (**one list**).

**Scan** unions every root — live, leftover, and parked — into one catalog. It never writes leftover homes and never restores/creates a live or parked copy on its own. **Toggle** is the only write: on → live pair; off → parked. Market `+` / install already means "on," so it writes the live pair directly, once.

The class in the tree is still `CollectionEngine`. That is the deep module. This doc uses **Command** for the map grouping (today's `Collection`) and describes the implemented interface. Rename the class when it stops lying; do not split the module.

One `.skil/state.json`. No extra state file per tree.

## Technology Stack

### Core Stack: TypeScript + Node.js

**Runtime:** Node.js 20+  
**Language:** TypeScript (strict mode)  
**Testing:** Vitest  
**CLI:** Commander.js + chalk + cli-table3  
**HTTP:** axios  
**Subprocess:** execa  
**YAML:** js-yaml  
**GUI:** Electron (React)

### Why TypeScript

Vercel skills CLI, skillsmith, and `npx skills add` are npm/TypeScript. Electron shares the engine with the CLI. Users already have Node.

### Key Dependencies

```json
{
  "dependencies": {
    "commander": "^12.1.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.5",
    "js-yaml": "^4.1.0",
    "axios": "^1.7.9",
    "execa": "^9.5.2"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8",
    "memfs": "^4.14.0",
    "nock": "^13.5.6"
  }
}
```

## Design Principles

### Deep Modules

One deep module: the engine. Callers learn a small interface (scan, file, `setSkillEnabled`, `setCommandEnabled`, `setSharedRuleEnabled`, `leftovers`, `adoptLeftovers`, usage, readSkillMd, rules, readRule). The implementation hides catalog merge, hashing, gone-id cleanup, **one command list**, live/parked/leftover/deprecated path classification, human-only-skill command writes, **rule-file discovery**, and usage aggregation.

No caller ever passes a dock or a dest into any method — there is nowhere left to pick, since a write always means "the live pair" and toggling off always means "parked." `list()` returns `{ name, skills }` for the project map.

**Deletion test:** delete the engine and that complexity reappears in CLI and GUI. Keep it in one place.

Do **not** split into Scanner + Map + Deployer. Those would be three shallow modules that always update together. One adapter of each kind already exists (real vs in-memory FS; real vs in-memory skills). That is enough.

**Supporting adapters**
- `FileSystemAdapter`: JSON state, directory walk, file read/write. Local-substitutable (real + in-memory).
- `SkillsAdapter`: skills.sh via our backend, `npx skills add`. True-external (nock / in-memory).
- **UsageCollector** (Phase 5): `collect({ projectRoot, skillIds })`. In-memory in tests; Claude logs in prod. Two adapters = real seam. Not a second deep module.

### Testability

Accept dependencies, don't create them. Tests and callers cross the same seam.

**Primary seams:** engine public methods; adapter interfaces; CLI handlers; GUI via the bridge; DiskWatch debounce/mute.

**Not seams:** persist helpers, `createEngine` forwarding a path, one-line search/browse pass-throughs.

## Module Boundaries

### 1. Engine (Deep Module)

**Interface:**

No method takes a dock or dest. On/off is inferred from **which path** a skill/command/rule lives at, not a flag or a picker argument.

```typescript
type LeftoverKind = 'skill' | 'command' | 'rule'

interface SkilEngine {
  scan(): Result<ScanResult>                          // union live + leftover + parked into one catalog; never writes leftover homes
  skills(): SkillRecord[]                              // enabled = live path present
  create(name: string, skillIds?: string[]): Result<Command>
  delete(name: string): Result<void>                   // drops the command row + live/parked copies
  list(): Command[]                                    // one skills[] each
  file(skillId: string, commandName: string): Result<Command>       // write-through on a live command skill's `## Skills` only
  addSkill(name: string, skillId: string): Result<Command>
  removeSkill(name: string, skillId: string): Result<Command>
  deleteSkill(skillId: string): Result<void>            // hard delete: live + parked copies of that id, not leftover/deprecated
  readSkillMd(skillId: string): Result<string>          // first readable SKILL.md for that catalog id; missing → error
  setSkillEnabled(skillId: string, enabled: boolean): Promise<Result<SkillRecord>>
  setCommandEnabled(name: string, enabled: boolean): Promise<Result<Command>>
  setSharedRuleEnabled(id: string, enabled: boolean): Result<RuleRecord>
  leftovers(): Result<LeftoverRecord[]>                 // catalogued paths that are neither live nor parked nor deprecated
  adoptLeftovers(ids?: string[]): Promise<Result<AdoptResult>>  // copy into the live pair if missing, then move old path to .skil/deprecated/
  usage(): Promise<Result<UsageRow[]>>                  // Claude-first counts; missing logs → []
  lastWrittenPaths(): string[]
  originChecks(): Promise<Result<OriginCheck[]>>
  updateFromMarket(skillId: string, opts?: { replaceEdited?: boolean }): Promise<Result<SkillRecord>>
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  rules(): RuleRecord[]
  readRule(id: string): Result<string>
}
```

`Command` is `{ name, skills, createdAt }`. Persist v7 uses `commands[].skills` (see Data Model). Type name `IDE` is gone from the product surface; the only tree distinction left is **live** (`.agents` / `.claude`, a pair, not a picker) vs **leftover** (`.cursor`, `.codex`, `.github`, `.windsurf` — read/catalog only).

**Invariants**
- A skill is a folder that contains `SKILL.md` (nested folders ok).
- One `skills[]` catalog. **One command list** (not per tree). No Inbox — Market rows and Project rows are the same catalog, just on/off.
- **On/off is a path, not a flag.** Live path (`.agents/…` + `.claude/…` both present) → on. Only `.skil/parked/…` → off. A leftover-only path (`.cursor/skills/<id>`, etc.) is catalogued but neither on nor off — it is not live, and toggling never touches it.
- Scan never creates commands from skill folders, never moves folders, and never writes a leftover root. It also never restores parked → live or live → parked on its own; that is only `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled`.
- Scan roots = the live pair, every leftover skill root, and the parked skill/command roots. `.skil/deprecated/` is never scanned.
- **Rules.** Shared law is one or more sections in `AGENTS.md` (`CLAUDE.md` is `@AGENTS.md` plus real Claude-only notes below that line). Path-scoped glob rules (`.cursor/rules/*.mdc`, `.claude/rules/**/*.md`) stay on disk exactly as found — never folded into `AGENTS.md`, never toggled by `setSharedRuleEnabled`. `rules()` lists both kinds; only shared-law rows are togglable.
- `deleteSkill(id)` deletes the live pair and the parked copy of that catalog id, if either exists. Leftover and deprecated copies are untouched. Nested skills stay.
- Scan does not mint a second catalog id for an npx leftover short folder (`.agents/skills/<slug>`) when a `source: 'skills.sh'` row already owns that slug. Attach the leftover path to the market id.
- Filing / unfiling / create / delete change the **project** command list. There is no per-tree argument because there is no per-tree list.
- `create('build')` when `/build` already exists is "already exists".
- `delete('build')` drops the command row and, if the command was on, both its live command-skill folders and its parked copy.
- Filing (`file` / GUI `addSkill`) edits the target command skill's `## Skills` section (and frontmatter `skills:`) if that command is currently live. Filing does **not** call `setSkillEnabled` — a filed skill is not thereby turned on, and an off skill can be filed.
- `create('rules')` / any command named after a reserved word is not special-cased anymore — there is no Inbox to protect.
- Command names store without a leading slash. `create('/build', …)` normalizes to `build`. UI may show `/build`.
- Re-scan refreshes the catalog. Same hash at a new path is a rename (keep the id, update `paths`) — not gone + added. If every path for an id is gone, drop that id and report it.
- We never read **unstamped** `commands/` trees, and command markdown under any `commands/` directory is not a thing we write anymore — see "Live command = human-only skill" below.
- **Name collision is an error.** `setCommandEnabled('build', true)` refuses if a non-command skill already owns `.agents/skills/build` (or `.claude/skills/build`). No auto-prefix.

**Live command = human-only skill.** A live command is a skill folder in **both** live trees: `.agents/skills/<name>/SKILL.md` + `.claude/skills/<name>/SKILL.md`, frontmatter `disable-model-invocation: true`, plus `agents/openai.yaml` (`allow_implicit_invocation: false`) next to each. Body keeps today's Goal / Sequence / Rules headings and a managed `## Skills` list. This is why a command needs the same on/off + parked machinery as a normal skill (`setCommandEnabled` mirrors `setSkillEnabled`, in its own `.skil/parked/commands/<name>` tree so `/build` toggling off can never collide with a parked skill literally named `build`).

**Implementation responsibilities**
- Persist the catalog and **one** command list in `.skil/state.json`. Missing file → empty state. Leftover `.contextkit/state.json` with no `.skil/` file is an error (no fallback).
- Walk the live pair, every leftover skill root (`.cursor/skills`, `.codex/skills`, `.github/skills`, `.windsurf/skills`), and parked skill/command roots; hash `SKILL.md`; reconcile gone/changed/new/rename. A new short folder that matches `skillFolderName` of an existing `source: 'skills.sh'` row is attached to that row, not added.
- Walk rule files on `rules()` (not persisted): `AGENTS.md` sections (shared law) plus every leftover glob file (`.cursor/rules/**/*.mdc`, `.claude/rules/**/*.md`, `.github/instructions/**`, `.windsurf/rules/**`) and leftover always-on files (`copilot-instructions.md`, a `CLAUDE.md` that is not `@AGENTS.md`, invented `.codex/rules`). Cursor `.mdc` `alwaysApply` stays readable; glob rules are never rewritten by a toggle.
- `readSkillMd(id)` returns the first readable `SKILL.md` on that catalog row's `paths` (live first, then leftover, then parked). Disk owns the body; this is display-only.
- `setSkillEnabled(id, false)`: move the live folder(s) to `.skil/parked/skills/<id>`. `true`: copy parked back to both live trees; if parked is gone and `source` is `skills.sh`, re-fetch via `SkillsAdapter.install` into the pair instead of erroring; if parked is gone and `source` is `local`, error (nothing to restore from).
- Market `+` / install: one `npx skills add` into `.agents`, then `copyDir` into `.claude`. Never writes a leftover root. Stamps `originHash`. `originChecks` / `updateFromMarket` compare that to disk and the live market SKILL.md; Update is explicit, never automatic.
- `setCommandEnabled(name, false)`: move both `…/skills/<name>` folders to `.skil/parked/commands/<name>`. `true`: copy back, refusing on a name collision with a live non-command skill.
- `file` / `removeSkill` rewrite `## Skills` (and frontmatter `skills:`) on the command's live skill folders only, when that command is on. A parked command is not rewritten until it is toggled back on — the next `setCommandEnabled(name, true)` copies the parked (possibly stale) body back as-is; filing while parked queues no write.
- `setSharedRuleEnabled(id, true)` upserts one `AGENTS.md` section (stamped, matching today's `generated_by: skil` convention). `false` removes the section and parks the body under `.skil/parked/rules/<id>`.
- `leftovers()` returns every catalogued skill/command/rule path that is not live and not parked (and not deprecated, which is never scanned). `adoptLeftovers(ids)` copies each into the live pair if that id is missing there, then moves the old leftover path to `.skil/deprecated/<original-path>` — recoverable, never scanned again.
- `lastWrittenPaths()` is the mute list for DiskWatch after any write (`setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` / `adoptLeftovers` / market install).

**Why deep:** CLI, GUI, and tests all call the same six mutating methods (`setSkillEnabled`, `setCommandEnabled`, `setSharedRuleEnabled`, `file`/`addSkill`/`removeSkill`, `create`/`delete`, `adoptLeftovers`). Path classification (live / leftover / parked / deprecated), hash policy, and gone-id cleanup must not leak to the UI.

**Gone from the product surface.** `copyTo`, `copyAll`, `importFrom`, `install(skillId, dock)`, `exportCommand`, `exportAll`, `exportRules`, the `Dock`/`IDE` picker argument, `Inbox` (`inbox()` / `addToInbox` / `removeFromInbox`), and CLI `--to <dock>` / `copy` / `export`. There is one place a skill/command/rule can be: live, parked, leftover, or deprecated — not five dock copies to keep in sync by hand. Earlier leftover methods (`sync`, `convert`, `getCommand`, skillsmith `export`, Team YAML `ConfigAdapter`) were already gone before this pivot and stay gone.

### 2. FileSystemAdapter

**Interface:**

```typescript
interface FileSystemAdapter {
  readJSON<T>(path: string): Result<T>
  writeJSON<T>(path: string, data: T): Result<void>
  findSkillFolders(root: string): Result<string[]>  // dirs that contain SKILL.md; missing root → ok([])
  readFile(path: string): Result<string>
  writeFile(path: string, data: string): Result<void>
  copyDir(from: string, to: string): Result<void>
  listFiles(dir: string): Result<string[]>          // missing → ok([]); file-at-path → error
  listAllFiles(dir: string): Result<string[]>       // recursive; used by deleteSkill's SKILL.md sweep
  removeFile(path: string): Result<void>            // missing is ok
  removeDir(path: string): Result<void>             // used by deleteSkill's empty-parent pruning
}
```

**Why this seam:** real + in-memory already exist. Walking and hashing are local-substitutable. Do not add a SkillScanner adapter (one implementation would be a fake seam).

**Skill definition stays in the engine.** The adapter only answers "which folders under `root` contain a file named `SKILL.md`" and reads/writes bytes. Engine assigns ids, hashes, membership, and reconcile rules.

`findSkillFolders('.cursor/skills')` returns paths relative to the adapter root, nested, files ignored. A parent is a skill only if it has its own `SKILL.md`.

`writeFile` is for the command skill's `SKILL.md` / `openai.yaml` (and tests). `copyDir` copies a skill folder — live↔parked, or `.agents` → `.claude` on market install. `listFiles` is how scan and `leftovers()` walk a directory. `removeFile` / `removeDir` back park/deprecate moves and `deleteSkill`. Install of a remote id still goes through SkillsAdapter (`npx skills add`).

### 3. SkillsAdapter

**Interface:**

```typescript
interface SkillsAdapter {
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  install(skillId: string, opts?: { cwd?: string }): Promise<Result<void>>  // always the universal agent, into .agents
  getInstalled(): Skill[]                                         // leftover; real adapter returns []
}
```

- `search` / `browse`: our Vercel backend + OIDC. No user API key. Browse is CDN-cached (`Cache-Control` on 200 only). Not a skil registry. Origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.
- `install`: `npx skills add <source> --agent universal --copy -y` with `cwd` = project root. `universal` is vercel-labs/skills' documented agent that writes `.agents/skills/` — the only agent name this adapter ever passes, since the live pair's other member (`.claude`) is a plain `copyDir` the engine does after npx returns, not a second network install. 3-part skills.sh ids become `owner/repo@skill`. No `targetIDE` / dock argument — there is one live destination.
- Listing fields (`name`, `repo`, `installs`, …) stay in-memory. Never persist them on catalog records.

### 4. CLI (Thin)

Commander routes to the engine. No catalog logic here.

Verbs:
- `skil scan` — union live + leftover + parked into the catalog; never writes leftover homes
- `skil create <name> [--skills <ids>]` — empty or seeded command; `/build` stores `build`
- `skil delete <name>` — drop the command (and its live/parked folders)
- `skil list` — the project map
- `skil add <command> <skillId>` / `skil remove <command> <skillId>` — write-through `## Skills` on a live command only
- `skil enable <skillId>` / `skil disable <skillId>` — copy to the live pair, or park it
- `skil enable --command <name>` / `skil disable --command <name>` — same, for a command's own skill folders
- `skil rules` / `rules show <id>` / `rules enable <id>` / `rules disable <id>` — list on-disk rules (shared + glob), read a body, toggle a shared-law `AGENTS.md` section
- `skil leftovers` / `skil adopt [ids...]` — list leftover paths, then copy-into-live + move-to-deprecated
- `skil usage` — print use counts (Claude first)
- `skil search [query] [--trending]` — unchanged discover
- `skil install <skillId>` — market install straight to the live pair (no `--to`, there is nowhere else to put it)

No verb takes `--to <dock>`, `--from`, `copy`, or `export` — those are gone as a product surface (see Engine "Gone from the product surface").

Bin is `skil`. `contextkit` is an alias of the same entry. Help and product-loop errors say **command**, not collection. Engine method is `file` (was `fileToCollection`). `Collection` remains a type alias. GUI chrome says Commands. Window/title says skil. Renderer bridge is `window.skil`.

### 5. GUI (Thin)

Same engine. No business logic in React.

**Connect:** folder picker on Sync (`pickProjectFolder` = dialog + bind). No login. Discover, Skills, and Commands work with no folder. Scan needs a connected repo (or CLI cwd). Header shows the bound path and a Re-scan icon only after connect; with no folder the header is empty. Window title and brand say **skil**.

**Session bind (GUI main):** `projectRoot` is session-only. `pickProjectFolder` opens a dialog then `bindProjectFolder`. `bindProjectFolder(path)` is `createEngine(path)` + DiskWatch, no second dialog.

**Tabs:**
- **Skills** (was Inbox) — the whole catalog, grouped **Market** / **Project** by origin (not by "has a path" — after `+` everything is on disk either way). Toggle per row calls `setSkillEnabled`. Delete is preview-only and hard-deletes live + parked. No Scan control; it listens to `onScan`.
- **Commands** — one tab, **one list** (the project map). Create, file from Skills, remove skill, delete command, and a **toggle** per command (`setCommandEnabled`). No dock chips, no Export button, no per-dock command files.
- **Rules** — one tab. Shared-law rows (one `AGENTS.md` section each) get a toggle. Glob rows (`.cursor/rules/*.mdc`, etc.) are listed read-only — no toggle, no Export. Click a row to preview the body.
- **Discover** — live Top / Trending plus market index role → category, search, preview. `+` calls `setSkillEnabled(id, true)` directly — it is already an on decision, so it writes the live pair immediately instead of landing in a wishlist first.
- **Sync** — pick / change folder. A **Leftovers** card lists catalogued leftover paths (skill/command/rule) with one action, **Use ours and remove leftovers**, which calls `adoptLeftovers`. Re-scan is not on this card.

After pick, the GUI calls `scan()` once. Re-scan is the header icon next to the path (hidden until a folder is bound). Skills still shows gone ids and leftover-always-on-rule warns from the last scan (`role="status"`). Do not auto-create commands from skill folders.

**There is no push control.** Toggling a row **is** the write — on copies to the live pair, off parks it. There is no separate Export / Install / Copy button anywhere in the renderer, and no dock picker. `engine.copyTo` / `copyAll` / `importFrom` / `install(skillId, dock)` / `exportCommand` / `exportAll` / `exportRules` are gone (see Engine section) — the Electron bridge exposes `setSkillEnabled`, `setCommandEnabled`, `setSharedRuleEnabled`, `leftovers`, `adoptLeftovers` instead.

**Toggle (Skills / Commands / Rules):** flips one row. Loading / success / failure is inline on the row, not a modal — there is nothing left to configure (no dest, no replace flag) before the write happens. A market skill whose parked copy is gone re-fetches automatically on toggle-on; a local skill in the same spot surfaces an error instead (nothing to restore from). A command name colliding with an existing non-command skill surfaces that error inline on the toggle.

**Leftovers (Sync):** after scan, a card lists every leftover path grouped by kind. **Use ours and remove leftovers** is the only action — no per-path picker, no merge UI. It copies any id missing from the live pair, then moves the old path under `.skil/deprecated/`. Parked items never appear here.

**Watcher:** GUI main starts `DiskWatch` after folder pick — the live pair, every leftover skill root, parked skill/command roots, glob rule dirs (`.cursor/rules`, `.claude/rules`, `.github/instructions`, `.windsurf/rules`), and the project root (non-recursive) for `AGENTS.md` / `CLAUDE.md` / leftover always-on files. Debounce ~500ms, mute our writes ~1s, skip `.git` and `.skil/deprecated`. Flush calls `scan()` then mutes `lastWrittenPaths()`. Not a live 3-way merge. Not a CLI daemon.

### 6. Market Index sync (Discover backend)

**Status: Phases 1–4 shipped (sync core, persist + first fill, read API + UI, weekly cron).** Full spec: `tasks/plan.md`; task breakdown: `tasks/todo.md`.

Discover today calls `SkillsAdapter.search` / `.browse` live against skills.sh. The **market index** is a separate, precomputed alternative: a curated Supabase copy of skills.sh (~20k rows), nested **role → category (field) → top 30 skills by installs**, refreshed on a schedule instead of hit live. It is not the engine catalog (`skills[]` in `.skil/state.json`) — always say **market index**, never "engine." Roles and fields are **data rows**, not a hardcoded list of 20. **List** (shelf/search) is rank/name/installs (rank on shelves only). **Preview** is live GitHub + SKILL.md + audit — bodies stay off the DB. **Landing copies** `npx skills add`; **GUI `+` calls `setSkillEnabled(id, true)`** — live trees pivot, no Inbox step.

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

`InMemoryMarketStore` backs tests (`src/backend/in-memory-market-store.ts`). `SupabaseMarketStore` (`src/backend/supabase-market-store.ts`, Task 7, shipped) implements the same interface against four Supabase tables — see `tasks/plan.md` "Data" and `supabase/migrations/0001_market_index.sql`. `src/backend/market-seed.ts` holds the seed: 6 roles / 21 fields (Agent/Workflow + Other/Integrations added for classify; Data/SQL removed). New rows in `market_roles` / `market_fields` are picked up by `listActiveFields` with no code change. `q` is unused for shelves. `src/backend/parse-skill-description.ts` trims a SKILL.md's YAML `description` to ≤500 chars for the search field. Weekly shelf refresh (`createMarketSync` → `refreshActiveFields`) classifies the top 1000 by installs via Vercel AI Gateway (`openai/gpt-4o-mini`) — laptop `scripts/sync-market.ts` and `api/cron/sync-market.ts` share that factory.

`src/backend/market-skills-client.ts` (`RealMarketSkillsClient`, Task 8, shipped) is the real `MarketSkillsClient` against skills.sh's documented API (listing is page-based, not cursor-based — `listPage`'s cursor is the next page number as a string; `getSkill` parses `description` out of the returned `SKILL.md` file and falls back to hashing it locally when skills.sh's `hash` is `null`; `getAudit` reduces every partner's status to the worst of pass/warn/fail, or `none` on a 404 or empty list). Same OIDC-bearer-token pattern as `skills-proxy.ts`.

`scripts/sync-market.ts` (Task 8, shipped) is the first-fill/resumable runner: seeds roles/fields, then `syncListing` → paced `hydrateDetails` (batches of 8, ~1s apart, to stay under skills.sh's 600 req/min) → `refreshActiveFields`. Run with `npm run sync-market` after `.env` (Supabase) and `vercel env pull` (`VERCEL_OIDC_TOKEN` into `.env.local`) are set up. Re-running is safe: `syncListing` re-discovers every id whose `hash` is still `null`, so a killed run resumes on its own. Lives outside `src/` (its own `tsconfig.scripts.json`, run via `tsx` — not compiled into `dist/`) since it is a one-off operator script, not part of the CLI/GUI/Vercel-function build.

**Weekly Cron (Task 14, shipped):** `GET /api/cron/sync-market` (`api/cron/sync-market.ts`, same dist-import pattern). Vercel hits it Sunday 00:00 UTC (`vercel.json` `crons`, `0 0 * * 0`). Auth is `Authorization: Bearer $CRON_SECRET` — Vercel sends this when `CRON_SECRET` is in the project env; missing or wrong secret → 401 (fail closed, never calls skills.sh). Same `MarketSync` as the script, via `sync({ maxDetail: 40 })`: **refresh active field shelves + at most 40 SKILL.md hydrates**. No full listing crawl and no inactive reconcile — that 20k walk timed out at Vercel's 300s cap. Installs/inactive on unshelved rows lag until the next laptop `npm run sync-market`. Native OIDC (no `SKILLS_API_KEY`). `maxDuration` 300s. The weekly cron does **not** replace the laptop script.

**Read API (Tasks 9–11, shipped):** `src/backend/market-read.ts` holds three thin handlers, each a Vercel Function entry (`api/market/{shelves,search,preview}.ts`, same dist-import pattern as `api/skills/*.ts`).
- `handleShelvesRequest` — thin pass-through of `store.listShelves()`. Empty index → `{ data: [] }`, not an error. CDN `s-maxage=3600` (shelves only change on the weekly cron).
- `handleMarketSearchRequest` — `store.searchListings(q, { limit })` across the **full** stored index (not just shelved skills), same query for Landing and GUI. Missing `q` → 400. `limit` clamps 1–50, default 25. Rows are `{ id, name, installs }` — no rank (search has no rank concept), no description/hash. Backed by a generated `tsvector` column + GIN index (`supabase/migrations/0003_market_search_index.sql`) — `ilike` can't use an index at ~20k rows (see `.agents/skills/supabase-postgres-best-practices/references/advanced-full-text-search.md`). `InMemoryMarketStore` mirrors the same "every word must match" semantics with a plain substring check, not real tsvector.
- `handleMarketPreviewRequest` — combines stored listing fields (`store.getListing`: installs/url/installUrl) with two **live** skills.sh calls (`client.getSkillMd`, `client.getAudit`) — SKILL.md bodies and audit status are never persisted, so preview always re-fetches them. Unknown id → 404. A failed live fetch degrades to `skillMd: null` / `audit.status: 'none'` rather than failing the whole preview. `installCommand` reuses `toSkillsAddSource` (`src/backend/skills-add-source.ts`, extracted out of `SkillsAdapter.install` so both the real installer and this display-only string agree on the `owner/repo@skill` form for 3-part ids). CDN `s-maxage=300` — shorter than shelves since audits can change independently of the weekly sync.

**Why separate from the engine:** the market index has its own store (Supabase, not `.skil/state.json`), its own sync loop (script + weekly cron, not scan), and no per-tree membership concept. It only feeds Discover's read path; it does not touch `SkillsAdapter` or the catalog.

**Landing (Task 12, shipped):** `web/lib/market-api.ts` (same-origin `fetch` for `/api/market/*` and live `/api/skills?view=` — `web/` is a static export on the same Vercel project as `api/`, no OIDC, no `src/` dependency) and `web/components/landing/discover.tsx` (Top / Trending, then role chips → category chips → 30-row list; a search box overrides the nest with the full-index search; row click opens a preview dialog with the live SKILL.md excerpt, audit badge, and a copy-to-clipboard `npx skills add` button). Empty or failed shelves keep the section and default to Top. Browse results are cached in-session (one fetch per view).

**GUI Discover (Task 13, shipped; `+` behavior updated by the live-trees pivot):** Three bridge methods (`marketShelves` / `marketSearch` / `marketPreview`) proxy the same read API through the **main process** via `axios` — not `fetch` in the renderer, for the same CORS reason `SkillsAdapter.search`/`.browse` already go through IPC. `MarketDiscover.tsx` is the same nest as Landing (Top / Trending + role → category), with a **+** button per row that calls `setSkillEnabled(id, true)` — on immediately, live pair written, no staging step. Empty or failed shelves stay on this nest and default to Top — there is no second Discover component. A market search or browse error surfaces inline (`role="alert"`). Browse results are cached in-session. Selecting Top / Trending swaps the row list to the live skills.sh result and hides the category row.

**GUI Skills-tab preview:** Clicking a row opens the same `SkillPreviewDialog` Discover uses. Catalog rows (any `paths`) read `engine.readSkillMd` — first readable `SKILL.md`, plus the path list so live/leftover/parked copies are all visible. Discover-only ids (not yet in the catalog) call `marketPreview` (live SKILL.md + audit + copy `npx skills add`). Delete stays on the trash control (`stopPropagation`), preview-only, and hard-deletes live + parked copies of that **catalog id** (folder path under the skills root, e.g. `.agents/skills/tdd` and `.claude/skills/tdd` are one id `tdd`), not every similarly named folder or any leftover copy. Reset/Update confirm is portaled to `document.body` above the preview (`modal-backdrop` z-index 60, preview 50). Project rows with a market origin show a Synced / Edited / New copy badge (text + color, matching Discover audit colors). `updateFromMarket` downloads the market copy first, then swaps both live folders, so a scan cannot treat the id as gone mid-reset.

The migration is written but **a human still applies it** in the Supabase dashboard/CLI before the first `npm run sync-market` run — same as `tasks/plan.md` specifies for Task 7 (and 0003 for Task 10's search index). Until that first run, both Landing and GUI Discover show Top / Trending with no role tabs. After first fill, the weekly cron refreshes shelves and hydrates at most 40 details; it does not re-crawl the full listing.

## User Flow

1. **Connect a repo (optional).** No login. Skip and still use Discover / Skills / Commands; first toggle can pick a folder and bind it. Work vs side project = another folder = another map.
2. **Scan** unions the live pair, every leftover root (`.cursor`, `.codex`, `.github`, leftover `.windsurf`), and parked folders into one catalog. Never writes leftover homes.
3. **Inventory.** Every row is on (live pair present) or off (parked) from the moment it exists. Skills tab groups Market (`source: 'skills.sh'`) vs Project (`source: 'local'`) — a display filter, not a queue. Click a row to read `SKILL.md`.
4. **Organize once.** Create `/build`, file `tdd` onto it. That is the project list — `## Skills` on the live command skill, if `/build` is on.
5. **Toggle on** a skill or command: writes both `.agents/…` and `.claude/…` right away. Same folders every time, no dest to pick.
6. **Discover → `+`** turns a market skill on directly (one npx into `.agents`, then `copyDir` into `.claude`). No separate install step.
7. **Toggle off**: moves both live folders to `.skil/parked/…`. Row stays, still visible, just off.
8. **Leftover cleanup** (Sync): **Use ours and remove leftovers** copies any leftover id missing from the live pair, then moves the old leftover path to `.skil/deprecated/`. Parked items never show up here.
9. **Re-scan / watcher** = refresh catalog only. The live pair is always the map; there is no separate stamp to warn about anymore. Rules tab re-reads disk (`AGENTS.md` sections plus leftover glob files).
10. **Usage:** `skil usage` / GUI counts from Claude logs (Cursor hook optional). Copilot = no counts.
11. **Rules:** shared law (`AGENTS.md` sections) toggles on/off like a skill. Glob rules (`.cursor/rules/*.mdc`, etc.) are listed, previewed, left alone on disk.

## Data Model

### Catalog and map (`state.json`)

Schema **v7** (live-trees pivot). Load v6 `skills[]` as-is, drop `inbox` / `installedSkills` on the next persist (no separate migration step — those fields are simply not written back).

```typescript
interface State {
  version: string              // "7.0"
  commands: CommandRecord[]    // one skills[] per command
  skills: SkillRecord[]        // one catalog — we are SoT
}

interface CommandRecord {
  name: string                 // "build" — display as /build
  skills: string[]             // project SoT
  createdAt: string
}

/** View DTO from list() — same shape as persist for skills. */
interface Command {
  name: string
  skills: string[]
  createdAt: string
}

interface UsageRow {
  skillId: string
  count: number
}

/** View DTO from rules() — disk walk, not persisted. */
interface RuleRecord {
  id: string                   // "pair-programming/behavior" for a shared section; a relative path for a glob file
  name: string
  kind: 'shared' | 'glob'      // shared → one AGENTS.md section, togglable. glob → left on disk, read-only
  path: string                 // AGENTS.md for shared; the .mdc/.md path for glob
  enabled?: boolean            // shared only
}

interface SkillRecord {
  id: string                   // path relative to the skills root ("tdd", "ui/styling")
  hash: string                 // sha256 of SKILL.md (utf-8)
  paths: string[]              // every folder currently seen for this id (live + leftover + parked)
  source: 'local' | 'skills.sh'  // origin: scan vs install. Market/Project grouping in the UI is this field, not path count.
  originHash?: string            // SKILL.md hash at market copy-time. Scan does not overwrite.
}

interface LeftoverRecord {
  kind: 'skill' | 'command' | 'rule'
  id: string
  path: string                 // relative to project root, e.g. ".cursor/skills/tdd"
}

interface AdoptResult {
  adopted: string[]            // ids copied into the live pair because they were missing there
  deprecated: string[]         // old leftover paths moved under .skil/deprecated/
}

interface ScanResult {
  added: string[]
  gone: string[]
  changed: string[]            // path still there, hash updated
  alwaysOnWarnings: string[]   // leftover always-on rule files that fight AGENTS.md (warn only)
}
```

**Id rule:** id = path relative to the skills root. A live/leftover/parked copy of the same id is one catalog row with multiple `paths`. Nested `build/tdd/SKILL.md` → id `build/tdd`. If a slug exists only as a leaf, id is `tdd`.

**On/off, computed, not stored:** a `SkillRecord`/`CommandRecord` is **on** when `.agents/skills/<id>` and `.claude/skills/<id>` both exist; **off** when only `.skil/parked/…/<id>` exists; **leftover** when it exists only under a leftover root. `enabled` is never persisted as its own field — the path list is the only source of truth, which is also why a stray manual edit to one tree and not the other is directly visible (both paths present but with different hashes) instead of hidden behind a boolean.

**Load:** v7 as-is. v6 `skills[]` loads as-is; `inbox` / `installedSkills` are read (for the migration window) but not written back. v5 `commands[].membership` → union (first key, then remaining, unique). v4 `commands[].skills` → that array. v3 `collections` → `commands` first, then the same. Missing `skills` → `[]`.

**Hash:** `SKILL.md` only, not the whole folder. Disk stays SoT for the body; we store the hash so rescan can report `changed` and so `originChecks` can compare against a market copy.

### Live command skill (write)

A command's on-disk form is two skill folders, same shape as any human-only skill, always the live pair — never a picker, never a per-dock filename table:

| Tree | Skill folder | Extra file |
|------|--------------|------------|
| `.agents` | `.agents/skills/<name>/SKILL.md` | `.agents/skills/<name>/agents/openai.yaml` |
| `.claude` | `.claude/skills/<name>/SKILL.md` | `.claude/skills/<name>/agents/openai.yaml` |

Off → both move to `.skil/parked/commands/<name>/`. There is no third location and no dock-specific extension (no `.prompt.md`, no `workflows/`) — a command is a skill, full stop.

`SKILL.md`:

```markdown
---
name: /build
skills:
  - tdd
  - design
disable-model-invocation: true
generated_by: skil
generated_at: 2026-08-22T23:00:00.000Z
---

## Goal
<!-- Describe what this command is for. -->

## Sequence
<!-- Ordered must-follow steps. Skills below are extras, not extra phases. -->

## Rules
<!-- Constraints the agent must not break. -->

## Skills
When they apply, read and follow:
- `tdd`
- `design`
```

`agents/openai.yaml`:

```yaml
allow_implicit_invocation: false
```

`disable-model-invocation: true` + `allow_implicit_invocation: false` are what make this a **human-only** skill: an agent only runs it when the human types `/build`, never by its own judgment the way it would pick up a normal skill. Stamp = `generated_by: skil` in frontmatter — this is how `setCommandEnabled` recognizes its own folder on a name collision check. `file` / `removeSkill` rewrite frontmatter `skills:` and `## Skills` on the live pair only; a parked command is not rewritten until toggled back on. Goal / Sequence / Rules (everything above `## Skills`) stay as the user edited them.

### Listing `Skill` (Discover)

Unchanged: skills.sh listing DTO. In-memory only. Not a catalog row until they Add (inbox) and later install (disk + `SkillRecord`).

## Key Technical Decisions

### Split SoT (catalog vs disk vs map)

**Decision:** Disk owns skill bodies. skil owns the catalog, hashes, **one command list per project**, and which path each id currently lives at. There is no projection step (no stamped file to write on export) — the live copy is not a generated artifact of some other source of truth, it just *is* the on state.

**Rationale:** Users already edit `SKILL.md` in the repo. The map is "what is on `/build` in this project" and "what is currently on." Work vs personal is another folder.

### Scan is pull; on/off is push, not a picker

**Decision:** `scan()` never upserts a command from skill folders, never creates a live/parked copy, and never touches a leftover root. It only unions what is already there into one catalog. The only writes are `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` (single-target, no dest argument) and `adoptLeftovers`.

**Rationale:** Commands are SDLC knobs the user creates. A picker/dest argument on every write was how the old model grew five copies to keep in sync by hand; a fixed live pair removes the argument entirely.

### One catalog, one command list, two live trees (not five docks)

**Decision:** `.skil/state.json` is the only map. Catalog + `commands[].skills` are project-global. Commands tab is **one list**. `.agents` and `.claude` are the only write targets, always together. No per-tree `state.json`. No IDE cards, no dock chips.

**Rejected:** per-dock membership (v5, Phase 13). **Rejected:** four IDE tabs. **Rejected:** a dock picker on install/export (v6, Phase 5). **Rejected:** treating `.agents` as a fourth product with its own `/build`.

**If `.agents/skills/build` and `.claude/skills/build` disagree on disk** (a manual edit to one, not the other): both still show as "on" (paths present), but the hash mismatch is visible on the row. The next `setCommandEnabled(name, true)` — or any `file`/`removeSkill` write-through — re-syncs both from the map. There is no separate "warn, do not touch" state for this case the way stamp-vs-map used to work, because there is no longer a second party's file to defer to; both trees are ours.

**Rationale:** Filing once per project matches how people work (same skills on every agent in this repo). This **reverses** both the 2026-08-24 per-IDE membership decision (Phase 13) and the 2026-08-27 dock-picker-on-push decision (Phase 5) — the second reversal in a year is the signal that "which dock(s)" should never have been a per-call argument at all; it is now a constant.

### Toggle is the write; no separate write-through step to defer

**Decision:** `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` are the only writes to a live tree, and they happen the moment the user flips the toggle — not on a later explicit push. `file` / `removeSkill` still write-through a live command's `## Skills`, but only because that command is already on; they never turn a command on by themselves.

**Rationale:** The old model needed "write-through refreshes existing stamps only, first landing on a dock is explicit export" because export was a separate, deferrable step from filing. With no dock picker and no projection, there is nothing left to defer — on means live, right now.

### There is no Inbox; Market vs Project is a filter, not a queue

**Decision:** Every catalog row is either on or off from the moment it exists — a Discover `+` writes the live pair immediately (`setSkillEnabled(id, true)`), it does not sit in a wishlist first. The Skills tab still splits **Market** (`source: 'skills.sh'`) vs **Project** (`source: 'local'`) so people can tell "something I added" from "something already in the repo," but that is a display filter over one catalog, not a second list, and it is not affected by on/off.

**Rationale:** The old Inbox existed to let a Discover add sit un-filed and un-installed. Since `+` now means "on" directly, there is nothing left to stage. `originHash` plus a manual Update (unedited) / Reset (edited) is still how a later market change is noticed without auto-overwriting disk — that part is unchanged.

### We do not touch leftover trees except through `adoptLeftovers`

**Decision:** Leftover command/prompt files (`.cursor/commands/*.md`, `.windsurf/workflows/*.md`, any other dock's unstamped `commands/`) and leftover skill folders are catalogued and previewable, never parsed as input to the map, and never overwritten. The only thing that ever moves a leftover path is the user clicking **Use ours and remove leftovers**, which calls `adoptLeftovers`.

**Rationale:** Those files are the user's workflow text or a stray tool's skill dump. Owning them by default makes skil a competing command manager; a one-button, explicit, always-reversible (`.skil/deprecated/`) cleanup is the middle ground.

### Market install is one write, straight to the pair

**Decision:** `SkillsAdapter.install` always installs to `.agents` (the `universal` vercel agent) via one `npx`, then the engine `copyDir`s into `.claude`. No dock argument anywhere in that path — a market skill lands in exactly the two places any skill lives.

**Rationale:** The catalog was already dock-agnostic; the old code still made every install call thread a dock through three layers (CLI/GUI → engine → adapter) for a decision ("which dock") that no longer exists. `deployedTo` is gone — `paths` already says where a skill physically is.

### Watcher is scan, not live merge

**Decision:** Watch the live pair, every leftover skill root, parked skill/command roots, glob rule dirs, and root always-on rule files (`AGENTS.md`, `CLAUDE.md`, leftover `copilot-instructions.md`). Debounce ~500ms. Mute paths we just wrote for ~1s. Skip `.git` and `.skil/deprecated`. Then `scan()` (catalog refresh only — it does not write-through anything, because there is no stamp left to refresh outside of a toggle). After a successful scan, GUI main notifies the window so lists refresh. Explicit Re-scan remains in the header.

**Rationale:** Explicit Re-scan is too easy to skip. A 3-way merge of map + disk + body edits is still out.

### Thin usage eval (no SQLite)

**Decision:** `UsageCollector` seam. `engine.usage()` returns counts. Claude session logs first. Cursor hook only if small. Copilot/Codex counts later. No "used properly" judge.

**Rationale:** Unused vs used is the product question. Skillsight/SkillKit already do dashboards; we show counts on the map we already have.

### Project-local, no login

**Decision:** One connected folder (CLI = cwd, GUI = picker + `createEngine(root)`). No account. No last-folder file this phase.

### Cross-project import is dropped, not redesigned

Sync's old cross-project **Import** (`importFrom(sourceRoot, dock)`) depended on picking a dest dock, which no longer exists as a concept. It is removed rather than reshaped into "import into the live pair" — nobody asked for that narrower version, and reintroducing a folder-to-folder copy is a new feature, not a doc fix. Revisit only if a real request shows up; until then, copying a folder by hand covers it.

Earlier leftover methods (CLI `convert` / `sync` / `run`; engine `sync`, `convert`, `getCommand`, skillsmith `export`; Team YAML `ConfigAdapter`) were already gone before this pivot and stay gone.

## Test Strategy

**Unit (70%)** — engine: scan unions live/leftover/parked without writing leftover, one-list file/create/delete, `setSkillEnabled` off→park→on→restore and market re-fetch, `setCommandEnabled` off→park→on→restore and name-collision error, `setSharedRuleEnabled` upsert/remove on `AGENTS.md`, `leftovers`/`adoptLeftovers` (adopt missing + move to deprecated, parked never touched), gone ids, usage counts. Adapters mocked.

**Integration (20%)** — CLI with in-memory engine; temp-dir FS for walk + hash + park/deprecate moves; DiskWatch debounce/mute with fake clock.

**E2E (10%)** — GUI with real engine, fake adapters: connect → scan → toggle a skill on → both live folders exist → toggle off → parked, row stays → adopt a leftover → old path gone, new path under `.skil/deprecated/`.

**Agreed seams**
1. Engine: `scan`, `list()`, `file` / `create` / `delete`, `deleteSkill`, `readSkillMd`, `setSkillEnabled`, `setCommandEnabled`, `setSharedRuleEnabled`, `leftovers`, `adoptLeftovers`, `usage`, `originChecks`, `updateFromMarket`, `rules`, `readRule`
2. `IFileSystemAdapter.findSkillFolders` / `readFile` / `writeFile` / `copyDir` / `removeDir`
3. `ISkillsAdapter.install(skillId)` (no dock arg) / `skillHash(id)`
4. `UsageCollector.collect`
5. CLI `scan` / `list` / `enable` / `disable` / `leftovers` / `adopt` / `usage` / `rules`
6. GUI via the bridge (one Skills list, one Commands list, toggle per row, counts)
7. DiskWatch: debounce, mute, skip `.git` and `.skil/deprecated`

**Not seams:** concatenating `.cursor/skills` in a standalone test if `findSkillFolders` already takes that root; `createEngine` wiring; JSONL field names inside the Claude parser.

## Architecture Diagram

See `docs/design/architecture-diagram.html` (modules + seams) and `docs/design/per-ide-membership.html` (one catalog, per-IDE lists, watcher).

## Implementation Notes

### Dependency Injection

```typescript
class CollectionEngine {
  constructor(
    private fs: FileSystemAdapter,
    private skills: SkillsAdapter,
    private usage?: UsageCollector,
    private projectRoot?: string
  ) {}
}
```

Production wiring: `createEngine(projectRoot = process.cwd())` wires a real `ClaudeUsageCollector` and passes `projectRoot` through. Watcher lives in GUI main (and a small `DiskWatch` helper). It is not an engine constructor arg this phase.

### Errors

`Result<T>` for expected failure. Persist failure rolls back in-memory state. Conflict failures also carry `code` + `labels` (name collision on `setCommandEnabled`, market re-fetch failure on `setSkillEnabled`) so GUI does not parse `Error.message`.

### State

Atomic JSON write. Schema version on every persist. v6 → v7 on load (drop `inbox` / `installedSkills`, no rewrite until the next mutation).

## Open Questions

1. One skill on many commands — the map allows it (`addSkill` / a second file). GUI files from the Skills tab only.
2. npm package name is `skil`. Bins are `skil` and `contextkit` (alias). Publish to npm as `skil` when ready.
3. After a command is re-enabled from parked, do we preserve edits made to the live copy right before it was toggled off? v1: no extra diff, parked is just the last live snapshot at toggle-off time, so nothing is lost — but there is no merge if the parked copy itself goes stale relative to the map while off. Revisit if that turns out to matter in practice.
4. Team YAML sync — deleted with leftover `sync` / `ConfigAdapter`. Do not design `.skil.yml` this phase.
5. Cross-project import (see "Cross-project import is dropped, not redesigned") — revisit only on a real request.

## Decision Log

- **Live trees: on/off is a path, not a dock picker (2026-08-29, pivot, see `tasks/plan.md`):** Replaced the dock-picker + Export model with two constant live trees (`.agents`, `.claude`) and on/off inferred from where a skill/command/rule folder physically sits — live pair, `.skil/parked/…` (off), a leftover root (catalogued, untouched), or `.skil/deprecated/…` (retired leftover, unscanned). New engine surface: `setSkillEnabled`, `setCommandEnabled`, `setSharedRuleEnabled`, `leftovers`, `adoptLeftovers`. Removed: `copyTo`, `copyAll`, `importFrom`, `install(skillId, dock)`, `exportCommand`, `exportAll`, `exportRules`, the `Dock`/`IDE` argument on every mutating call, and Inbox (`inbox()` / `addToInbox` / `removeFromInbox`) — a catalog row is on or off from the moment it exists, so there is nothing left to stage. A command becomes a human-only skill folder in both live trees (`disable-model-invocation: true` + `agents/openai.yaml`) instead of a stamped dock-specific markdown file, with its own parked tree (`.skil/parked/commands/`) so `/build` can never collide with a parked skill literally named `build`. Shared rules collapse into `AGENTS.md` sections (toggle = upsert/remove); path-scoped glob rules (`.cursor/rules/*.mdc`, etc.) are left on disk, read-only, never folded in. This is Phase 1 (docs) of `tasks/plan.md`; Phases 2–3 (`tasks/todo.md` Tasks 3–14) implement it — until those land, the code still has the old dock-picker surface described in earlier Decision Log entries below.
- **Discover is one nest on Landing and GUI (2026-08-29):** Deleted `SkillSearch.tsx` (the empty-index live-browse fallback). Landing and GUI both show live Top / Trending plus role → category shelves. Empty or failed shelves stay on that nest and default to Top. Browse results cache in-session (one fetch per view). `SkillsAdapter.browse` no longer sends a dummy `limit` query param. Historical entries below still mention `SkillSearch` as what shipped then.
- **Watcher covers root always-on rule files (2026-08-28):** Rule dirs were already in `WATCH_ROOTS`. `CLAUDE.md` / `AGENTS.md` live at the project root, and `copilot-instructions.md` lives in `.github/`, so folder watches missed them. GUI main now watches those parent dirs non-recursive (filter by filename) using `ROOT_RULE_FILES` — same list `rules()` walks. Creating or editing a root file refreshes the Rules tab without a header Re-scan. Still not a live 3-way merge.
- **Rules tab is a disk listing, not a second map (2026-08-28):** Commands are skil-owned (`commands[].skills`). Rules already live on disk in each dock's format. `rules()` walks known paths and collapses same-name dock copies into one card. Not persisted. Not Inbox. Always-apply writes every copy. Export uses `RULE_LAYOUT`: folder docks get stamped files; Codex/agents get stamped sections in `AGENTS.md`. Root files are not flattened into another dock's folder. `importFrom` copies that dock's rules with the same replace/conflict rule as skills. Watcher covers the rule dirs and those root files.

- **Inbox groups Market vs Project by on-disk, not `source` (2026-08-28):** Discover Add kept `obra/react-patterns` under Market after install because grouping was `source === 'local'`, and scan could mint a second `react-patterns` row from the vercel `.agents` leftover. Grouping is now `paths.length > 0` → Project, else Market. Scan attaches an npx leftover short folder to the existing `source: 'skills.sh'` catalog id. Same skill, one row, moves from Market to Project when it lands on disk.
- **Manual Update from market via originHash (2026-08-28):** Install stamps `originHash` (sha256 of the copied SKILL.md). Scan updates `hash` only. Inbox `originChecks()` compares origin vs disk vs live market SKILL.md (hashed from `/api/market/preview`). Unedited + market moved → Update on the row. Edited → Reset in preview, not Update. `updateFromMarket` re-installs with replace. No auto-sync. Missing originHash (legacy/local) is silent.
- **Inbox row click previews SKILL.md (2026-08-28):** Inbox cards were static ids. Click now opens the same `SkillPreviewDialog` Discover uses. Catalog rows go through new `engine.readSkillMd` + `bridge.readSkillMd` (first readable `SKILL.md` on `paths`; GUI lists every dock path). Discover-only ids keep `marketPreview`. Trash stays delete: `stopPropagation` + z-index above the row hit target, so delete confirm does not open preview. `deleteSkill` is unchanged — every dock copy of that catalog id, nested skills stay, Discover-only ids leave Inbox only. Scan roots stay hardcoded (`SKILL_ROOTS`); there is no per-project dock config.
- **Reset confirm stacks above preview; replace does not drop Inbox (2026-08-28):** The preview is portaled to `document.body` at z-index 50. Reset/Update/Delete confirms were in-tree at z-index 10, so Reset from an edited preview opened behind the SKILL.md dialog. Confirms now portal to `document.body` at z-index 60. `install({ replace: true })` used to `removeDir` the dest *then* await npx — a DiskWatch scan in that gap treated the catalog id as gone and `dropSkillId` emptied Inbox even though the folder came back. Replace now downloads first, then swaps dest, records `lastWrittenPaths`, and `updateFromMarket` puts the id back in Inbox if a scan dropped it. Project market skills show Synced (emerald) / Edited or New copy (amber) badges plus a left stripe; Reset is the purple primary button.
- **GUI Discover: purple role tabs, live Top/Trending kept alongside shelves, denser preview (2026-08-27):** Four small, requested UI fixes to `MarketDiscover.tsx`, all matching patterns already shipped on Landing. (1) The role tablist's active state now uses `--accent-blue` (brand purple) via a new `.role-tabs .active-filter` scope, instead of the neutral `--accent` every other filter row (category chips, pagination, dock pickers) still uses — matches `discover.tsx`'s role chips being the one purple-filled control on that page. (2) Two pseudo-role tabs, **Top** and **Trending**, sit before the real shelf roles and call the pre-existing `bridge.browseSkills(view)` (the same live skills.sh call `SkillSearch.tsx`'s fallback already used) — this restores the "All-time/Trending" leaderboard for the case where the market index *does* have shelves, not just the empty-index fallback path (the previous "keep them until shelves have data" framing implied they'd disappear once real roles shipped; the actual ask was to keep them permanently as one more view, not a stopgap). Category chips hide while a browse tab is active, same as they hide during a full-index search. (3) The preview dialog's audit/installs/repository fields collapsed from a stacked `<dl>` into one line (`.skill-meta-row`), with the audit label now colored pass/warn/fail/none (emerald/amber/destructive/muted) via the same `AUDIT_STYLES` mapping as `discover.tsx`'s `PreviewDialog` — previously audit was plain text with no color signal. (4) Added the same `npx skills add` copy bar (`preview.installCommand`, already returned by `handleMarketPreviewRequest` but unused by the GUI until now) with a copy-to-clipboard button, and widened `.skill-details-modal` (680px → 760px) to fit the extra row without crowding the SKILL.md excerpt.
- **Discover UI polish: readable previews, consistent chip radius (2026-08-27):** No behavior change, both Discover surfaces already matched this doc's "role → category → ranked skills, live SKILL.md preview" design. Landing (`web/components/landing/discover.tsx`) role/category chips were the only multi-item control on the page using `rounded-full` (a shape this design otherwise reserves for single badges/CTAs, per `web/components/ui/button.tsx`'s `rounded-lg` default) — switched to `rounded-lg` to match. Its search bar had no submit affordance; added an arrow-icon submit button matching the GUI's existing `.search-box` `ArrowRight` pattern. Both dialogs (`PreviewDialog` on Landing, `MarketPreviewDialog`/`SkillDetailsDialog` in GUI) rendered `skillMd` as a raw `<pre>` block — both now strip the SKILL.md YAML frontmatter and render the body with `react-markdown` + `remark-gfm` (new dependency in `web/` and `gui/`). The GUI's `.skill-details-modal` used a hardcoded near-transparent white background (`rgba(255,255,255,0.1)` in dark mode) with heavy blur/saturate that made text hard to read over busy backdrop content — replaced with the same opaque `color-mix(var(--popover) 96%, transparent)` pattern `.help-modal` already used successfully, plus a new `.glass-modal` class on Landing's dialog (kept separate from the shared `.glass-panel-strong`, which other sections still use at its original ~5% tint for surfaces on a plain background).
- **GUI push is Export only; Install/Copy bridge removed as dead code (2026-08-27):** Full-codebase audit against these docs found `InstallSkill.tsx` (per-skill icon → dock menu → `bridge.install`) existed as a file but was never mounted by `InboxPanel.tsx` or `CollectionList.tsx` — only two small exports (`IDE_OPTIONS`, `folderName`) were still used, for Sync's Import picker and the Export status text. `copyTo` / `copyAll` / single-name `exportCommand` were fully wired end-to-end (bridge → preload → main → engine) with zero renderer callers. This wasn't a doc typo; the intended flow (confirmed with the user) is organize skills onto a command, then **Export** that command list to a dock — which already writes the command file *and* deploys every filed skill (skipping the file write for docks with none, e.g. Codex), so a separate Install/Copy surface was redundant with what Export already does. Deleted `InstallSkill.tsx`; moved `IDE_OPTIONS`/`folderName` into `format-context.ts`; removed `install` / `copyTo` / `copyAll` / `exportCommand` from `IPC_CHANNELS`, `SkilBridge`, preload, and main's `ipcMain.handle` registrations. `engine.install` / `copyTo` / `copyAll` / `exportCommand` are untouched — CLI (`skil install`, `skil copy`, `skil export <command>`) still calls them directly, and `exportAll` still calls `install` internally for Discover-only ids. Also fixed the Commands push button, which said "Export" while every doc said "Save" (docs now say Export), and added the missing `.github/prompts` to the GUI watcher's `WATCH_ROOTS` (Copilot's new command dir from the entry below was watched for skills but not for its prompt file).
- **Copilot gets a real command file; Codex stays skills-only (2026-08-27):** Checked both docks directly instead of assuming "skills only" for both. Codex: custom prompts were fully removed in `codex-cli 0.117.0` (confirmed via `openai/codex` GitHub issues, not just the changelog line), and even before removal they lived in `~/.codex/prompts` — user home, never git-shareable — so there was never a project file for skil to write. Codex is correctly skills-only. Copilot: VS Code's own docs say prompt files (`.github/prompts/<name>.prompt.md`) are real, workspace-committed, and still work for classic Copilot Chat sessions (the extension host) — just not Copilot's newer autonomous Agent Host, which reads `SKILL.md` instead. `COMMAND_DIR_BY_IDE` now includes `copilot: '.github/prompts'`; a new `COMMAND_EXTENSION_BY_IDE` map gives copilot `.prompt.md` (every other dock stays `.md`), read by `commandFilePath`. Fixed a latent bug alongside this: `writeThroughExisting` built its path inline instead of calling `commandFilePath`, and `importFrom` / `pullStampedCommands` / `writeThroughAfterScan` hardcoded `.endsWith('.md')` when scanning a command dir back — all four now go through the shared `commandExtension(ide)` helper, so a future per-IDE extension does not need a second fix pass. No third party does this conversion for us: Skillsmith's real CLI has no `convert` command (checked their own docs), and `npx skills add` only installs skill folders. `COMMAND_DIR_BY_IDE` / `commandFilePath` is the entire "converter," and it's ours.
- **Market index weekly Cron (2026-08-27, Phase 4 of `tasks/plan.md`, shipped):** `GET /api/cron/sync-market` is protected by `CRON_SECRET` (401 if missing or wrong bearer). Schedule is weekly (`0 0 * * 0` in `vercel.json`). Handler calls `MarketSync.sync({ maxDetail: 40 })` — shelf refresh + cap 40 hydrates, **no listing crawl** (the 20k walk timed out at 300s on Vercel). Native OIDC. First fill / full listing stays the paced laptop script. Market index is not the engine catalog: list rows are id/name/installs/(rank); preview is live SKILL.md + audit; Landing copies `npx skills add`, GUI `+` Inbox.
- **One map per project; docks are export targets (2026-08-27, Phase 5):** `commands[].skills` is SoT. v5 `membership` loads as a union. Scan does not adopt stamps. Copy/export write the same list to a dock. CLI mutate verbs have no `--ide`; `copy --to` (no `--from`). Commands tab is **one list** + dest chips (cursor / claude / codex / copilot / agents) — no IDE cards. Windsurf scan leftover. Install writes that dock’s folder (Cursor / Codex / Copilot relocate vercel `.agents` dumps). Thin `usage()` counts: Claude logs first, GUI shows reads on filed skills. Cursor hook skipped (would be 5+ files). Copilot eval out. README loop is one map, then export to a dock. Reverses 2026-08-24 per-IDE membership. Schema v6. Tasks: `tasks/todo.md` 16–30 (16–28 and 30 shipped; 29 skipped).
- **Market index Landing + GUI Discover (2026-08-27, Phase 3 (UI half) of `tasks/plan.md`, shipped):** `web/components/landing/discover.tsx` (role → category → 30 rows, full-index search, preview dialog with copy `npx skills add`) and `gui/.../components/MarketDiscover.tsx` (same nest, **+** Inbox instead of copy) both consume the Task 9–11 read API, closing out Phase 3. Web fetches same-origin (`web/lib/market-api.ts`, local types, no `src/` dependency — `web/` is a static export on the same Vercel project as `api/`). GUI reads through three new bridge methods (`marketShelves`/`marketSearch`/`marketPreview`) that call `axios` from the **main process**, mirroring `SkillsAdapter.search`/`.browse` (renderer `fetch` would be cross-origin against Electron). Both surfaces treat an empty index as the "not synced yet" case rather than an error: Landing hides the section, GUI falls back to the pre-existing `SkillSearch.tsx` live browse untouched. `vercel.json`'s `functions` list was missing `api/market/search.ts` / `api/market/preview.ts` (added here) — those shipped in Tasks 10–11 but were never added, so they'd have missed `includeFiles: dist/**` in production.
- **Market index read API (2026-08-27, Phase 3 (read half) of `tasks/plan.md`, shipped):** `handleShelvesRequest` / `handleMarketSearchRequest` / `handleMarketPreviewRequest` (`market-read.ts`) behind `api/market/{shelves,search,preview}.ts`. Search adds `MarketStore.searchListings` (name+description, inactive excluded, 1–50 cap) backed by a generated `tsvector` + GIN index (migration 0003) instead of `ilike`, per the loaded Postgres-best-practices skill. Preview adds `MarketStore.getListing` (stored installs/url/installUrl) plus a new `MarketSkillsClient.getSkillMd` (live SKILL.md fetch, separate from `getSkill`'s hydrate-only description+hash so preview never touches the stored/capped description) and reuses `SkillsAdapter`'s `owner/repo@skill` id transform, pulled out into `src/backend/skills-add-source.ts` so both call sites share one rule. No Landing/GUI caller yet (Tasks 12–13) and no cron (Task 14) — Discover's live browse is unchanged until those land.
- **Market index persistence + first fill (2026-08-26, Phase 2 of `tasks/plan.md`, shipped):** `SupabaseMarketStore` implements `MarketStore` against four tables (`supabase/migrations/0001_market_index.sql`: RLS on, anon/authenticated SELECT-only, service role bypasses RLS, FK indexes, seed matching `market-seed.ts`). `listShelves` runs three plain queries (roles, active fields, field-skill ranks joined to skills) and assembles in JS rather than one nested PostgREST embed, to keep the "slice raw ranks to `shelf_size`, then drop inactive, no renumbering" rule identical to `InMemoryMarketStore`. `RealMarketSkillsClient` (`market-skills-client.ts`) is the real `MarketSkillsClient` against skills.sh's page-based listing/detail/audit/search endpoints, OIDC-authenticated like `skills-proxy.ts`. `scripts/sync-market.ts` is the resumable first-fill runner (own `tsconfig.scripts.json`, run via `tsx`, not part of `dist/`). Migration is written; a human still applies it before the first run.
- **Market index sync core (2026-08-26, Phase 1 of `tasks/plan.md`, shipped):** `MarketStore` / `InMemoryMarketStore`, `MarketSkillsClient` seam, `MarketSync` (`crawlListing`, `hydrateDetails`, `syncListing`, `refreshActiveFields`), `parseSkillDescription`, and the v1 seed (4 roles / 20 fields). All pure logic against injected store + client — no Supabase, no real skills.sh HTTP wiring, no API routes, no UI yet. See "Market Index sync (Discover backend)" above.
- **Sync Import from another project (2026-08-26):** Bound folder required. Purple Import on Sync opens recents (except current) + Choose folder + format chips. `importFrom` copies that IDE's skill folders and stamped commands into this project. Add on top; Replace confirm on dest skill-body / command-name / unstamped-file conflicts. Does not bind source. Does not copy market inbox. Commands **Copy** (Task 21) is dest chips + Copy / Copy all on the one list — not same-project Import.
- **Header Re-scan; Save binds (2026-08-25):** Re-scan sits next to the header path only when a project is bound. Discover / Inbox / Sync do not show a scan icon. Commands Save is a download icon (push). First Save with no folder picks a dest, exports, then `bindProjectFolder` so header and Sync get that path. Copy and install dest picks still do not bind. Re-scan = pull; Save = push.
- **Commands landing is IDE cards (2026-08-24):** One Commands tab. Overview cards show command + unique skill counts. Click opens that IDE's workspace. Copy bar is dest chips + Copy / Copy all. Not a Format dropdown. Still not four tabs.
- **Per-IDE command membership (2026-08-24, Phase 13, shipped):** One Inbox + one `skills[]`. Commands store `membership` by IDE. IDE cards on Commands, not four tabs. Copy writes dest stamped file + missing skills. Write-through is per IDE. Stamped pull: that IDE's disk wins; other IDEs untouched. Watcher after write-through. Reverses "one shared membership, prompt when Cursor and Claude disagree." Schema is v5 (`commands[].membership`); v4 `skills[]` loads as Cursor.
- **Not this phase (2026-08-24):** SQLite / eval library, stamps on `SKILL.md`, live 3-way merge, per-IDE Inbox.
- **README matches the loop (2026-08-22, Task 40):** User-facing README documents scan → Inbox → file → install and/or export. Primary bin is `skil`. No one-click install from Discover, no import-from-IDE, no skillsmith export, no team YAML / `run` / linter as product. Architecture + PRD stay the spec; README stays the loop.
- **No leftover state fallback (2026-08-24):** Only `.skil/state.json`. If that is missing and `.contextkit/state.json` is present, throw: move the file. CLI prints the message and exits; GUI folder pick shows an error and does not bind.
- **GitHub / npm / GUI identity is skil (2026-08-24):** Repo is `eric-huychung/skil`. Package name is `skil` (GUI workspace `skil-gui`). IPC and renderer bridge are `skil:*` / `window.skil`. `contextkit` bin and `CONTEXTKIT_API_URL` remain aliases. Leftover `.contextkit/state.json` is still an error (move it).
- **State path and bin are skil (2026-08-22, Task 39):** Persist `.skil/state.json`. Bins: `skil` + `contextkit` alias. API origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`. GUI title/brand say skil. Engine class stays `CollectionEngine`.
- **Product is skil; groupings are commands (2026-08-22):** ContextKit / collections were the old names. User-facing language is skil + command. Engine class may stay `CollectionEngine` until a rename task. State target: `.skil/state.json`.
- **Inbox is a staging pool (2026-08-24):** Filing onto a command does not drop the id from Inbox. Scan still adds new ids. Gone folders still drop the id. `file()` and GUI `addSkill` both keep the id.
- **One catalog, IDE picker on Commands (updated 2026-08-24):** No per-IDE `state.json`, no IDE tabs. Membership is per IDE inside one file. Install/export/copy `--to` / IDE cards on Commands is how you see and push a specific tree.
- **Watcher after write-through (2026-08-24, shipped):** Explicit Re-scan remains in the header (connect / nothing changed on disk). Write-through for GUI edits on the active IDE. Light watcher (debounce / mute / skip `.git`) is scan + write-through, not a live merge. Successful scan notifies the GUI to refresh. Unchanged stamps are not rewritten.
- **Map + inbox + deploy, not folder trees (2026-08-22):** Commands are named id lists per IDE. Skills stay where they are on disk. Inbox is the staging pool (scan + Discover).
- **Pull = scan skills + stamped commands; push = install / copy / write our command file (2026-08-22, updated 2026-08-24):** Re-scan is not a live merge. We do not parse unstamped `commands/`.
- **No SkillScanner adapter (2026-08-22):** Grow `IFileSystemAdapter`. Two FS adapters already make the seam real.
- **Export replaces symlink activation (historical):** Collections were never a single "active" slot. Still true for commands — there is no active command.
- **Skills search/browse via OIDC backend (resolved):** No user `SKILLS_API_KEY`. Browse is proxy + CDN, not a registry.
- **Discover details use listing fields (resolved):** No SKILL.md proxy, no GitHub stars.
- **Project root is adapter config (resolved):** `createEngine(projectRoot)`. GUI picker rebuilds the engine. No `chdir`.
- **Inbox is a field on State, not a command (resolved):** Reserved name `inbox`. Discover Add does not install.
- **CLI/engine words are command (2026-08-22, Task 32):** `fileToCollection` is `file`. `create('/build')` stores `build`. Product-loop help/errors say command. Leftover sync/export/run may still mention collection internally.
- **Install records catalog `deployedTo` (2026-08-22, Task 35):** `engine.install(skillId, targetIDE)` calls the adapter, then upserts `SkillRecord` (`source` stays `local` if already scanned, else `skills.sh`; `paths` + `deployedTo` for that IDE). Persist rolls back on write failure. Does not write command files and does not require the id to be filed. Leftover `installedSkills` / `getInstalled()` is not the catalog. CLI `install <skillId> --to <ide>` requires `--to` and rejects an unknown IDE before the engine.
- **Install agent flag lives in the adapter (2026-08-22, Task 34):** `ISkillsAdapter.install(skillId, targetIDE)`. Real adapter runs `npx skills add <id> --agent <name>` with cwd = project root. Claude is `claude-code`; our `agents` IDE uses vercel's `universal`. In-memory adapter records `(skillId, ide)`. Convert unchanged.
- **Export deploys missing skills (2026-08-23):** `exportCommand` is async. After the stamped command file, each filed skill is skipped if dest has `SKILL.md`, copied from a local catalog path, or `install`ed if there is no local folder. GUI Export uses the same Inbox install modal (loading / success / failure; details collapsed). Export icon sits under delete; Target IDE is above From Inbox. From Inbox filters as you type and pages at 10.
- **CLI/GUI export is our stamped file (2026-08-22, Task 38):** `skil export <command> --to <ide> [--replace]` and GUI Export call `exportCommand`. Help says this is our template, not skillsmith convert. Unstamped existing file shows a Replace confirm. Leftover `engine.export` (convert-all) stays in the tree unused by CLI/GUI.
- **Command body is Goal / Sequence / Rules + managed Skills (2026-08-25):** First write fills those headings with one-line comments and a `## Skills` list from membership. Re-export / write-through refresh frontmatter and `## Skills` only. `--replace` resets the comments. Old numbered stubs upgrade on the next write.
- **exportCommand writes our stamped file (2026-08-22, Task 37):** `exportCommand(name, targetIDE, { replace? })` writes markdown with `name`, `skills`, `generated_by: skil`, `generated_at`, and the command body above. Unstamped existing file → error unless `replace: true`. Does not call `convert`. Windsurf path is `.windsurf/workflows/<name>.md` (Cascade workflows). Cursor / Claude use `commands/`. Agents has no documented command dir; we write `.agents/commands/<name>.md` next to `.agents/skills/`.
- **GUI install on Commands (2026-08-22, Task 36):** Inbox and filed skills pick an IDE and call `bridge.install(skillId, ide)` → engine. Error is a visible alert, not `sr-only`. Disabled until a folder is connected. Discover Add stays Inbox-only and does not grow Install. IDE picker includes `agents`.
- **GUI chrome says Commands (2026-08-22, Task 33):** Tab, headings, create/delete/export copy, and empty states say command. Filenames (`CollectionList.tsx`) and the `Collection` type alias stay. Discover Add is still Inbox-only.
- **Inbox install is icon-then-pick (2026-08-23):** No standing IDE dropdown. Download icon opens a menu (cursor / claude / windsurf / agents). Inbox layout matches Discover: search filters the pool, Scan is an icon.
- **Inbox is a rail tab above Commands (2026-08-23):** Staging pool, Scan, and Inbox install live on Inbox. Commands stays the command list plus the From Inbox file picker, filed install, and export.
- **GUI scans once after pick (2026-08-22, Task 31):** Pick folder calls `scan()`. Scan on Inbox is the re-scan. Disabled until a folder is connected. Gone ids come from the last scan result.
- **GUI design system (resolved, Task 44):** oklch tokens, Geist, Phosphor, shared `FOCUS_RING`.

## Success Criteria

1. Scan a repo with nested `SKILL.md` folders and see them in the catalog without creating commands from those folders. A leftover-only folder is catalogued but not copied to `.agents` / `.claude`.
2. Market `+` on a skill writes both live folders immediately; the row shows under Market. Toggle it off → parked, row stays. Toggle on → both live folders are back (re-fetched if parked is gone).
3. File `tdd` onto `/build`; `## Skills` on the live command skill lists it; `.agents/skills/tdd` / `.claude/skills/tdd` are unchanged by filing alone.
4. Delete a skill, re-scan: that id is gone from the catalog and from any command that had it, and the user is told.
5. `/build` toggled on writes `build/SKILL.md` + `agents/openai.yaml` in **both** live trees. Toggled off, `build/` is gone from both and present under `.skil/parked/commands/`.
6. Turning `/build` on when a non-command skill already owns `.agents/skills/build` is a clear, refused error — no auto-prefix.
7. Filing `tdd` onto `/build` updates `## Skills` only; it does not enable/install `tdd` itself.
8. CLI and GUI share the engine. Zero catalog logic in React. One Skills list, one Commands list — no dock chips, no Export button, no dock picker anywhere.
9. DiskWatch: two events inside 500ms become one scan; muted paths (and `.skil/deprecated`) are ignored; `.git` is skipped.
10. Leftover cleanup (**Use ours and remove leftovers**) copies any missing id into the live pair, then moves the old leftover path under `.skil/deprecated/`; it never touches a parked path.
11. `usage()` counts Claude skill reads from fixtures; missing logs → empty, not a crash.
12. Rules tab lists every shared-law `AGENTS.md` section (togglable) and every glob rule file (read-only, left on disk); `.cursor/rules/*.mdc` files are never copied into `AGENTS.md`.

## Not this phase

- SQLite
- "Used properly" / LLM-judge eval
- Copilot or Codex usage parsers (leftover scan yes; counts later)
- Stamps on `SKILL.md` itself (frontmatter stamps stay on command/rule files we generate, not on ordinary skills)
- Live 3-way merge of map + disk + body
- A dock picker or five-way export, in any form
- Command markdown under a `commands/` tree, for any dock
- Cross-project import (dropped this pivot, see Decision Log)
- Symlink parking (copy + remove is enough)
- Auto-copying leftovers into the live pair on scan (only `adoptLeftovers`, explicit, does that)
- A wishlist Inbox that is not on disk — market `+` is live immediately
- Global (`~/`) skill library as SoT
- Modeling runtime overlap (`.cursor` + `.agents` both loaded)

## References

- Deep module design: `.cursor/skills/design/codebase-design/SKILL.md`
- TDD: `.cursor/skills/philosophy/tdd/SKILL.md`
- PRD: `docs/requirements/prd.md`
- User-facing loop: `README.md`
- Live-trees pivot (on/off by path, live pair, parked, leftover, deprecated): `tasks/plan.md`, `tasks/todo.md` Tasks 1–14
- Market index (Discover backend) plan + tasks: `tasks/plan.md`, `tasks/todo.md`
