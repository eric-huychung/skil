# skil: Map + Inbox + Skill Deploy

## Problem Statement

Developers accumulate AI skills as folders (`SKILL.md`) across Cursor, Claude, Windsurf, and agents trees. Installation (`npx skills add`) and discovery (skills.sh) exist. What they lack is a **map**: which skills are on disk, which SDLC command they belong to (`/build`, `/tdd`), and a way to push a skill or a generated command file without touching the skill body or hijacking their existing `commands/` markdown.

## Solution

**skil** (one L) is a thin CLI + desktop GUI over a connected repo. No login.

- **Skills** = folders with `SKILL.md`. Disk is truth for the body. We hash it; we do not own the text.
- **Commands** = named groups of skill ids. Those are the SDLC knobs. Skills sit under them **in the app**, not as a folder tree.
- **Inbox** = unfiled inventory (scanned locals + Discover adds).
- **Pull** = scan skills only (not `commands/`).
- **Push** = install a skill into an IDE skills dir, and/or write **our** command template (`skills:` + short steps + stamps).

We are **not** SoT for skill file contents.  
We **are** SoT for: which skills exist here, hashes, where we deployed them, and which skills sit on which command after they file them.

We wrap skills.sh (via skil's OIDC backend) and `npx skills add`. We do not host a marketplace. We do not scan or own their old `/build.md` unless they opt in to replace it.

## User Flow

1. **Connect a repo.** No login.
2. **Scan** `.cursor` / `.claude` / `.windsurf` / `.agents` — **skills only.** Skill = folder with `SKILL.md` (nested ok).
3. **Show the inventory.** Ungrouped until they file — that list is Inbox.
4. **Organize:** create `/build`, drop `tdd` on it. Saves the map. Folders do not move.
5. **Discover → Inbox → file onto a command → install** writes the skill into that IDE's skills dir.
6. **Export** (explicit): generate **our** command file. Do not touch their old `/build.md` unless they opt in to replace.
7. **Re-scan** = refresh the skill list. Map stays. If a folder is gone, drop that id and tell them.

## User Stories

1. As a developer, I want to connect a project folder with no account, so I can work on this repo only
2. As a developer, I want to scan my IDE skill trees and see every `SKILL.md` folder, so I know what is already on disk
3. As a developer, I want unfiled skills in Inbox, so I can sort them onto commands when I am ready
4. As a developer, I want to create a named command (`/build`), so I can group skills by SDLC step
5. As a developer, I want to file a skill onto a command without moving folders, so the repo layout stays mine
6. As a developer, I want to remove a skill from a command and see it back in Inbox, so unfiled stays true
7. As a developer, I want to delete a command, so the map can shrink; skills on disk stay
8. As a developer, I want Discover (all-time / trending / typed search) without a folder, so I can browse before I connect
9. As a developer, I want Add from Discover to land in Inbox and not download, so install is a later choice
10. As a developer, I want to install a skill into a chosen IDE's skills dir, so push is explicit
11. As a developer, I want export to write **skil's** command file (`skills:` + short steps + stamps), so I get a template I did not have to author
12. As a developer, I want export to refuse an unstamped existing `/build.md` unless I say replace, so my old command text is safe
13. As a developer, I want re-scan to keep my map and drop ids whose folders are gone, so the inventory is honest
14. As a developer using several IDEs, I want one map and per-IDE install/export, so I do not keep four copies of the filing
15. As a power user, I want CLI for scan / inbox / file / install / export, so I can script pull and push
16. As a visual user, I want a GUI to connect, scan, file, install, and export, so I am not stuck in the terminal
17. As a developer, I want search and browse without my own skills.sh API key
18. As a developer, I want an empty search to show all-time and trending, so I can browse without inventing a query

## Implementation Decisions

### Core Architecture

- **Thin wrapper:** skil does not host skills or rewrite `SKILL.md`. Discover goes through skil's Vercel OIDC proxy. Install shells out to `npx skills add` (agent flag inside the adapter: cursor → `cursor`, claude → `claude-code`, windsurf → `windsurf`, agents → `universal`). The engine then records `deployedTo` on the catalog. Adapter failure does not persist a deploy. Filing is recommended first but not required.
- **Map, not trees:** Commands are id lists in our state. Disk folders do not move when you file.
- **Pull / push:** `scan` is pull. `install` and `export` are push. Re-scan is not a live merge.
- **No "active" command:** Nothing is switched on. You file, then push what you want.

### Module Boundaries

1. **Engine** — scan, catalog, inbox, commands, file, install, export. One deep module (today `CollectionEngine`).
2. **FileSystemAdapter** — state JSON plus walk/read/write for `SKILL.md` discovery and command-file output.
3. **SkillsAdapter** — search, browse, install. Convert/skillsmith is leftover. Product export is engine `exportCommand`, not skillsmith.
4. **CLI** — parse and print.
5. **GUI** — bind to the engine. Commands / Discover / folder pick.

### Data Model

See `docs/design/architecture.md` for the full v4 shape.

```yaml
# conceptual — not a team sync file
commands:
  build:
    - tdd
    - design
inbox:
  - some-unfiled-skill
```

State lives in `.skil/state.json` (read-fallback `.contextkit/state.json` until rename). Project-local. CLI = cwd. GUI = picked folder.

### Key Product Decisions

- **Inbox is not a command.** Reserved name. `create inbox` errors.
- **Command names have no leading slash.** `create /build` stores `build`. UI may still show `/build`.
- **CLI help/errors and GUI chrome say command, not collection.**
- **Connect scans once.** Pick folder pulls unfiled skills into Inbox. The Scan button is re-scan. Disabled until a folder is connected.
- **Scan does not create `/cursor` or `/claude`.** That would be the folder tree again.
- **We do not scan `commands/` (or Windsurf `workflows/`).** We only write a command file on export. Engine method is `exportCommand`. Stamp is `generated_by: skil`. Unstamped existing files need replace.
- **Command-file paths:** cursor / claude / agents use `commands/<name>.md` under their root. Windsurf uses `.windsurf/workflows/<name>.md`.
- **No version pinning.** Catalog hash is content identity, not a lockfile.
- **Team YAML sync is leftover.** Not in this loop. No `.skil.yml` this phase.
- **`run` / shell templates are leftover.** "Command template" now means the markdown file we generate, not `skil run`.

### CLI (target)

- `skil scan` — pull; print added / gone / changed
- `skil create <name>` — `/build` stores `build`; `inbox` is reserved
- `skil delete <name>`
- `skil list`
- `skil inbox` / `inbox add <skillId>` / `inbox file <skillId> <command>` — engine method is `file`
- `skil install <skillId> --to cursor|claude|windsurf|agents` — records `deployedTo` on the catalog; unknown `--to` is rejected before the engine
- `skil export <command> --to <ide> [--replace]`
- `skil search [query] [--trending]`

Until the bin rename, the executable may still be `contextkit`. The product name is skil.

### GUI

- Connect folder (Sync tab). No login.
- Commands tab: Inbox, create command, file, delete, install, export, re-scan
- Discover: All time / Trending, typed search, Add → Inbox, details from listing fields
- Discover does not require a folder; scan / install / export do
- Inbox on Commands is the unfiled list (scan + Discover). Not a rail tab
- Scan is disabled (with copy) until a folder is connected. Pick folder scans once; the Scan button is re-scan
- Install on Commands: pick IDE (cursor / claude / windsurf / agents), call `engine.install(skillId, ide)`. Works from Inbox or a filed skill. Error is a visible alert, not `sr-only`. Disabled until a folder is connected
- Discover Add still does not install and does not grow an Install control
- Gone ids from the last scan show as a status banner
- No typed skill-id fields in the GUI (CLI can still take ids)

## Testing Decisions

- Test through the engine interface, not persist helpers
- Mock skills.sh and `npx skills add`
- Use an in-memory FS (or temp dirs) for scan / hash / gone / export stamp
- Do not require a real IDE to assert command-file contents

**Modules to test:** engine (scan, file, gone, install record, export stamp); FS walk; install adapter; CLI handlers; GUI via the bridge.

## Out of Scope

### Not in this phase

- Scanning or merging their existing `commands/` files
- Import that upserts a command named `cursor` / `claude`
- skillsmith bulk convert as "export"
- Skill authoring / editing `SKILL.md` in skil
- Marketplace or our own registry
- Team `.yml` sync as the core loop
- Last-folder persistence
- Live watch / auto-merge on disk change
- Token / fat-skill linter (later wedge, not this loop)
- Login, SSO, analytics
- IDE extensions
- Global (user-home) skill scan
- `run` as a product feature

### Deferred

- Cross-platform GUI polish beyond macOS-first
- npm bin fully `skil` if the name is taken (alias is enough)
- Preserving user edits on re-export of a stamped file
- One skill filed onto many commands from the GUI
- Public command-template packs

## Open Questions

- Is `skil` available as an npm bin name?

### Success Metrics

**Month 1:** people connect a real repo, scan, and file at least one command  
**Month 3:** install + export used on more than one IDE  
**Month 6:** signal whether the linter / token wedge is worth building

### Distribution

- npm CLI (bin `skil` or `contextkit` alias)
- Electron app, same engine
- Site already at skil.website for the search/browse proxy
