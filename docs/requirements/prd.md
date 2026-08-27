# skil: Map + Inbox + Skill Deploy

## Problem Statement

Developers accumulate AI skills as folders (`SKILL.md`) across Cursor, Claude, Windsurf, and agents trees. Installation (`npx skills add`) and discovery (skills.sh) exist. What they lack is a **map**: which skills are on disk, which SDLC command they belong to **on each IDE** (`/build` on Cursor vs `/build` on Claude), and a way to push a skill or a generated command file without touching the skill body or hijacking their existing unstamped `commands/` markdown.

## Solution

**skil** (one L) is a thin CLI + desktop GUI over a connected repo. No login.

- **Skills** = folders with `SKILL.md`. Disk is truth for the body. We hash it; we do not own the text. One catalog, many `paths` / `deployedTo`.
- **Commands** = named groups of skill ids **per IDE**. Those are the SDLC knobs. `/build` can be Cursor `[tdd, design]` and Claude `[tdd]`. Skills sit under them **in the app**, not as a folder tree.
- **Inbox** = one global staging pool (scanned locals + Discover adds). Filing onto a command does not remove the id. Not per IDE.
- **Pull** = scan skills + stamped command files (that IDE's disk wins). Not unstamped `commands/`.
- **Push** = install a skill into an IDE skills dir, Copy to another IDE, and/or write **our** command template (`skills:` + Goal/Sequence/Rules comments + `## Skills` + stamps) and deploy filed skills that IDE is missing.

We are **not** SoT for skill file contents.  
We **are** SoT for: which skills exist here, hashes, where we deployed them, and which skills sit on which command **for which IDE**.

One `.skil/state.json`. No extra state file per IDE.

We wrap skills.sh (via skil's OIDC backend) and `npx skills add`. We do not host a marketplace. We do not scan or own their old unstamped `/build.md` unless they opt in to replace it.

## User Flow

1. **Connect a repo (optional).** No login. Skip and still use Discover / Inbox / Commands; first Save can pick a folder and bind it.
2. **Scan** `.cursor` / `.claude` / `.windsurf` / `.agents` — skills (catalog + Inbox) and stamped command files (per-IDE membership). Skill = folder with `SKILL.md` (nested ok).
3. **Show the inventory.** Scanned and Discover ids sit in one Inbox and stay there after filing.
4. **Organize on an IDE:** Open the Cursor card. Create `/build`, drop `tdd` on it. Cursor membership saves. Claude is unchanged.
5. **Copy to Claude** (one command or all): dest membership + stamped file + missing skill folders.
6. **Discover → Inbox → file onto a command → install** writes the skill into that IDE's skills dir.
7. **Export** (explicit, current IDE): generate **our** command file and deploy filed skills that IDE is missing. Do not touch their old `/build.md` unless they opt in to replace. Do not overwrite dest skill folders.
8. **Import** (Sync): copy one IDE's skills and stamped commands from another project into this folder. Add on top; warn then replace on conflict. Bound folder stays. Market inbox is not copied.
9. **Re-scan / light watcher** = refresh skills + stamped lists. Each IDE's disk wins that IDE only. Map does not copy the winner onto the other three.

## User Stories

1. As a developer, I want to connect a project folder with no account, so I can work on this repo only
2. As a developer, I want to scan my IDE skill trees and see every `SKILL.md` folder, so I know what is already on disk
3. As a developer, I want Inbox as a staging pool, so I can file the same skill onto commands without losing it from the list
4. As a developer, I want to create a named command (`/build`) **on the IDE I am viewing**, so I can group skills by SDLC step per tool
5. As a developer, I want to file a skill onto a command without moving folders, so the repo layout stays mine
6. As a developer, I want to remove a skill from a command without moving folders, so the map can change; Inbox still has the id unless the folder is gone
7. As a developer, I want to delete a command **from one IDE**, so the other IDEs keep their copy; skills on disk stay
8. As a developer, I want Discover (all-time / trending / typed search) without a folder, so I can browse before I connect
9. As a developer, I want Add from Discover to land in Inbox and not download, so install is a later choice
10. As a developer, I want to install a skill into a chosen IDE's skills dir, so push is explicit
11. As a developer, I want export to write **skil's** command file (`skills:` + Goal/Sequence/Rules comments + `## Skills` + stamps) and put filed skills in that IDE if they are missing, so the command is usable there
12. As a developer, I want export / copy to refuse an unstamped existing `/build.md` unless I say replace, so my old command text is safe
13. As a developer, I want re-scan to keep other IDEs' lists and drop ids whose folders are gone, so the inventory is honest
14. As a developer using several IDEs, I want one catalog and Inbox, and **per-IDE command lists**, so Cursor `/build` can differ from Claude `/build` without four tabs or four `state.json` files
15. As a developer, I want "Copy to Claude" (one command or all), so I can share a list without re-filing
16. As a power user, I want CLI for scan / inbox / file / copy / install / export, so I can script pull and push
17. As a visual user, I want a GUI to connect, scan, pick an IDE on Commands, file, copy, install, and export, so I am not stuck in the terminal
18. As a developer, I want search and browse without my own skills.sh API key
19. As a developer, I want an empty search to show all-time and trending, so I can browse without inventing a query
20. As a developer, I want a light disk watcher after write-through, so I do not have to hit Re-scan for every edit (debounce, mute our writes, skip `.git`)
21. As a developer, I want to import skills and stamped commands from another project on Sync, so I do not copy-paste folders by hand

## Implementation Decisions

### Core Architecture

- **Thin wrapper:** skil does not host skills or rewrite `SKILL.md`. Discover goes through skil's Vercel OIDC proxy. Install shells out to `npx skills add` (agent flag inside the adapter: cursor → `cursor`, claude → `claude-code`, windsurf → `windsurf`, agents → `universal`). The engine then records `deployedTo` on the catalog. Adapter failure does not persist a deploy. Filing is recommended first but not required.
- **Map, not trees:** Commands are id lists in our state, keyed by IDE. Disk folders do not move when you file.
- **Pull / push:** `scan` is pull. `install`, `copy`, and `export` are push. Re-scan is not a live merge.
- **No "active" command:** Nothing is switched on. You file on an IDE, then copy or export.

### Module Boundaries

1. **Engine** — scan, catalog, inbox, per-IDE commands, file, copy, install, export. One deep module (today `CollectionEngine`).
2. **FileSystemAdapter** — state JSON plus walk/read/write for `SKILL.md` discovery and command-file output.
3. **SkillsAdapter** — search, browse, install. Convert/skillsmith is leftover. Product export is engine `exportCommand`, not skillsmith.
4. **CLI** — parse and print.
5. **GUI** — bind to the engine. Header path + Re-scan when connected. Commands / Discover / Inbox / folder pick. IDE cards on Commands (click into a workspace).
6. **DiskWatch** — debounce / mute / skip `.git`. Calls scan + write-through. Not a second deep module.

### Market index (Discover backend, separate track — in progress)

Discover's browse/search today hits skills.sh live via `SkillsAdapter`. A **market index** — a curated Supabase copy (~20k skills), nested role → category → top 30 by installs — is being built as its own module (`MarketStore`, `MarketSync`, `MarketSkillsClient`; not the engine catalog). Full spec: `tasks/plan.md`; tasks: `tasks/todo.md`; module boundary: `docs/design/architecture.md` "Market Index sync (Discover backend)".

**Shipped:** sync core (listing crawl, detail hydrate, inactive reconciliation, shelf refresh) against an in-memory store — pure logic, fully tested, nothing user-visible yet.

**Not shipped:** Supabase persistence, `GET /api/market/*`, and the Landing/GUI role→category browsing this enables. Discover's current live All-time/Trending + search UX is unchanged until those land — see "Not in this phase" below.

### Data Model

See `docs/design/architecture.md` for the v5 shape (shipped).

```yaml
# conceptual — not a team sync file
commands:
  build:
    cursor: [tdd, design]
    claude: [tdd]
inbox:
  - some-unfiled-skill
```

State lives in `.skil/state.json`. Missing file → empty. Leftover `.contextkit/state.json` with no `.skil/` file is an error (move it). Project-local. CLI = cwd. GUI = picked folder.

v4 `commands[].skills` loads as Cursor membership. Other IDEs fill in via Copy or a stamped file on scan.

### Key Product Decisions

- **Inbox is not a command.** Reserved name. `create inbox` errors. One Inbox, not per IDE.
- **Command names have no leading slash.** `create /build` stores `build`. UI may still show `/build`.
- **CLI help/errors and GUI chrome say command, not collection.**
- **Connect scans once.** Pick folder (Sync) puts new skill ids in Inbox and pulls stamped command lists. Header shows the path and Re-scan only after a folder is bound. No folder → no header path, no Re-scan; Discover / Inbox / Commands still work.
- **Scan does not create `/cursor` or `/claude`.** That would be the folder tree again.
- **We do not scan unstamped `commands/` (or Windsurf `workflows/`).** Stamped files are ours: pull adopts `skills:` for **that IDE**. Write on Copy / Export / write-through. Stamp is `generated_by: skil`. Unstamped existing files need replace. Stamped re-writes refresh frontmatter + `## Skills`; Goal / Sequence / Rules stay unless `replace` is true.
- **Command-file paths:** cursor / claude / agents use `commands/<name>.md` under their root. Windsurf uses `.windsurf/workflows/<name>.md`.
- **No version pinning.** Catalog hash is content identity, not a lockfile.
- **Team YAML sync is leftover.** Not in this loop. No `.skil.yml` this phase.
- **`run` / shell templates are leftover.** "Command template" now means the markdown file we generate, not `skil run`.
- **README is the user-facing loop.** Scan → Inbox → file on an IDE → copy / install / export. Do not advertise leftover `sync` / `run` / convert, a marketplace, or a linter.
- **Inbox is a staging pool.** Filing does not remove the id. `remove` from a command does not remove it from Inbox either. Gone folders drop the id from both.
- **One state file, per-IDE lists.** Commands landing is IDE cards; click opens that list. No tab-per-IDE, no `.cursor/.skil/state.json`.
- **Write-through is per IDE.** File / unfile / create / delete on Cursor rewrite Cursor stamped files only.
- **Light watcher after write-through.** Disk edits: watcher scans and the GUI refreshes (debounce ~500ms, mute our writes ~1s, skip `.git`). Explicit Re-scan remains in the header for connect / nothing changed on disk. Unchanged stamps are not rewritten. Not a live 3-way merge. GUI main starts/stops `DiskWatch` after folder pick.

### CLI

- `skil scan` — pull; print added / gone / changed / command pulls
- `skil create <name> --ide <ide>` — `/build` stores `build`; `inbox` is reserved; `--ide` defaults to `cursor`
- `skil delete <name> --ide <ide>` — drop that IDE's membership
- `skil list [--ide <ide>]`
- `skil add <command> <skillId> --ide <ide>` / `skil remove <command> <skillId> --ide <ide>` — that IDE only; Inbox unchanged
- `skil inbox` / `inbox add <skillId>` / `inbox file <skillId> <command> --ide <ide>` — file onto a command; Inbox keeps the id
- `skil copy <command> --from <ide> --to <ide> [--replace]` / `skil copy --all --from <ide> --to <ide>`
- `skil install <skillId> --to cursor|claude|windsurf|agents` — records `deployedTo` on the catalog; unknown `--to` is rejected before the engine
- `skil export <command> --to <ide> [--replace]`
- `skil search [query] [--trending]`

Bin is `skil`. `contextkit` stays as an alias so old scripts work. The product name is skil.

API origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.

### GUI

- Window and brand say skil. Connect folder (Sync tab). No login. Header shows the bound path and Re-scan only after connect. Purple **Import** on Sync (disabled until connected) copies one IDE's skills and stamped commands from a recent folder or a chosen folder. Does not bind. Format chips default to Cursor. Conflicts warn then replace. Market inbox is not copied.
- Inbox tab (above Commands): Discover-like list (25 per page), search the staging pool, install from Inbox. Filing does not remove ids. One Inbox for all IDEs. No Scan icon; Inbox refreshes from `onScan`.
- Commands tab: landing is four IDE cards (counts, click to open). List/detail = that IDE. Create, file from Inbox, delete, install filed, export (download icon on Save), **Copy to** dest chips (one command or all). Do not add four tabs.
- Discover: All time / Trending, typed search, Add → Inbox, details from listing fields. No project re-scan control.
- Discover / Inbox / Commands do not require a folder. Scan needs a connected repo (header Re-scan, Sync pick, or CLI cwd).
- Pick folder on Sync scans once and binds. Header Re-scan is the explicit pull after that. Watcher also scans after debounce. There is no Scan-without-folder modal.
- Install: download icon, then pick IDE (cursor / claude / windsurf / agents), call `engine.install(skillId, ide)`. Inbox or Commands. Loading / success / failure is a modal. Failure alert is short; full error is collapsed Details. No connected folder → dest folder picker, then install there (does not bind)
- Copy on Commands: dest chips pick the other IDE, then Copy / Copy all, call `engine.copyTo` / `copyAll`. Writes dest stamped file and deploys missing skills. Unstamped dest file shows Replace. No connected folder → dest picker, write there, do not bind
- Export on Commands: push the **open IDE workspace** via the Save download icon, call `engine.exportCommand` / `exportAll`. Writes our stamped command file and deploys filed skills that IDE is missing (copy local; install Discover-only; skip dest that already exists). Loading / success / failure is a modal; failure details stay collapsed. Unstamped existing command file shows a Replace confirm (`replace: true`). No connected folder → dest picker, export, then bind that folder so header and Sync show it. Later Saves use the bound root.
- Discover Add still does not install and does not grow an Install control
- Gone ids and stamped-file pulls from the last scan show as a status banner
- No typed skill-id fields in the GUI (CLI can still take ids)

## Testing Decisions

- Test through the engine interface, not persist helpers
- Mock skills.sh and `npx skills add`
- Use an in-memory FS (or temp dirs) for scan / hash / gone / per-IDE membership / export stamp
- Do not require a real IDE to assert command-file contents
- DiskWatch tests use a fake clock (debounce / mute), not a real chokidar run

**Modules to test:** engine (scan, per-IDE file, copy isolation, importFrom add/replace, gone, install record, export stamp, disk-wins one IDE); FS walk; install adapter; CLI handlers; GUI via the bridge; DiskWatch debounce/mute.

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
- SQLite / eval library
- Stamps on `SKILL.md`
- Per-IDE Inbox
- Four IDE tabs or per-IDE `state.json`

### Deferred

- Cross-platform GUI polish beyond macOS-first
- One skill filed onto many commands from the GUI
- Public command-template packs

## Open Questions

- Package name in this repo is `skil`. Confirm the name is free on npm before publish.
- Should mutating CLI verbs require `--ide`, or keep default `cursor`? Shipped default `cursor` (Phase 13). Revisit if people want a required flag.

### Success Metrics

**Month 1:** people connect a real repo, scan, and file at least one command on one IDE  
**Month 3:** copy + install + export used on more than one IDE  
**Month 6:** signal whether the linter / token wedge is worth building

### Distribution

- npm CLI (bin `skil`; `contextkit` alias)
- Electron app, same engine
- Site already at skil.website for the search/browse proxy
- `README.md` is the user-facing loop (scan → Inbox → file on an IDE → copy / install / export)
