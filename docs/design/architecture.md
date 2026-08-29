# skil Architecture

## Overview

**skil** (one L) is a map + inbox + skill deploy tool, plus command templates we generate. It also lists **rules** already on disk (Cursor `.mdc`, Claude, Copilot, `AGENTS.md`, …) and can copy them to a dest dock.

It is a thin orchestration layer (CLI + GUI) over a **connected project folder**. No login. Work vs side project = two folders = two maps.

- **Skills** = folders that contain `SKILL.md`. Disk is the source of truth for the body. One catalog (`skills[]`), many `paths` / `deployedTo`.
- **Inbox** = one staging pool for this project. Not per dock.
- **Commands** = named SDLC knobs (`/build`, `/tdd`). **One list per project.** Cursor `/build` and Claude `/build` are the same ids in the app. Skills sit under them **in the app**, not as a folder tree.
- **Rules** = markdown/mdc files agents already load (`.cursor/rules`, `.claude/rules`, `.github/instructions`, root `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md`). Disk is SoT. We list every file we find, including other formats. We do **not** persist a rules map.
- **Docks** = folders we scan and export/install into (Claude, Cursor, Codex, Copilot, agents). Not five command maps. Windsurf is still scanned; it is not a peer dock.
- We **do not** scan or own the user's unstamped `commands/` files.
- We **do not** model runtime overlap (Cursor may also load `.agents`). We write the dock they picked.

We are **not** SoT for skill file contents.  
We **are** SoT for: which skills exist in this project, their hashes, where we deployed them, and which skills sit on which command (**one list**).

**Pull** = scan skill folders (union into the catalog). Stamped command files do not fork the map. **Push** = install a skill into a dock and/or write our command template to a dock.

The class in the tree is still `CollectionEngine`. That is the deep module. This doc uses **Command** for the map grouping (today's `Collection`) and describes the implemented interface. Rename the class when it stops lying; do not split the module.

One `.skil/state.json`. No extra state file per IDE.

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

One deep module: the engine. Callers learn a small interface (scan, inbox, file, copy, install, export, usage, readSkillMd, rules, readRule, exportRules). The implementation hides catalog merge, hashing, gone-id cleanup, **one command list**, dock paths, deploy records, stamped command-file writes, **rule-file discovery**, and usage aggregation.

Callers do **not** pass a dock into `create` / `file` / `list`. Dock is only on push (`install` / `export` / `copyTo`). `list()` returns `{ name, skills }` for the project map.

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

Map methods have no dock (a few — `create`, `list`, `file`, `addSkill`, `removeSkill`, `delete` — still accept an optional `ide`/`dock` param for v5 callers; it is ignored, one list). Push methods take a dock (default `'cursor'` until CLI drops the default).

```typescript
type Dock = 'cursor' | 'claude' | 'codex' | 'copilot' | 'agents' | 'windsurf'

interface SkilEngine {
  scan(): Result<ScanResult>                         // union catalog + inbox; stamps do not fork the map
  skills(): SkillRecord[]
  inbox(): string[]
  addToInbox(skillId: string): Result<string[]>
  removeFromInbox(skillId: string): Result<string[]>
  create(name: string, skillIds: string[], command?: string): Result<Command>
  delete(name: string): Result<void>                 // drops the command
  list(): Command[]                                  // one skills[] each
  file(skillId: string, commandName: string): Result<Command>
  addSkill(name: string, skillId: string): Result<Command>
  removeSkill(name: string, skillId: string): Result<Command>
  deleteSkill(skillId: string): Result<void>          // drops from disk (all dock copies) + catalog + Inbox
  readSkillMd(skillId: string): Result<string>        // first on-disk SKILL.md for that catalog id; missing → error
  copyTo(name: string, fromDock: Dock, toDock: Dock, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>  // fromDock is accepted, unused (one list)
  copyAll(fromDock: Dock, toDock: Dock, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  importFrom(sourceRoot: string, dock: Dock, opts?: { replace?: boolean }): Promise<Result<ExportResult>>
  install(skillId: string, dock: Dock, opts?: { dest?: string; replace?: boolean }): Promise<Result<SkillRecord>>
  exportCommand(name: string, dock: Dock, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  exportAll(dock: Dock, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  usage(): Promise<Result<UsageRow[]>>          // Claude-first counts; missing logs → []
  lastWrittenPaths(): string[]
  originChecks(): Promise<Result<OriginCheck[]>>
  updateFromMarket(skillId: string, opts?: { replaceEdited?: boolean; dest?: string }): Promise<Result<SkillRecord>>
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  rules(): RuleRecord[]
  readRule(id: string): Result<string>
  setAlwaysApply(id: string, alwaysApply: boolean): Result<RuleRecord>
  exportRules(dock: Dock, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
}
```

`Command` is `{ name, skills, createdAt }`. Persist v6 uses `commands[].skills` (see Data Model). Type name `IDE` may stay in code until a rename task; product language is **dock**.

**Invariants**
- A skill is a folder that contains `SKILL.md` (nested folders ok).
- One Inbox. One `skills[]` catalog. **One command list** (not per dock). No `.cursor/.skil/state.json`.
- Scan never creates commands from skill folders and never moves folders.
- Scan walks six hardcoded skill roots (`.cursor/skills`, `.claude/skills`, `.codex/skills`, `.github/skills`, `.agents/skills`, `.windsurf/skills`). No per-project dock config.
- **Rules** are a live disk walk (not `state.json`): `.cursor/rules/**/*.mdc`, `.claude/rules/**/*.md`, `.github/instructions/**`, `.windsurf/rules/**`, plus root `CLAUDE.md`, `AGENTS.md`, and `.github/copilot-instructions.md`. Same name across docks is one card (dock copies are deploys). Not Inbox. Not a skil-owned map.
- `deleteSkill(id)` deletes every dock copy of that catalog id (`paths`). Nested skills stay. Discover-only ids leave Inbox only.
- Inbox = staging pool (scanned locals + Discover adds). Filing onto a command does **not** drop the id from Inbox. "Not on any command" is a UI filter, not a second list. GUI Inbox groups by **on disk** (`paths.length > 0` → Project) vs not (Market wishlist). `source: 'skills.sh'` is origin, not the group key — an installed market skill is one Project row.
- Scan does not mint a second catalog id for an npx leftover short folder (`.agents/skills/<slug>`) when a `source: 'skills.sh'` row already owns that slug. Attach the leftover path to the market id.
- Scan puts new ids in Inbox if they are not already there. Discover Add does too.
- Filing / unfiling / create / delete change the **project** list. Dock is not an argument.
- `create('build')` when `/build` already exists is "already exists".
- `delete('build')` drops the command row (and our stamps on docks that already had one).
- Filing (`file` / GUI `addSkill`) does not drop the id from Inbox. Inbox is the picker. "Not on any command" is a UI filter.
- `removeSkill` updates the one list. Inbox keeps the id. Gone folders drop the id from catalog, commands, and Inbox.
- `create('inbox')` is an error. Inbox is not a command. `create('/inbox')` is the same error.
- Command names store without a leading slash. `create('/build', …)` and `file(..., '/build', ide)` normalize to `build`. UI may show `/build`.
- Re-scan refreshes the catalog. Same hash at a new path is a rename (keep membership, update the id) — not gone + added. If a folder is gone, drop that id and report it.
- We never read **unstamped** `commands/` trees to build the map.
- **Stamped** command file `skills:` ≠ map → warn (`commandPulls`). Do **not** adopt into the map. No silent 3-way merge. No per-dock fork.
- Write-through: file / unfile / create / delete rewrite **existing** stamps only (same list on every dock that already has our file). Do not create new stamps.
- Copy (`copyTo` / `copyAll`) writes the **same** map to the dest dock (stamped file + missing skill folders). Same stamp / replace rules as export. `--from` is gone.
- Import (`importFrom`) copies one dock's skill folders (and stamps if any) **and that dock's rule files** from another project folder into this one. New ids add on top. Different dest `SKILL.md`, an unstamped dest command file, or a dest rule with a different hash needs `replace: true`. Same-hash skills/rules are left alone. Unstamped source commands, other docks, and source Inbox / `state.json` are ignored. Does not bind the source folder.
- Export writes **our** command file when that dock has a command path, then ensures filed skills exist in that dock's skills dir. Dest folders that already have `SKILL.md` are left alone. Local folders are copied; Discover-only ids go through `install`. If a command file exists and is not stamped by us, refuse unless `replace: true` — no skill deploy in that case.
- **Rules export** (`exportRules`) copies scanned rules using `RULE_LAYOUT`. Folder docks get `dir/name.ext` with a `generated_by: skil` stamp. Codex also writes `.codex/rules` plus stamped sections in `AGENTS.md` (what Codex loads). Agents writes `.agents/rules` plus the same `AGENTS.md` sections. Root files stay at dest root when that dock uses that filename. Different dest needs `replace: true`. A dest that already matches still reports the path — empty `succeeded` is not success. `setAlwaysApply` writes every dock copy of that name.
- Install writes a skill folder into that dock's skills dir and records the deploy. It does not write command files.

**Implementation responsibilities**
- Persist the catalog, inbox, and **one** command list in `.skil/state.json`. Missing file → empty state. Leftover `.contextkit/state.json` with no `.skil/` file is an error (no fallback).
- Walk hardcoded dock skill roots (`.cursor/skills`, `.claude/skills`, `.codex/skills`, `.github/skills`, `.agents/skills`, `.windsurf/skills`), hash `SKILL.md`, reconcile gone/changed/new/rename. A new short folder that matches `skillFolderName` of an existing `source: 'skills.sh'` row is attached to that row, not added. No per-project dock config.
- Walk rule files on `rules()` / `exportRules` / `importFrom` (not persisted). Cursor `.mdc` `alwaysApply` is readable and writable (`setAlwaysApply`). Root always-on files (`CLAUDE.md`, `AGENTS.md`, `copilot-instructions.md`) show as on and cannot be toggled.
- `readSkillMd(id)` returns the first readable `SKILL.md` on that catalog row's `paths` (scan order, `.cursor` first). Disk owns the body; this is display-only. Discover-only Inbox ids are not catalog rows — GUI preview falls through to `marketPreview` for those.
- On scan, **do not** adopt stamped `skills:` into the map. Warn if a stamp disagrees.
- Coordinate install into **that dock’s** skills dir (not vercel’s `.agents` dump for Cursor) and record `deployedTo`. First market install stamps `originHash`. `originChecks` / `updateFromMarket` compare that to disk and the live market SKILL.md; Update is explicit, never automatic.
- Write stamped command markdown for docks that have a command path (cursor / claude / agents / windsurf / copilot). Codex: skill folders only — custom prompts were removed from Codex entirely (codex-cli 0.117.0) and even before that lived only in `~/.codex/prompts`, never git-shareable.
- After a map mutation, rewrite **existing** stamps (write-through). `lastWrittenPaths()` is the mute list for DiskWatch. `writeThrough` / `writeThroughAfterScan` live on the class, not the public interface; `scan()` calls the latter. After-scan write-through skips a stamp whose `skills:` list already matches the map. Do not create new stamps.

**Why deep:** CLI, GUI, and tests all call the same methods. Membership, hash policy, gone-id cleanup, and stamp rules must not leak to the UI.

**Leftover methods are gone.** CLI `convert` / `sync` / `run` and engine `sync`, `convert`, `getCommand`, skillsmith `export` were deleted. Product export is `exportCommand`. CLI and GUI call `exportCommand` / `copyTo`. Team YAML `ConfigAdapter` is gone.

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

`writeFile` is for our command templates (and tests). `copyDir` copies a local skill folder to another IDE tree. `listFiles` is how scan finds stamped command files. `removeFile` deletes our stamp on per-IDE delete. Install of a remote id still goes through SkillsAdapter (`npx skills add`).

### 3. SkillsAdapter

**Interface:**

```typescript
interface SkillsAdapter {
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  install(skillId: string, targetIDE: IDE, opts?: { cwd?: string }): Promise<Result<void>>
  getInstalled(): Skill[]                                         // leftover; real adapter returns []
}
```

- `search` / `browse`: our Vercel backend + OIDC. No user API key. Browse is CDN-cached (`Cache-Control` on 200 only). Not a skil registry. Origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.
- `install`: `npx skills add <source> --agent <name> --copy -y` with `cwd` = project root, or `opts.cwd` for a one-shot dest. `--copy` so vercel's dump can be moved into that dock's own skills dir. 3-part skills.sh ids become `owner/repo@skill`. Agent/IDE flag stays **inside** the adapter.

  | skil IDE | `--agent` (vercel-labs/skills) |
  |----------|--------------------------------|
  | cursor | `cursor` |
  | claude | `claude-code` |
  | codex | `codex` |
  | copilot | `github-copilot` |
  | windsurf | `windsurf` |
  | agents | `universal` |

  `agents` has no vercel name; `universal` is the documented agent that writes `.agents/skills/`. Vercel currently lists project paths for `cursor`, `codex`, and `github-copilot` as `.agents/skills/`, not the dock folders we scan. We still pass those `--agent` names. Scan walks `.cursor/skills/`, `.codex/skills/`, and `.github/skills/` (product contract). After `npx`, the engine copies the dump into that dock path and removes the stray `.agents` folder.
- Listing fields (`name`, `repo`, `installs`, …) stay in-memory. Never persist them on catalog records.

### 4. CLI (Thin)

Commander routes to the engine. No catalog logic here.

Verbs:
- `skil scan` — pull skills into the catalog (stamps do not fork the map)
- `skil inbox` / `inbox add <skillId>` / `inbox file <skillId> <command>` / `inbox delete <skillId>` (delete from disk + Inbox; nested skills stay, Discover-only ids just leave Inbox)
- `skil create <name> [--skills <ids>]` — empty or seeded command; `/build` stores `build`.
- `skil delete <name>` — drop the command
- `skil list` — the project map
- `skil add <command> <skillId>` / `skil remove <command> <skillId>`
- `skil copy <command> --to <dock> [--replace]` / `skil copy --all --to <dock>`
- `skil install <skillId> --to <dock>` — push a skill into that dock’s folder (any dock, including `windsurf`)
- `skil export [command] --to <dock> [--replace]` — a command name exports that one; omitted exports every command (same as GUI Export)
- `skil usage` — Phase 5: print use counts (Claude first)
- `skil rules` / `rules show <id>` / `rules always-apply <id> on|off` / `rules export --to <dock> [--replace]` — list on-disk rules, read body, toggle Cursor alwaysApply, copy to a dest dock
- `skil search [query] [--trending]` — unchanged discover

Push verbs take `--to` (default `cursor`). Unknown dock is rejected before the engine. Mutating map verbs have no `--ide`.

Bin is `skil`. `contextkit` is an alias of the same entry. Help and product-loop errors say **command**, not collection. Engine method is `file` (was `fileToCollection`). `Collection` remains a type alias. GUI chrome says Commands. Window/title says skil. Renderer bridge is `window.skil`.

### 5. GUI (Thin)

Same engine. No business logic in React.

**Connect:** folder picker on Sync (`pickProjectFolder` = dialog + bind). No login. Discover, Inbox, and Commands work with no folder. Scan needs a connected repo (or CLI cwd). Header shows the bound path and a Re-scan icon only after connect; with no folder the header is empty. Window title and brand say **skil**.

**Session bind (GUI main):** `projectRoot` is session-only. `pickProjectFolder` opens a dialog then `bindProjectFolder`. `bindProjectFolder(path)` is `createEngine(path)` + DiskWatch, no second dialog. `pickDestinationFolder` is dest-only and does not bind.

**Tabs:**
- **Inbox** — one global staging pool (scan + Discover adds). File onto a command, or delete. Filing onto a command does not remove the id. Not per IDE. No Scan control; it listens to `onScan`.
- **Commands** — one tab, **one list** (the project map). Create, file from Inbox, remove skill, delete command, **Export** (push everything to a chosen dock). Windsurf is not a peer chip. Do **not** add IDE workspace cards.
- **Rules** — one tab. One card per rule name (dock copies are deploys). Card name + always-apply toggle (writes every copy; root always-on files are display-only). Click a card to preview the body. Same format picker + **Export** as Commands (`exportRules`). Does not create rules.
- **Discover** — live Top / Trending plus market index role → category, search, preview. Add → Inbox (does not install). No project re-scan control.
- **Sync** — pick / change folder, plus **Import** (another project, one dock). Not a live merge. No per-dock `state.json`. Re-scan is not on this card.

After pick, the GUI calls `scan()` once. Inbox is a rail tab above Commands. Re-scan is the header icon next to the path (hidden until a folder is bound). Inbox still shows gone ids and stamp-vs-map warns from the last scan (`role="status"`). Do not auto-create commands from skill folders. Discover Add is unchanged (still no install).

**The GUI has two push controls, both labeled Export.** Commands Export pushes the command map (`exportAll`). Rules Export copies rule files (`exportRules`). There is no separate per-skill Install or cross-dock Copy button in the renderer. `engine.install` / `copyTo` / `copyAll` / single-name `exportCommand` remain real engine methods (CLI still uses `install` and `copy`, and `exportCommand` backs CLI's `export <command>`), but the Electron bridge no longer exposes `install`, `copyTo`, `copyAll`, or `exportCommand` — only `exportAll` and `exportRules`. Removed 2026-08-27 (see Decision Log) after they were found wired end-to-end (bridge/preload/main) but never rendered — `InstallSkill.tsx` existed as a file but nothing mounted it.

**Export (Commands):** push the **project map** to a chosen dock, button labeled **Export** in the Commands heading (not "Save"). Writes the command file (for docks that have one), then copies local filed skills the dest is missing (or `install` internally for Discover-only ids — an engine-level call, not the removed bridge method). Dest skill folders already present are left alone. Loading / success / failure is a modal; failure details stay collapsed. Unstamped existing command file shows a Replace confirm (`replace: true`). Dock picker stays enabled with no folder. First Export with no session: `pickDestinationFolder` → `exportAll({ dest })` on the current (userData) engine → `bindProjectFolder(dest)` → `scan()`. Header path + Re-scan and Sync then show that folder. Export **before** bind so sketched commands are not wiped by `createEngine`. Later Exports use the bound root (no second picker). Re-scan (header) is pull; Export is push. They are not the same control. Counts from `usage()` sit on filed skills (Claude reads). Empty or failed usage does not block export.

**Import (Sync):** purple **Import** on Sync, disabled until a folder is bound. Modal: dock chips (default Cursor), recent folders except current, or Choose folder (`pickDestinationFolder`, does not bind). Calls `importFrom(sourceRoot, dock)`. New skills add on top; command names union into the map; that dock's rule files copy in. Conflicts (different dest `SKILL.md`, unstamped dest file, different dest rule) show Replace, then `replace: true`. Does not switch the connected project. Does not copy market Inbox.

**Watcher:** GUI main starts `DiskWatch` after folder pick (known `skills/` dirs plus command/workflow/prompt dirs, including `.github/prompts`, plus rule dirs `.cursor/rules`, `.claude/rules`, `.github/instructions`, `.windsurf/rules`). Also watches the project root (non-recursive) for `CLAUDE.md` / `AGENTS.md`, and `.github` for `copilot-instructions.md`. Debounce ~500ms, mute our writes ~1s, skip `.git`. Flush calls `scan()` (which write-throughs existing stamps) then mutes `lastWrittenPaths()`. Not a live 3-way merge. Not a CLI daemon.

### 6. Market Index sync (Discover backend)

**Status: Phases 1–4 shipped (sync core, persist + first fill, read API + UI, weekly cron).** Full spec: `tasks/plan.md`; task breakdown: `tasks/todo.md`.

Discover today calls `SkillsAdapter.search` / `.browse` live against skills.sh. The **market index** is a separate, precomputed alternative: a curated Supabase copy of skills.sh (~20k rows), nested **role → category (field) → top 30 skills by installs**, refreshed on a schedule instead of hit live. It is not the engine catalog (`skills[]` in `.skil/state.json`) — always say **market index**, never "engine." Roles and fields are **data rows**, not a hardcoded list of 20. **List** (shelf/search) is rank/name/installs (rank on shelves only). **Preview** is live GitHub + SKILL.md + audit — bodies stay off the DB. **Landing copies** `npx skills add`; **GUI `+` is Inbox**, not install.

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

**Why separate from the engine:** the market index has its own store (Supabase, not `.skil/state.json`), its own sync loop (script + weekly cron, not scan), and no per-IDE membership concept. It only feeds Discover's read path; it does not touch `SkillsAdapter`, the catalog, or Inbox.

**Landing (Task 12, shipped):** `web/lib/market-api.ts` (same-origin `fetch` for `/api/market/*` and live `/api/skills?view=` — `web/` is a static export on the same Vercel project as `api/`, no OIDC, no `src/` dependency) and `web/components/landing/discover.tsx` (Top / Trending, then role chips → category chips → 30-row list; a search box overrides the nest with the full-index search; row click opens a preview dialog with the live SKILL.md excerpt, audit badge, and a copy-to-clipboard `npx skills add` button). Empty or failed shelves keep the section and default to Top. Browse results are cached in-session (one fetch per view).

**GUI Discover (Task 13, shipped):** Three bridge methods (`marketShelves` / `marketSearch` / `marketPreview`) proxy the same read API through the **main process** via `axios` — not `fetch` in the renderer, for the same CORS reason `SkillsAdapter.search`/`.browse` already go through IPC. `MarketDiscover.tsx` is the same nest as Landing (Top / Trending + role → category), with a **+** button per row that calls `addToInbox` (never installs). Empty or failed shelves stay on this nest and default to Top — there is no second Discover component. A market search or browse error surfaces inline (`role="alert"`). Browse results are cached in-session. Selecting Top / Trending swaps the row list to the live skills.sh result and hides the category row.

**GUI Inbox preview:** Clicking a row opens the same `SkillPreviewDialog` Discover uses. Catalog rows (any `paths`) read `engine.readSkillMd` — first on-disk `SKILL.md`, plus the path list so every dock copy is visible. Discover-only ids (not in the catalog) call `marketPreview` (live SKILL.md + audit + copy `npx skills add`). Delete stays on the trash control (`stopPropagation`); `deleteSkill` still removes every dock copy of that **catalog id** (folder path under the skills root, e.g. `.cursor/skills/tdd` and `.claude/skills/tdd` are one id `tdd`), not every similarly named folder. Reset/Update confirm is portaled to `document.body` above the preview (`modal-backdrop` z-index 60, preview 50). Project rows with `source: 'skills.sh'` show a Synced / Edited / New copy badge (text + color, matching Discover audit colors). `updateFromMarket` downloads the market copy first, then swaps the dest folder, so a scan cannot treat the id as gone mid-reset; Inbox keeps the id.

The migration is written but **a human still applies it** in the Supabase dashboard/CLI before the first `npm run sync-market` run — same as `tasks/plan.md` specifies for Task 7 (and 0003 for Task 10's search index). Until that first run, both Landing and GUI Discover show Top / Trending with no role tabs. After first fill, the weekly cron refreshes shelves and hydrates at most 40 details; it does not re-crawl the full listing.

## User Flow

1. **Connect a repo (optional).** No login. Skip and still use Discover / Inbox / Commands; first Save can pick a folder and bind it. Work vs side project = another folder = another map.
2. **Scan** dock skill dirs (`.cursor`, `.claude`, `.agents`, `.codex`, `.github`, leftover `.windsurf`) — **skills** into the catalog + Inbox. Stamps do not fork the map.
3. **Inventory.** Scanned and Discover ids sit in one Inbox. They stay there after filing. Click a row to read `SKILL.md` (disk for catalog ids, market index for Discover-only). Inbox groups Market (not on disk) vs Project (on disk). Install/export moves a Discover id to Project.
4. **Organize once.** Create `/build`, file `tdd` onto it. That is the project list.
5. **Export / copy to a dock.** Writes that dock’s stamped file (if it has command markdown) and missing skill folders. Same list every time.
6. **Discover → Inbox → file onto a command → install `--to` a dock** writes the skill into **that dock’s** skills dir.
7. **Export** (explicit): write **our** command file where that dock has one, and deploy filed skills that dock is missing. Do not touch their old `/build.md` unless they opt in to replace. Do not overwrite dest skill folders.
8. **Import** (Sync): copy one dock’s skill folders (and stamps if any) **and that dock’s rules** from another **project** into this folder. Add on top; warn then replace on conflict. Bound folder stays. Market inbox is not copied.
9. **Re-scan / watcher** = refresh catalog. Map stays the SoT. Stamp ≠ map is a warn, not an adopt. Rules tab re-reads disk (rule dirs and root always-on files).
10. **Usage (Phase 5):** `skil usage` / GUI counts from Claude logs (Cursor hook optional). Copilot = no counts.
11. **Rules:** pick a folder (or Import) also surfaces rule files. Preview, toggle Cursor `alwaysApply`, Export to a dest dock.

## Data Model

### Catalog and map (`state.json`)

Schema **v6** (Phase 5). Load v5 `membership` as a union (cursor first, then other keys, unique). No rewrite until the next mutation.

```typescript
interface State {
  version: string              // "6.0"
  commands: CommandRecord[]    // one skills[] per command
  skills: SkillRecord[]        // one catalog — we are SoT
  inbox: string[]              // one staging pool
  installedSkills?: Skill[]    // leftover from the old convert-all loop; not read by the product loop
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
  id: string           // path relative to project root
  name: string         // pair-programming/behavior, CLAUDE
  path: string         // same as id
  dock: Dock           // AGENTS.md is agents
  alwaysApply: boolean
}

interface SkillRecord {
  id: string                   // path relative to that IDE's skills root ("tdd", "ui/styling")
  hash: string                 // sha256 of SKILL.md (utf-8)
  paths: string[]              // folders we have seen, relative to project root
  deployedTo: Array<{ ide: IDE; path: string; installedAt: string }>
  source: 'local' | 'skills.sh'  // origin: scan vs install. Inbox groups by paths, not this.
  originHash?: string            // SKILL.md hash at market copy-time. Scan does not overwrite.
}

interface ScanResult {
  added: string[]
  gone: string[]
  changed: string[]            // path still there, hash updated
  commandPulls: Array<{ ide: IDE; name: string }>  // stamp ≠ map (warn only)
}

interface ExportResult {
  succeeded: string[]
  failures: string[]
}
```

**Id rule:** id = path relative to the scanned skills root. Same id in two IDE trees is one catalog row with multiple `paths`. Nested `build/tdd/SKILL.md` → id `build/tdd`. If a slug exists only as a leaf, id is `tdd`.

**Load:** v6 `skills[]` as-is. v5 `commands[].membership` → union (cursor, then remaining docks, unique). v4 `commands[].skills` → that array. v3 `collections` → `commands` first, then the same. Missing `skills` → `[]`. `inbox` missing → `[]`. v1 `activeCollection` still ignored.

**Hash:** `SKILL.md` only, not the whole folder. Disk stays SoT for the body; we store the hash so rescan can report `changed` and so export can stamp what we saw.

### Command file we write (push)

Target path by dock:

| Dock | Skills (scan + install) | Our command file |
|-----|-------------------------|------------------|
| cursor | `.cursor/skills/` | `.cursor/commands/<name>.md` |
| claude | `.claude/skills/` | `.claude/commands/<name>.md` |
| agents | `.agents/skills/` | `.agents/commands/<name>.md` |
| copilot | `.github/skills/` | `.github/prompts/<name>.prompt.md` (VS Code prompt file — read by classic Copilot Chat / extension host, not Copilot's Agent Host) |
| codex | `.codex/skills/` | none (skills only — custom prompts removed in codex-cli 0.117.0; never had a project-file home even before that) |
| windsurf | `.windsurf/skills/` | `.windsurf/workflows/<name>.md` (scan leftover, not a peer dock) |

We scan **skills** dirs always. We read **stamped** command files on pull. We write command dirs on Copy / Export / write-through.

```markdown
---
name: /build
skills:
  - tdd
  - design
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

Stamp = `generated_by: skil` in frontmatter. If the target file exists and lacks that stamp, `exportCommand` / `copyTo` / write-through skip the file (map may still update) unless `replace: true`. If it is our file, we rewrite frontmatter `skills:` and `## Skills`. Goal / Sequence / Rules (everything above `## Skills`) stay unless `replace: true` or the body is still the old numbered stub / untouched starter.

### Listing `Skill` (Discover)

Unchanged: skills.sh listing DTO. In-memory only. Not a catalog row until they Add (inbox) and later install (disk + `SkillRecord`).

## Key Technical Decisions

### Split SoT (catalog vs disk vs map)

**Decision:** Disk owns skill bodies. skil owns the catalog, hashes, deploys, **and one command list per project**. Stamped command files are a projection we write on export. We do not adopt them into the map on pull.

**Rationale:** Users already edit `SKILL.md` in the repo. The map is “what is on `/build` in this project.” Work vs personal is another folder. Cursor vs Claude is export, not a second map.

### Scan is pull, not import-as-command

**Decision:** `scan()` never upserts a command named `cursor` or `claude` from skill folders. New skill ids go to Inbox. Stamped `/build.md` does **not** change `commands[].skills`.

**Rationale:** Commands are SDLC knobs the user creates. An IDE-named command would recreate the folder tree. Stamp-wins-per-dock was how we grew five maps.

### One catalog, one command list (docks are not workspaces)

**Decision:** `.skil/state.json` is the only map. Inbox + catalog + `commands[].skills` are project-global. Commands tab is **one list**. Docks are install/export targets. No `.cursor/.skil/state.json`. No IDE cards.

**Rejected:** per-dock membership (v5). **Rejected:** four IDE tabs. **Rejected:** per-dock Inbox. **Rejected:** treating `.agents` as a fourth product with its own `/build`.

**If Cursor `/test.md` and Claude `/test.md` disagree on disk:** the map wins. Warn. User exports to refresh a stamp, or deletes the extra folder. Runtime “Cursor also reads `.agents`” is out of scope.

**Rationale:** Filing once per project matches how people work (same skills on every agent in this repo). v5 per-IDE lists matched messy disk and made Copy a matrix. This **reverses** the 2026-08-24 per-IDE membership decision (Phase 13).

### Write-through refreshes existing stamps only

**Decision:** Create / file / unfile / delete rewrite stamped command files that **already exist** (same `skills:` everywhere). Do not create a stamp in a dock that never got export.

**Rationale:** First landing on a dock is explicit export. Later map edits should not surprise a dock that was never pushed.

### Inbox is a staging pool (still one)

**Decision:** Filing onto a command does not remove the id from Inbox. Gone folders still drop the id from Inbox and commands. Inbox is not per dock. GUI groups Market (not on disk) vs Project (catalog `paths` non-empty). A Discover id **moves** to Project after install/export; it does not stay under Market. `source` stays `'skills.sh'` on install — that is origin, not the Inbox group. Scan attaches an npx leftover short folder to that market id instead of adding a second local row.

**Rationale:** Inbox is the picker. "Unfiled" is a filter. `file()` and GUI `addSkill` both keep the id. Grouping by `source === 'local'` left installed market skills in Market and let scan mint `react-patterns` next to `obra/react-patterns`. On-disk vs not is one skill, two states. `originHash` plus a manual Update/Reset is how we notice a market change without auto-overwriting disk.

### We do not scan unstamped `commands/` (or Windsurf `workflows/`)

**Decision:** Their unstamped `/planning.md` / `/build.md` are not ours. We do not parse, index, or overwrite them unless export/copy `--replace` (or the file is stamped by us).

**Rationale:** Those files are their workflow text. Owning them makes skil a competing command manager.

### Copy is the same list to another dock

**Decision:** `copyTo` / `copyAll` write the project map to the dest dock (stamped file if that dock has command markdown, plus missing skill folders). Same skip / copy / install / replace rules as `exportCommand`. No `--from`.

**Rationale:** Copy is export with a dest chip. There is no second list to copy from.

### Import is cross-project, one dock

**Decision:** `importFrom(sourceRoot, dock, { replace? })` reads that dock’s skill tree (and stamps if any) from another folder and writes them into this project. New ids add to Inbox; command names union into **the** map. Dest `SKILL.md` with a different hash or an unstamped dest command file requires `replace: true`. Same-hash skills are skipped. Source Inbox / `state.json` / unstamped commands / other docks are ignored. GUI Sync Import does not bind the source.

**Rationale:** Copying `.cursor` between repos is common. Path ids stay. Market inbox is app-global — do not copy it.

### Install is push-to-a-dock

**Decision:** `install(skillId, dock)` writes the folder into **that dock’s** skills dir and appends `deployedTo`. Cursor → `.cursor/skills`, not vercel’s project `.agents/skills`. Filing can happen before or after; file then install is still the happy path.

**Rationale:** The catalog is dock-agnostic. Disk layout is not. One skill can be deployed to more than one dock.

### Watcher is scan, not live merge

**Decision:** Watch skill dirs, command/workflow dirs, rule dirs, and root always-on rule files (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`). Debounce ~500ms. Mute paths we just wrote for ~1s. Skip `.git`. Then scan + write-through **existing** stamps. Skip rewrite when the stamp already matches the map. Gone-id cleanup that changed the list still rewrites. After a successful scan, GUI main notifies the window so lists refresh. Explicit Re-scan remains in the header.

**Rationale:** Explicit Re-scan is too easy to skip. A 3-way merge of map + disk + body edits is still out. The map wins; we tell them if a stamp disagrees.

### Thin usage eval (Phase 5, no SQLite)

**Decision:** `UsageCollector` seam. `engine.usage()` returns counts. Claude session logs first. Cursor hook only if small. Copilot/Codex counts later. No “used properly” judge.

**Rationale:** Unused vs used is the product question. Skillsight/SkillKit already do dashboards; we show counts on the map we already have.

### Project-local, no login

**Decision:** One connected folder (CLI = cwd, GUI = picker + `createEngine(root)`). No account. No last-folder file this phase.

### Leftovers stay leftover

CLI `convert` / `sync` / `run` and engine leftover methods (`sync`, `convert`, `getCommand`, skillsmith `export`) are gone. Do not build Phase 8 import that upserts a command named `cursor` / `claude`. Cross-project `importFrom` on Sync is in. Do not build Phase 9 "export = fetch then convert."

## Test Strategy

**Unit (70%)** — engine: scan reconcile, one-list file/create/delete, copyTo writes same list, importFrom add/replace, gone ids, export stamp/replace, install dock path, scan does not adopt stamps, usage counts. Adapters mocked.

**Integration (20%)** — CLI with in-memory engine; temp-dir FS for walk + hash; DiskWatch debounce/mute with fake clock.

**E2E (10%)** — GUI with real engine, fake adapters: connect → scan → one command list → export to Claude → Cursor folder unchanged until export.

**Agreed seams**
1. Engine: `scan`, `list()`, `file` / `create` / `delete`, `deleteSkill`, `readSkillMd`, `copyTo` / `copyAll`, `importFrom`, `install`, `exportCommand`, inbox, `usage`, `originChecks`, `updateFromMarket`, `rules`, `readRule`, `setAlwaysApply`, `exportRules`
2. `IFileSystemAdapter.findSkillFolders` / `readFile` / `writeFile`
3. `ISkillsAdapter.install(skillId, dock)` / `skillHash(id)`
4. `UsageCollector.collect`
5. CLI `scan` / `list` / `copy --to` / `install` / `export` / `usage` / `rules`
6. GUI via the bridge (one Commands list, dock picker on push, counts)
7. DiskWatch: debounce, mute, skip `.git`

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

`Result<T>` for expected failure. Persist failure rolls back in-memory state. Conflict failures also carry `code` + `labels` (unstamped command, import, rule export) so GUI does not parse `Error.message`.

### State

Atomic JSON write. Schema version on every persist. v5 → v6 on load (membership union), no rewrite until the next mutation.

## Open Questions

1. One skill on many commands **on the same IDE** — the map allows it (`addSkill` / a second file). GUI this phase files from Inbox only.
2. npm package name is `skil`. Bins are `skil` and `contextkit` (alias). Publish to npm as `skil` when ready.
3. After we rewrite a stamped file, do we preserve a user-edited body? v1 no. Revisit if people use export as a round-trip editor.
4. Team YAML sync — deleted with leftover `sync` / `ConfigAdapter`. Do not design `.skil.yml` this phase.
5. `--to` default `cursor` vs required flag. Keep default `cursor` on push. Mutate verbs have no dock flag (Phase 5).

## Decision Log

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

1. Scan a repo with nested `SKILL.md` folders and see them in Inbox without creating commands from those folders.
2. File onto `/build`; Inbox still has the id; folders do not move. There is no second Claude `/build` in the app.
3. Export / copy `/build` to Claude writes Claude’s stamped file and missing skill folders; Cursor’s file is not created until they export Cursor.
4. Delete a skill folder, re-scan, that id is gone from catalog, commands, and Inbox, and the user is told.
5. Stamped Claude `/build.md` with a different `skills:` list does **not** change the map; user is warned.
6. Install writes into the target **dock** skills dir and records `deployedTo` (Cursor → `.cursor/skills`).
7. Export / write-through will not clobber an unstamped `/build.md` without `--replace` or overwrite an existing dest skill folder. Write-through does not create new stamps.
8. CLI and GUI share the engine. Zero catalog logic in React. One Commands list, not IDE cards.
9. DiskWatch: two events inside 500ms become one scan; muted paths are ignored; `.git` is skipped.
10. Import from another project on Sync adds missing skills **and rules**; conflicts warn then replace; bound folder stays.
11. `usage()` counts Claude skill reads from fixtures; missing logs → empty, not a crash.
12. Rules tab lists every on-disk rule (including other formats), previews the body, toggles Cursor `alwaysApply`, and exports to a dest dock.

## Not this phase

- SQLite
- “Used properly” / LLM-judge eval
- Copilot or Codex usage parsers (dock yes; counts later)
- Stamps on `SKILL.md`
- Live 3-way merge of map + disk + body
- Per-dock Inbox or per-dock command lists
- Four IDE tabs or per-dock `state.json`
- Global (`~/`) skill library as SoT
- Modeling runtime overlap (`.cursor` + `.agents` both loaded)

## References

- Deep module design: `.cursor/skills/design/codebase-design/SKILL.md`
- TDD: `.cursor/skills/philosophy/tdd/SKILL.md`
- PRD: `docs/requirements/prd.md`
- User-facing loop: `README.md`
- Phase 5 (one map + docks + eval): `tasks/plan.md`, `tasks/todo.md` Tasks 16–30
- Market index (Discover backend) plan + tasks: `tasks/plan.md`, `tasks/todo.md`
