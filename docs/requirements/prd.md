# skil: Map + Inbox + Skill Deploy

## Problem Statement

Developers accumulate AI skills as folders (`SKILL.md`) across Claude, Cursor, Codex, Copilot, and a shared `.agents` tree (plus leftover Windsurf). Installation (`npx skills add`) and discovery (skills.sh) exist. What they lack is a **map**: which skills are on disk **in this project**, which SDLC command they belong to (one `/build`, not one per dock), and a way to push a skill or a generated command file without touching the skill body or hijacking their existing unstamped `commands/` markdown. They also cannot see **which filed skills actually get used**.

## Solution

**skil** (one L) is a thin CLI + desktop GUI over a connected **project** folder. No login. Work vs side project = two maps.

- **Skills** = folders with `SKILL.md`. Disk is truth for the body. We hash it; we do not own the text. One catalog, many `paths` / `deployedTo`.
- **Commands** = named groups of skill ids **once per project**. Those are the SDLC knobs. `/build` is the same list whether you later export to Cursor or Claude.
- **Inbox** = one staging pool (scanned locals + Discover adds). Filing onto a command does not remove the id.
- **Docks** = folders we scan and install/export into (claude, cursor, codex, copilot, agents). Not five command editors. Windsurf is scanned, not a peer dock.
- **Pull** = scan skill folders into the catalog. Stamped command files do not fork the map.
- **Push** = install a skill into a dock’s skills dir, copy/export the **same** list to a dock, and/or write **our** command template where that dock has command markdown.
- **Usage** = counts of how often a catalog skill was read (Claude first). Not “used properly.”

We are **not** SoT for skill file contents.  
We **are** SoT for: which skills exist here, hashes, where we deployed them, and which skills sit on which command (**one list**).

One `.skil/state.json`. No extra state file per dock.

We wrap skills.sh (via skil's OIDC backend) and `npx skills add`. We do not host a marketplace. We do not scan or own their old unstamped `/build.md` unless they opt in to replace it. Runtime overlap (Cursor also loading `.agents`) is out of scope.

## User Flow

1. **Connect a repo (optional).** No login. Skip and still use Discover / Inbox / Commands; first Save can pick a folder and bind it.
2. **Scan** dock skill trees — catalog + Inbox. Stamps do not change the map.
3. **Show the inventory.** Scanned and Discover ids sit in one Inbox and stay there after filing.
4. **Organize once:** Create `/build`, drop `tdd` on it. That is the project list.
5. **Copy / export to Claude** (one command or all): dest stamped file + missing skill folders. Same ids as the map.
6. **Discover → Inbox → file onto a command → install `--to` a dock** writes the skill into that dock’s skills dir.
7. **Export** (explicit): generate **our** command file where the dock has one, and put filed skills there if they are missing. Do not touch their old `/build.md` unless they opt in to replace. Do not overwrite dest skill folders.
8. **Import** (Sync): copy one dock’s skills from another **project** into this folder. Add on top; warn then replace on conflict. Bound folder stays. Market inbox is not copied.
9. **Re-scan / light watcher** = refresh catalog. Map stays SoT. Stamp ≠ map is a warn.
10. **Usage:** see counts on filed skills (Claude logs; Cursor hook optional).

## User Stories

1. As a developer, I want to connect a project folder with no account, so I can work on this repo only
2. As a developer, I want to scan my IDE skill trees and see every `SKILL.md` folder, so I know what is already on disk
3. As a developer, I want Inbox as a staging pool, so I can file the same skill onto commands without losing it from the list
4. As a developer, I want to create a named command (`/build`) **once for this project**, so I can group skills by SDLC step without a list per dock
5. As a developer, I want to file a skill onto a command without moving folders, so the repo layout stays mine
6. As a developer, I want to remove a skill from a command without moving folders, so the map can change; Inbox still has the id unless the folder is gone
7. As a developer, I want to delete a command, so it leaves the map; skills on disk stay
8. As a developer, I want Discover (all-time / trending / typed search) without a folder, so I can browse before I connect
9. As a developer, I want Add from Discover to land in Inbox and not download, so install is a later choice
10. As a developer, I want to install a skill into a chosen **dock** skills dir, so push is explicit
11. As a developer, I want export to write **skil's** command file (`skills:` + Goal/Sequence/Rules comments + `## Skills` + stamps) and put filed skills in that dock if they are missing, so the command is usable there
12. As a developer, I want export / copy to refuse an unstamped existing `/build.md` unless I say replace, so my old command text is safe
13. As a developer, I want re-scan to drop ids whose folders are gone and **not** fork my command list from stamps, so the inventory is honest
14. As a developer using several agents, I want one catalog, one Inbox, and **one command list**, then export to Claude / Cursor / Codex / Copilot / agents, so I do not maintain five `/build`s
15. As a developer, I want "Copy to Claude" (one command or all), so the **same** list lands in Claude’s folder without re-filing
16. As a power user, I want CLI for scan / inbox / file / copy / install / export / usage, so I can script pull and push
17. As a visual user, I want a GUI to connect, scan, file on one Commands list, copy, install, and export to a dock, so I am not stuck in the terminal
18. As a developer, I want search and browse without my own skills.sh API key
19. As a developer, I want an empty search to show all-time and trending, so I can browse without inventing a query
20. As a developer, I want a light disk watcher after write-through, so I do not have to hit Re-scan for every edit (debounce, mute our writes, skip `.git`)
21. As a developer, I want to import skills from another project on Sync, so I do not copy-paste folders by hand
22. As a developer, I want to see how many times a skill was used (Claude first), so I can drop dead weight from `/build`

## Implementation Decisions

### Core Architecture

- **Thin wrapper:** skil does not host skills or rewrite `SKILL.md`. Discover goes through skil's Vercel OIDC proxy. Install shells out to `npx skills add` when useful, then the engine ensures the file sits in **that dock’s** skills dir (Cursor → `.cursor/skills`, not vercel `.agents`). Adapter failure does not persist a deploy. Filing is recommended first but not required.
- **Map, not trees:** Commands are one id list in our state. Disk folders do not move when you file. Docks are push targets.
- **Pull / push:** `scan` is pull (catalog). `install`, `copy`, and `export` are push. Re-scan is not a live merge. Stamps do not fork the map.
- **No "active" command:** Nothing is switched on. You file, then export to a dock.
- **Usage:** `UsageCollector` + `engine.usage()`. Counts only. Claude first.

### Module Boundaries

1. **Engine** — scan, catalog, inbox, one command list, file, copy, install, export, usage. One deep module (today `CollectionEngine`).
2. **FileSystemAdapter** — state JSON plus walk/read/write for `SKILL.md` discovery and command-file output.
3. **SkillsAdapter** — search, browse, install. Convert/skillsmith is leftover. Product export is engine `exportCommand`, not skillsmith.
4. **UsageCollector** — Phase 5. In-memory in tests; Claude logs in prod.
5. **CLI** — parse and print.
6. **GUI** — bind to the engine. Header path + Re-scan when connected. Commands is one list. Discover / Inbox / folder pick. Dock picker on install/export.
7. **DiskWatch** — debounce / mute / skip `.git`. Calls scan + write-through existing stamps. Not a second deep module.

### Market index (Discover backend, separate track — shipped through Phase 4)

Discover's browse/search today hits skills.sh live via `SkillsAdapter`. The **market index** is a curated Supabase copy (~20k skills), nested role → category → top 30 by installs. It is **not** the engine catalog (`skills[]` in `.skil/state.json`). Roles and fields are rows (`market_roles` / `market_fields`), not a schema cap of 20. Full spec: `tasks/plan.md`; tasks: `tasks/todo.md`; module boundary: `docs/design/architecture.md` "Market Index sync (Discover backend)".

**List vs preview:** shelf and search rows are id, name, installs (rank on shelves only). Click-through preview is live SKILL.md + audit — bodies are never stored.

**Same nest, different action:** Landing copies `npx skills add`. GUI `+` adds to Inbox (does not install).

**Shipped:** sync core, Supabase persistence + first-fill script (`npm run sync-market`), read API (`GET /api/market/shelves|search|preview`), Landing + GUI Discover, and the weekly Cron (`GET /api/cron/sync-market`, `CRON_SECRET` or 401, `sync({ maxDetail: 40 })` — shelves + 40 hydrates, not the 20k listing). Empty index still degrades (Landing hides the section, GUI keeps live skills.sh browse). A human still applies the migration, then runs first fill, before the index has data; after that the cron keeps shelves fresh.

### Data Model

See `docs/design/architecture.md` for the v6 shape (Phase 5).

```yaml
# conceptual — not a team sync file
commands:
  build: [tdd, design]
inbox:
  - some-unfiled-skill
```

State lives in `.skil/state.json`. Missing file → empty. Leftover `.contextkit/state.json` with no `.skil/` file is an error (move it). Project-local. CLI = cwd. GUI = picked folder.

v5 `membership` loads as a union (cursor first). v4 `commands[].skills` loads as that array.

### Key Product Decisions

- **Inbox is not a command.** Reserved name. `create inbox` errors. One Inbox, not per dock.
- **Command names have no leading slash.** `create /build` stores `build`. UI may still show `/build`.
- **CLI help/errors and GUI chrome say command, not collection.**
- **Connect scans once.** Pick folder (Sync) puts new skill ids in Inbox. Header shows the path and Re-scan only after a folder is bound. No folder → no header path, no Re-scan; Discover / Inbox / Commands still work.
- **Scan does not create `/cursor` or `/claude`.** That would be the folder tree again.
- **We do not scan unstamped `commands/` (or Windsurf `workflows/`).** Stamped files are ours to write. Pull does **not** adopt `skills:` into the map. Stamp is `generated_by: skil`. Unstamped existing files need replace. Stamped re-writes refresh frontmatter + `## Skills`; Goal / Sequence / Rules stay unless `replace` is true.
- **Command-file paths:** cursor / claude / agents use `commands/<name>.md`. Copilot writes a real VS Code prompt file, `.github/prompts/<name>.prompt.md` — works in classic Copilot Chat (extension host), not Copilot's newer Agent Host. Codex: skill folders only (custom prompts removed in codex-cli 0.117.0; never had a project-shareable file even before that). Windsurf leftover: `.windsurf/workflows/<name>.md`.
- **No version pinning.** Catalog hash is content identity, not a lockfile.
- **Team YAML sync is leftover.** Not in this loop. No `.skil.yml` this phase.
- **`run` / shell templates are leftover.** "Command template" now means the markdown file we generate, not `skil run`.
- **README is the user-facing loop.** Scan → Inbox → file (one list) → copy / install / export **to a dock**. Do not advertise leftover `sync` / `run` / convert, a marketplace, or a linter.
- **Inbox is a staging pool.** Filing does not remove the id. `remove` from a command does not remove it from Inbox either. Gone folders drop the id from both.
- **One state file, one command list.** Commands tab is that list. Dock picker only on install/export/copy. No tab-per-dock, no `.cursor/.skil/state.json`.
- **Write-through refreshes existing stamps only.** File / unfile / create / delete do not create a stamp in a dock that was never exported.
- **Light watcher after write-through.** Disk edits: watcher scans and the GUI refreshes (debounce ~500ms, mute our writes ~1s, skip `.git`). Explicit Re-scan remains in the header. Unchanged stamps are not rewritten. Not a live 3-way merge.
- **Usage is counts.** Claude logs first. Cursor hook optional. Copilot eval out. No SQLite. No “used properly.”

### CLI

- `skil scan` — pull catalog; print added / gone / changed; stamp ≠ map is a warn
- `skil create <name> [--skills <ids>]` — `/build` stores `build`; `inbox` is reserved
- `skil delete <name>` — drop the command
- `skil list`
- `skil add <command> <skillId>` / `skil remove <command> <skillId>` — Inbox unchanged
- `skil inbox` / `inbox add <skillId>` / `inbox file <skillId> <command>` — file onto a command; Inbox keeps the id
- `skil inbox delete <skillId>` — delete a skill from disk + Inbox; nested skills stay, Discover-only ids just leave Inbox
- `skil copy <command> --to <dock> [--replace]` / `skil copy --all --to <dock>`
- `skil install <skillId> --to cursor|claude|codex|copilot|agents|windsurf` — records `deployedTo`; unknown `--to` is rejected before the engine
- `skil export [command] --to <dock> [--replace]` — a name exports that one; omitted exports every command
- `skil usage` — print use counts
- `skil search [query] [--trending]`

Bin is `skil`. `contextkit` stays as an alias so old scripts work. The product name is skil.

API origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.

### GUI

- Window and brand say skil. Connect folder (Sync tab). No login. Header shows the bound path and Re-scan only after connect. Purple **Import** on Sync (disabled until connected) copies one dock’s skills from a recent folder or a chosen folder. Does not bind. Dock chips default to Cursor. Conflicts warn then replace. Market inbox is not copied.
- Inbox tab (above Commands): Discover-like list (25 per page), search the staging pool, file onto a command, or delete. Filing does not remove ids. One Inbox. No Scan icon; Inbox refreshes from `onScan`.
- Commands tab: **one list**. Create, file from Inbox, remove skill, delete command, **Export** (download icon, pushes everything to a chosen dock). Do not add IDE cards or four tabs, and do not add separate Install/Copy controls — Export already deploys every filed skill to the dock. Filed skills show Claude read counts from `usage()`.
- Discover: market index role → category browse + search + preview, Add → Inbox, when the index has data (`MarketDiscover.tsx`); falls back to the live All time / Trending + typed search + details (`SkillSearch.tsx`) when it doesn't. No project re-scan control either way.
- Discover / Inbox / Commands do not require a folder. Scan needs a connected repo (header Re-scan, Sync pick, or CLI cwd).
- Pick folder on Sync scans once and binds. Header Re-scan is the explicit pull after that. Watcher also scans after debounce. There is no Scan-without-folder modal.
- **The GUI's only push control is Export** — `bridge.install` / `copyTo` / `copyAll` / single-name `exportCommand` are not exposed over the Electron bridge (removed 2026-08-27 as dead code; a per-skill Install button existed as an unmounted file, and Copy had no UI at all). `engine.install` / `copyTo` / `copyAll` / `exportCommand` still exist and back the CLI (`skil install`, `skil copy`, `skil export <command>`).
- Export on Commands: push the **project map** via the download icon, call `engine.exportAll` with a dock. Writes our stamped command file where that dock has one, and deploys filed skills that dock is missing (copy local; install Discover-only internally; skip dest that already exists). Loading / success / failure is a modal; failure details stay collapsed. Unstamped existing command file shows a Replace confirm (`replace: true`). No connected folder → dest picker, export, then bind that folder so header and Sync show it. Later Exports use the bound root.
- Discover Add still does not install and does not grow an Install control
- Gone ids and stamp-vs-map warns from the last scan show as a status banner
- No typed skill-id fields in the GUI (CLI can still take ids)

## Testing Decisions

- Test through the engine interface, not persist helpers
- Mock skills.sh and `npx skills add`
- Use an in-memory FS (or temp dirs) for scan / hash / gone / one-list commands / export stamp
- Do not require a real IDE to assert command-file contents
- DiskWatch tests use a fake clock (debounce / mute), not a real chokidar run
- Usage tests use an in-memory collector and Claude log fixtures

**Modules to test:** engine (scan, one-list file, copy same list, importFrom add/replace, gone, install dock path, export stamp, scan does not adopt stamps, usage); FS walk; install adapter; UsageCollector; CLI handlers; GUI via the bridge; DiskWatch debounce/mute.

## Out of Scope

### Not in this phase

- Scanning or merging their existing **unstamped** `commands/` files
- Import that upserts a command named `cursor` / `claude`
- skillsmith bulk convert as "export"
- Skill authoring / editing `SKILL.md` in skil
- Marketplace or our own registry
- Team `.yml` sync as the core loop
- Last-folder persistence
- Live 3-way merge on disk change (watcher is scan + write-through only)
- Token / fat-skill linter (later wedge, not this loop)
- Login, SSO, analytics
- IDE extensions
- Global (user-home) skill scan
- `run` as a product feature
- SQLite
- “Used properly” / LLM-judge eval
- Copilot usage counts (dock yes)
- Stamps on `SKILL.md`
- Per-dock Inbox or per-dock command lists
- Four IDE tabs or per-dock `state.json`
- Global (user-home) skill scan as SoT
- Modeling runtime overlap (`.cursor` + `.agents` both loaded)
- Login, SSO, analytics beyond local usage counts
- IDE extensions
- `run` as a product feature

### Deferred

- Cross-platform GUI polish beyond macOS-first
- One skill filed onto many commands from the GUI
- Public command-template packs

## Open Questions

- Package name in this repo is `skil`. Confirm the name is free on npm before publish.
- Should mutating CLI verbs require `--ide`, or keep default `cursor`? **Phase 5:** mutate verbs have no dock flag. Push keeps `--to` default `cursor`.

### Success Metrics

**Month 1:** people connect a real repo, scan, and file at least one command  
**Month 3:** export + install used on more than one dock; usage counts glanced at  
**Month 6:** signal whether the linter / token wedge is worth building

### Distribution

- npm CLI (bin `skil`; `contextkit` alias)
- Electron app, same engine
- Site already at skil.website for the search/browse proxy
- `README.md` is the user-facing loop (scan → Inbox → file → copy / install / export to a dock)
