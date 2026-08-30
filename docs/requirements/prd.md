# skil: Live Trees — Toggle, not Export

## Problem Statement

Developers accumulate AI skills as folders (`SKILL.md`) across a mixed `.cursor` / `.claude` / `.codex` / `.github` / `.agents` folder (plus leftover Windsurf). Installation (`npx skills add`) and discovery (skills.sh) exist. What they lack is a **map**: which skills are on **in this project**, which SDLC command they belong to (one `/build`, not one per tool), and a way to turn a skill or command on without a five-way dock picker to keep in sync by hand — the old model made every add/remove a "which dock(s) do I push this to" decision, and nobody could say which of five copies was true. They also cannot see **which filed skills actually get used**.

## Solution

**skil** (one L) is a thin CLI + desktop GUI over a connected **project** folder. No login. Work vs side project = two maps.

- **Skills** = folders with `SKILL.md`. Disk is truth for the body. We hash it; we do not own the text. One catalog, many `paths`.
- **Live trees** = `.agents` + `.claude`, a constant pair, not a picker. A skill/command/rule is **on** when it lives in both; there is no "on for Cursor, off for Claude."
- **Parked** = off-but-yours, under `.skil/parked/…`. Toggling back on restores it (or re-fetches, for a market skill whose parked copy is gone).
- **Leftover** = every other root we still scan (`.cursor/skills`, `.codex/skills`, `.github/skills`, `.windsurf/skills`, stray always-on rule files). Catalogued, previewable, never written to — except by the one explicit **adopt-and-deprecate** cleanup action.
- **Deprecated** = a leftover tree we already retired via that cleanup. Recoverable, never re-scanned.
- **Commands** = named groups of skill ids **once per project**, e.g. `/build`. A live command is a human-only skill folder in both live trees. Filing a skill onto a command edits its `## Skills` list — filing does not turn the filed skill on.
- **Rules** = shared law lives in one place, `AGENTS.md` (`CLAUDE.md` is `@AGENTS.md` plus real Claude-only notes). Toggling a shared rule upserts/removes a section there. Path-scoped glob rules (`.cursor/rules/*.mdc`, `.claude/rules`) stay on disk exactly as found — never folded in, never toggled.
- **Toggle** = the only write. On → both live folders exist. Off → parked. There is no separate push/export step and no dest to choose.
- **Usage** = counts of how often a catalog skill was read (Claude first). Not "used properly."

We are **not** SoT for skill or rule file contents.
We **are** SoT for: which skills/commands/rules exist here, their on/off state (a path, not a flag), and which skills sit on which command (**one list**).

One `.skil/state.json`. No extra state file per tree.

We wrap skills.sh (via skil's OIDC backend) and `npx skills add`. We do not host a marketplace. We do not scan or own leftover unstamped command files — the only thing we ever do to a leftover tree is the one-button adopt-and-deprecate cleanup, on request. Runtime overlap (Cursor also loading `.agents`) is out of scope.

## User Flow

1. **Connect a repo (optional).** No login. Skip and still use Discover / Skills / Commands; first toggle can pick a folder and bind it.
2. **Scan** unions the live pair, every leftover root (`.cursor/skills`, `.codex/skills`, `.github/skills`, leftover `.windsurf/skills`), and parked folders into one catalog. Never writes a leftover home. No per-project dock config.
3. **Show the inventory.** Every catalog row is on or off from the moment it exists — there is no staging pool. Click a row to read `SKILL.md`. Skills tab splits **Market** (`source: 'skills.sh'`) vs **Project** (`source: 'local'`) as a display filter, not a queue.
4. **Organize once:** create `/build`, drop `tdd` on it. That is the project list.
5. **Toggle a skill or command on:** writes both `.agents/…` and `.claude/…` right away. Same two folders every time — no dest to pick.
6. **Discover → `+`** turns a market skill on directly: one `npx` into `.agents`, then a copy into `.claude`. No separate install step.
7. **Toggle off:** both live folders move to `.skil/parked/…`. The row stays, visibly off.
8. **Leftover cleanup** (Sync): **Use ours and remove leftovers** copies any leftover id missing from the live pair, then moves the old leftover path under `.skil/deprecated/`. Parked items are never touched by this.
9. **Re-scan / light watcher** = refresh the catalog only. The live pair is always the map — there is no stamp that can disagree with it anymore. Rules tab re-reads disk (`AGENTS.md` sections, plus leftover glob files and always-on files).
10. **Usage:** see counts on filed skills (Claude logs; Cursor hook optional).
11. **Rules:** shared law (`AGENTS.md` sections) toggles like a skill. Glob rules are listed and previewed, left alone on disk.

## User Stories

1. As a developer, I want to connect a project folder with no account, so I can work on this repo only
2. As a developer, I want to scan every skill root (live + leftover) and see every `SKILL.md` folder, so I know what is already there
3. As a developer, I want every skill to be simply on or off, so I do not have to think about which of five folders got the update
4. As a developer, I want to create a named command (`/build`) **once for this project**, so I can group skills by SDLC step without a list per tool
5. As a developer, I want to file a skill onto a command without moving folders or turning it on, so the repo layout stays mine and filing is not a side-effect trap
6. As a developer, I want to remove a skill from a command without moving folders, so the map can change; the skill itself stays wherever it currently is
7. As a developer, I want to delete a command, so it leaves the map and its live/parked folders; other skills on disk stay
8. As a developer, I want Discover (all-time / trending / typed search) without a folder, so I can browse before I connect
9. As a developer, I want `+` from Discover to turn a skill on immediately, so I do not have a wishlist step between "I want this" and "it's on"
10. As a developer, I want toggling a skill on to write both `.agents` and `.claude` at once, so I never have to remember a second tree
11. As a developer, I want toggling a command on to write a human-only skill in both live trees (frontmatter + `openai.yaml`), so `/build` only runs when I type it, never on the model's own judgment
12. As a developer, I want turning `/build` on to refuse clearly if a skill folder already owns that name, so I never get a silent collision
13. As a developer, I want re-scan to drop ids whose folders are gone everywhere, and never invent a command from a skill folder, so the inventory is honest
14. As a developer using several agents, I want one catalog and **one command list**, always mirrored to both live trees, so I do not maintain five `/build`s
15. As a developer, I want toggling a skill off to park it, not delete it, so I can turn it back on later without re-fetching (unless it truly is gone)
16. As a power user, I want CLI for scan / enable / disable / leftovers / adopt / usage, so I can script the whole loop
17. As a visual user, I want a GUI to connect, scan, and toggle rows on Skills / Commands / Rules, so I am not stuck in the terminal
18. As a developer, I want search and browse without my own skills.sh API key
19. As a developer, I want an empty search to show all-time and trending, so I can browse without inventing a query
20. As a developer, I want a light disk watcher, so I do not have to hit Re-scan for every edit (debounce, mute our writes, skip `.git` and `.skil/deprecated`)
21. As a developer with a messy `.cursor` / `.codex` / `.windsurf` history, I want one leftover-cleanup button that adopts what's missing and deprecates the rest, so I am not stuck merging five trees by hand
22. As a developer, I want to see how many times a skill was used (Claude first), so I can drop dead weight from `/build`
23. As a developer, I want to click a Skills row and read its `SKILL.md`, so I know what I am toggling or filing before I do it
24. As a developer, I want Market vs Project to be a filter, not two different states a skill can be stuck between, so an installed market skill is just one row
25. As a developer, I want an Update control when a market skill I did not edit has a new SKILL.md, so I can pull the new copy without hunting GitHub
26. As a developer who edited a market skill, I want Reset in preview instead of a silent overwrite, so my rewrite is not eaten
27. As a developer, I want a Rules tab that lists shared law (`AGENTS.md` sections) and every glob rule file, so I can see what's shared and what's Cursor/Claude-specific in one place
28. As a developer, I want to toggle a shared rule on/off the same way I toggle a skill, so shared law follows the same mental model as everything else
29. As a developer, I want to click a rule row and preview its body, so I know what the agent will read
30. As a developer, I want glob rules (`.cursor/rules/*.mdc`, etc.) left exactly where they are, so path-scoped rules are never flattened into `AGENTS.md` by mistake

## Implementation Decisions

### Core Architecture

- **Thin wrapper:** skil does not host skills or rewrite `SKILL.md`. Discover goes through skil's Vercel OIDC proxy. Market install shells out to `npx skills add` into `.agents`, then the engine copies into `.claude` — one write, two folders, no dock argument anywhere. Adapter failure does not persist a partial toggle.
- **Map, not trees:** Commands are one id list in our state. Disk folders do not move when you file. The live pair is the only write target — no picker.
- **Scan is pull; toggle is push.** `scan()` only unions live + leftover + parked into the catalog — it never writes anything. `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` are the only writes, and each one happens the instant the user acts, not on a later push step.
- **On/off is a path, not a flag.** There is no `enabled: true` sitting in `state.json` that can drift from disk — the live pair present is on, `.skil/parked/…` is off, a leftover root is neither.
- **Usage:** `UsageCollector` + `engine.usage()`. Counts only. Claude first.

### Module Boundaries

1. **Engine** — scan, catalog, one command list, file, `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled`, `leftovers` / `adoptLeftovers`, usage, rules listing. One deep module (today `CollectionEngine`).
2. **FileSystemAdapter** — state JSON plus walk/read/write/copy/remove for `SKILL.md` discovery and live/parked/deprecated moves.
3. **SkillsAdapter** — search, browse, install (always into `.agents`, no dock argument). Convert/skillsmith is leftover and already gone.
4. **UsageCollector** — in-memory in tests; Claude logs in prod.
5. **CLI** — parse and print.
6. **GUI** — bind to the engine. Header path + Re-scan when connected. Skills / Commands / Rules are each one list with a toggle per row. Discover / folder pick. No dock picker anywhere.
7. **DiskWatch** — debounce / mute / skip `.git` and `.skil/deprecated`. Calls `scan()` only — there is no write-through step left to run on a watcher tick, since toggling already wrote everything it needed to. Not a second deep module.

### Market index (Discover backend, separate track — shipped through Phase 4)

Discover's browse/search today hits skills.sh live via `SkillsAdapter`. The **market index** is a curated Supabase copy (~20k skills), nested role → category → top 30 by installs. It is **not** the engine catalog (`skills[]` in `.skil/state.json`). Roles and fields are rows (`market_roles` / `market_fields`), not a schema cap of 20. Full spec: `tasks/plan.md`; tasks: `tasks/todo.md`; module boundary: `docs/design/architecture.md` "Market Index sync (Discover backend)".

**List vs preview:** shelf and search rows are id, name, installs (rank on shelves only). Click-through preview is live SKILL.md + audit — bodies are never stored.

**Same nest, different action:** Landing copies `npx skills add`. GUI `+` calls `bridge.install(skillId)` — on immediately, no separate install step.

**Shipped:** sync core, Supabase persistence + first-fill script (`npm run sync-market`), read API (`GET /api/market/shelves|search|preview`), Landing + GUI Discover, and the weekly Cron (`GET /api/cron/sync-market`, `CRON_SECRET` or 401, `sync({ maxDetail: 40 })` — shelves + 40 hydrates, not the 20k listing). Empty or failed shelves keep the same Discover nest and default to live Top. A human still applies the migration, then runs first fill, before the index has data; after that the cron keeps shelves fresh. `+`'s new toggle-on behavior is the only change this pivot makes to Discover.

### Data Model

See `docs/design/architecture.md` for the v7 shape (live-trees pivot).

```yaml
# conceptual — not a team sync file
commands:
  build: [tdd, design]
```

State lives in `.skil/state.json`. Missing file → empty. Leftover `.contextkit/state.json` with no `.skil/` file is an error (move it). Project-local. CLI = cwd. GUI = picked folder. No `inbox` field — every row is on or off from the moment it exists.

v6 `skills[]` loads as-is; a leftover `inbox` array on disk is ignored, not migrated. v5 `membership` loads as a union (first key, then remaining). v4 `commands[].skills` loads as that array.

### Key Product Decisions

- **There is no Inbox.** `engine.inbox()` / `addToInbox` / `removeFromInbox` and the `inbox` field on `State` are removed (2026-08-29, see `docs/design/architecture.md` Decision Log "Inbox removed for real"). The "From Skills" picker on a command reads the full `skills()` catalog instead.
- **Command names have no leading slash.** `create /build` stores `build`. UI may still show `/build`.
- **CLI help/errors and GUI chrome say command, not collection.**
- **Connect scans once.** Pick folder (Sync) refreshes the catalog. Header shows the path and Re-scan only after a folder is bound. No folder → no header path, no Re-scan; Discover / Skills / Commands still work.
- **Scan does not create `/cursor` or `/claude`.** That would be the folder tree again.
- **Leftover command/prompt files are read-only until the user asks otherwise.** We do not scan unstamped `commands/` or `workflows/` as input to the map. The only write to a leftover path is `adoptLeftovers`, triggered by the one **Use ours and remove leftovers** button.
- **A command is a skill, not a special file format.** `.agents/skills/<name>/SKILL.md` + `.claude/skills/<name>/SKILL.md`, `disable-model-invocation: true`, plus `agents/openai.yaml` (`allow_implicit_invocation: false`) — same shape in both trees, no per-dock filename table, no `.prompt.md`, no `workflows/`.
- **Name collision is a refused write, not a silent merge.** Turning a command on when a non-command skill already owns that folder name is an error with no auto-prefix.
- **No version pinning.** Catalog hash is content identity, not a lockfile. `originHash` plus a manual Update (unedited) / Reset (edited) is the refresh; no auto-sync of a market skill once it's on.
- **Team YAML sync is leftover.** Not in this loop. No `.skil.yml` this phase.
- **`run` / shell templates are leftover.** "Command template" now means the human-only skill folder we generate, not `skil run`.
- **README is the user-facing loop.** Scan → toggle on/off → leftover cleanup. Do not advertise a dock picker, `export`/`install --to`, leftover `sync` / `run` / convert, a marketplace, or a linter.
- **One state file, one command list.** Skills / Commands / Rules tabs are each one list with a toggle. No tab-per-tree, no `.cursor/.skil/state.json`.
- **Toggle is the write.** There is nothing to defer — flipping a row on writes the live pair now; off parks it now.
- **Light watcher.** Disk edits: watcher scans and the GUI refreshes (debounce ~500ms, mute our writes ~1s, skip `.git` and `.skil/deprecated`). Watches the live pair, leftover skill roots, parked roots, glob rule dirs, and root always-on files (`AGENTS.md`, `CLAUDE.md`, leftover `copilot-instructions.md`). Explicit Re-scan remains in the header. Not a live 3-way merge.
- **Usage is counts.** Claude logs first. Cursor hook optional. Copilot eval out. No SQLite. No "used properly."

### CLI

- `skil scan` — union live + leftover + parked into the catalog; print added / gone / changed; never writes a leftover home
- `skil create <name> [--skills <ids>]` — `/build` stores `build`
- `skil delete <name>` — drop the command (and its live/parked folders)
- `skil list`
- `skil add <command> <skillId>` / `skil remove <command> <skillId>` — write-through `## Skills` on a live command only
- `skil enable <skillId>` / `skil disable <skillId>` — copy to the live pair, or park it (re-fetches on enable if a market skill's parked copy is gone)
- `skil enable --command <name>` / `skil disable --command <name>` — same, for a command's own folders; refuses on a name collision
- `skil rules` / `rules show <id>` / `rules enable <id>` / `rules disable <id>` — list shared + glob rules, read a body, toggle a shared-law `AGENTS.md` section
- `skil leftovers` / `skil adopt [ids...]` — list leftover paths, then copy-into-live + move-to-deprecated
- `skil usage` — print use counts
- `skil search [query] [--trending]`
- `skil install <skillId>` — market install straight to the live pair; no `--to`

No verb takes `--to <dock>`, `--from`, `copy`, or `export`.

Bin is `skil`. `contextkit` stays as an alias so old scripts work. The product name is skil.

API origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.

### GUI

- Window and brand say skil. Connect folder (Sync tab). No login. Header shows the bound path and Re-scan only after connect.
- Skills tab (was Inbox): the whole catalog, 25 per page, search, click a row to preview `SKILL.md` (disk body + every path — live/leftover/parked — for catalog ids; market preview for Discover-only ids), toggle per row (`setSkillEnabled`). Groups **Market** (`source: 'skills.sh'`) vs **Project** (`source: 'local'`) — a filter, not two states a skill gets stuck between. Delete is preview-only and hard-deletes live + parked copies (confirm lists the paths). Project rows with a market origin show a **Synced** / **Edited** / **New copy** badge (color + label). **Update** only when the disk copy still matches `originHash` and the live market SKILL.md moved. Edited copies get **Reset to market** (purple) in preview; the confirm stacks above the preview. No auto-sync. No Scan icon; refreshes from `onScan`.
- Commands tab: **one list**. Create, file from Skills, remove skill, delete command, and a **toggle** per row (`setCommandEnabled`). No dock chips, no Export button, no IDE cards, no per-dock command files — toggling on writes the human-only skill folder into both live trees directly. Filed skills show Claude read counts from `usage()`.
- Rules tab: shared-law rows (one `AGENTS.md` section each) get a toggle (`setSharedRuleEnabled`). Glob rows (`.cursor/rules/*.mdc`, etc.) are listed read-only — no toggle, no export. Click a row to preview the body. Does not create rules.
- Discover: one nest on Landing and GUI — live Top / Trending, then market index role → category, plus search + preview (`MarketDiscover.tsx` / `discover.tsx`). Empty or failed shelves stay on that nest and default to Top. GUI `+` calls `bridge.install(skillId)` directly. No project re-scan control.
- Discover / Skills / Commands / Rules do not require a folder. Scan needs a connected repo (header Re-scan, Sync pick, or CLI cwd).
- Pick folder on Sync scans once and binds. Header Re-scan is the explicit pull after that. Watcher also scans after debounce. There is no Scan-without-folder modal.
- **There is no push control.** No Export / Copy button, no dock picker, anywhere in the renderer — a toggle (or Discover's `+`) **is** the write. `bridge.install` (Discover `+` only) and `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` / `leftovers` / `adoptLeftovers` are the only mutating bridge calls; `copyTo` / `copyAll` / `exportCommand` / `exportAll` / `exportRules` / `importFrom` don't exist on the engine at all anymore — removed outright by the live-trees pivot, not just hidden from the bridge (see `docs/design/architecture.md` Decision Log).
- Toggle (any tab): loading / success / failure is inline on the row, not a modal — there is no dest or replace flag left to configure before the write happens. A market skill whose parked copy is gone re-fetches automatically on toggle-on; a local skill in the same spot surfaces an inline error. A command-name collision surfaces inline on the toggle.
- Sync tab: folder connect, plus a **Leftovers** card listing catalogued leftover skill/command/rule paths with one action, **Use ours and remove leftovers** (`adoptLeftovers`). No per-path picker.
- Discover Add still does not run `npx` directly in the renderer — it goes through the engine's `install`, same as `skil install` on the CLI
- Gone ids and leftover always-on warnings from the last scan show as a status banner
- No typed skill-id fields in the GUI (CLI can still take ids)

## Testing Decisions

- Test through the engine interface, not persist helpers
- Mock skills.sh and `npx skills add`
- Use an in-memory FS (or temp dirs) for scan / hash / gone / one-list commands / park / deprecate moves
- Do not require a real IDE to assert command-skill contents
- DiskWatch tests use a fake clock (debounce / mute), not a real chokidar run
- Usage tests use an in-memory collector and Claude log fixtures

- **Modules to test:** engine (scan unions live/leftover/parked without writing leftover, one-list file, `setSkillEnabled` off→park→on→restore and market re-fetch, `setCommandEnabled` off→park→on→restore and name-collision error, `setSharedRuleEnabled` upsert/remove on `AGENTS.md`, gone ids, `leftovers`/`adoptLeftovers` adopt+deprecate, scan attaches npx leftover to market id, originHash / originChecks / updateFromMarket, usage, readSkillMd, deleteSkill live+parked only); FS walk + move; install adapter (no dock arg); UsageCollector; CLI handlers; GUI via the bridge; DiskWatch debounce/mute.

## Out of Scope

### Not in this phase

- A dock picker or five-way export, in any form
- Command markdown under any `commands/` tree, for any dock
- Scanning or merging leftover unstamped `commands/` files as map input
- Cross-project import (dropped this pivot — no dest dock left to import into; revisit only on a real request)
- skillsmith bulk convert as "export"
- Skill authoring / editing `SKILL.md` in skil
- Marketplace or our own registry
- Team `.yml` sync as the core loop
- Last-folder persistence
- Live 3-way merge on disk change (watcher is scan-only)
- Auto-sync of installed Discover skills — Update/Reset is explicit. No background overwrite.
- Auto-copying leftovers into the live pair on scan (only the explicit `adoptLeftovers` action does that)
- Symlink parking (copy + remove is enough)
- A wishlist Inbox that is not on disk — market `+` is live immediately
- Treating every `.cursor/rules` glob file as dirty — only leftover always-on files that fight `AGENTS.md` get a warning
- Token / fat-skill linter (later wedge, not this loop)
- Login, SSO, analytics
- IDE extensions
- Global (user-home) skill scan
- `run` as a product feature
- SQLite
- "Used properly" / LLM-judge eval
- Copilot usage counts (leftover scan yes)
- Stamps on ordinary `SKILL.md` (command/rule stamps we generate are unaffected)
- Per-tree Skills/Commands lists or per-tree `state.json`
- Modeling runtime overlap (`.cursor` + `.agents` both loaded)

### Deferred

- Cross-platform GUI polish beyond macOS-first
- One skill filed onto many commands from the GUI
- Public command-template packs

## Open Questions

- Package name in this repo is `skil`. Confirm the name is free on npm before publish.
- Confirm Cursor in this repo's world actually reads `.agents/skills` and `AGENTS.md` before Task 10's GUI polish — that is the kill-risk for the whole pivot (see `tasks/plan.md` Risks).

### Success Metrics

**Month 1:** people connect a real repo, scan, and turn on at least one command
**Month 3:** toggle used to turn things on and off (not just on); usage counts glanced at
**Month 6:** signal whether the linter / token wedge is worth building

### Distribution

- npm CLI (bin `skil`; `contextkit` alias)
- Electron app, same engine
- Site already at skil.website for the search/browse proxy
- `README.md` is the user-facing loop (scan → toggle on/off → leftover cleanup)
