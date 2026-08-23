# skil Architecture

## Overview

**skil** (one L) is a map + inbox + skill deploy tool, plus command templates we generate.

It is a thin orchestration layer (CLI + GUI) over a connected repo. No login.

- **Skills** = folders that contain `SKILL.md`. Disk is the source of truth for the body.
- **Commands** = named groups of skill ids (SDLC knobs: `/build`, `/tdd`). Skills sit under them **in the app**, not as a folder tree.
- We **do not** scan or own the user's existing `commands/` files.

We are **not** SoT for skill file contents.  
We **are** SoT for: which skills exist in this project, their hashes, where we deployed them, and which skills sit on which command (after the user files them).

**Pull** = scan skills. **Push** = install skills and/or write our command template.

The class in the tree is still `CollectionEngine`. That is the deep module. This doc uses **Command** for the map grouping (today's `Collection`) and describes the target interface. Rename the class when it stops lying; do not split the module.

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

One deep module: the engine. Callers learn a small interface (scan, inbox, file, install, export). The implementation hides catalog merge, hashing, gone-id cleanup, command membership, deploy records, and stamped command-file writes.

**Deletion test:** delete the engine and that complexity reappears in CLI and GUI. Keep it in one place.

Do **not** split into Scanner + Map + Deployer. Those would be three shallow modules that always update together. One adapter of each kind already exists (real vs in-memory FS; real vs in-memory skills). That is enough.

**Supporting adapters**
- `FileSystemAdapter`: JSON state, directory walk, file read/write. Local-substitutable (real + in-memory).
- `SkillsAdapter`: skills.sh via our backend, `npx skills add`. True-external (nock / in-memory).
- `ConfigAdapter`: leftover team YAML. Not on the new pull/push loop.

### Testability

Accept dependencies, don't create them. Tests and callers cross the same seam.

**Primary seams:** engine public methods; adapter interfaces; CLI handlers; GUI via the bridge.

**Not seams:** persist helpers, `createEngine` forwarding a path, one-line search/browse pass-throughs.

## Module Boundaries

### 1. Engine (Deep Module)

**Interface (target):**

```typescript
type IDE = 'cursor' | 'claude' | 'windsurf' | 'agents'

interface SkilEngine {
  scan(): Result<ScanResult>                         // pull
  skills(): SkillRecord[]                            // inventory
  inbox(): string[]
  addToInbox(skillId: string): Result<string[]>
  removeFromInbox(skillId: string): Result<string[]>
  create(name: string, skillIds?: string[]): Result<Command>  // strips leading /
  delete(name: string): Result<void>
  list(): Command[]
  file(skillId: string, commandName: string): Result<Command>
  removeSkill(name: string, skillId: string): Result<Command>
  install(skillId: string, targetIDE: IDE): Promise<Result<SkillRecord>>
  exportCommand(name: string, targetIDE: IDE, opts?: { replace?: boolean }): Result<ExportResult>
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
}
```

**Invariants**
- A skill is a folder that contains `SKILL.md` (nested folders ok).
- Scan never creates commands and never moves folders.
- Inbox = skill ids not filed on any command. Scan puts new unfiled ids there. Discover Add does too.
- Filing updates the map only. Disk does not move.
- `removeSkill` updates the map only. It does not move the id to Inbox; a later scan will if the folder is still unfiled.
- `create('inbox')` is an error. Inbox is not a command. `create('/inbox')` is the same error.
- Command names store without a leading slash. `create('/build')` and `file(..., '/build')` normalize to `build`. UI may show `/build`.
- Re-scan refreshes the catalog. The map stays. If a folder is gone, drop that id from catalog, commands, and inbox, and report it.
- We never read the user's existing `commands/` trees to build the map.
- Export writes **our** command file. If a file exists and is not stamped by us, refuse unless `replace: true`.
- Install writes a skill folder into that IDE's skills dir and records the deploy. It does not write command files.

**Implementation responsibilities**
- Persist the map and catalog in `.skil/state.json`. Load falls back to `.contextkit/state.json` if the new file is missing. The next persist writes `.skil/` (no copy on load).
- Walk the four skill roots, hash `SKILL.md`, reconcile gone/changed/new.
- Coordinate `npx skills add` (or a copy into another IDE tree) and record `deployedTo`.
- Write stamped command markdown. Leave their old `/build.md` alone unless they opt in.

**Why deep:** CLI, GUI, and tests all call the same methods. Hash policy, gone-id cleanup, and stamp rules must not leak to the UI.

**Leftover methods** (still in the tree, not the product loop): `sync`, `convert`, `getCommand` / `run`, skillsmith `export`. Product export is `exportCommand`. CLI and GUI call `exportCommand`. Do not extend the leftover convert-all `export`.

### 2. FileSystemAdapter

**Interface (target):**

```typescript
interface FileSystemAdapter {
  readJSON<T>(path: string): Result<T>
  writeJSON<T>(path: string, data: T): Result<void>
  findSkillFolders(root: string): Result<string[]>  // dirs that contain SKILL.md; missing root → ok([])
  readFile(path: string): Result<string>
  writeFile(path: string, data: string): Result<void>
}
```

**Why this seam:** real + in-memory already exist. Walking and hashing are local-substitutable. Do not add a SkillScanner adapter (one implementation would be a fake seam).

**Skill definition stays in the engine.** The adapter only answers "which folders under `root` contain a file named `SKILL.md`" and reads/writes bytes. Engine assigns ids, hashes, and reconcile rules.

`findSkillFolders('.cursor/skills')` returns paths relative to the adapter root, nested, files ignored. A parent is a skill only if it has its own `SKILL.md`.

`writeFile` is for our command templates (and tests). Install of a remote id still goes through SkillsAdapter (`npx skills add`).

### 3. ConfigAdapter

Unchanged. Team `.contextkit.yml` sync is leftover, not part of pull/push. Do not design `.skil.yml` this phase.

### 4. SkillsAdapter

**Interface:**

```typescript
interface SkillsAdapter {
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  install(skillId: string, targetIDE: IDE): Promise<Result<void>>
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>  // leftover
  getInstalled(): Skill[]                                         // leftover
}
```

- `search` / `browse`: our Vercel backend + OIDC. No user API key. Browse is CDN-cached (`Cache-Control` on 200 only). Not a skil registry. Origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.
- `install`: `npx skills add <id> --agent <name>` with `cwd` = project root. Agent/IDE flag stays **inside** the adapter. Engine `install(skillId, targetIDE)` does not grow extra flags.

  | skil IDE | `--agent` (vercel-labs/skills) |
  |----------|--------------------------------|
  | cursor | `cursor` |
  | claude | `claude-code` |
  | windsurf | `windsurf` |
  | agents | `universal` |

  `agents` has no vercel name; `universal` is the documented agent that writes `.agents/skills/`. Vercel currently lists `cursor`'s project path as `.agents/skills/`, not `.cursor/skills/`. We still pass `--agent cursor`. Scan still walks `.cursor/skills/` (product contract). Confirm the write path when install is used on a real repo.
- Listing fields (`name`, `repo`, `installs`, …) stay in-memory. Never persist them on catalog records.

### 5. CLI (Thin)

Commander routes to the engine. No catalog logic here.

Target verbs:
- `skil scan` — pull
- `skil inbox` / `inbox add` / `inbox file <skillId> <command>`
- `skil create <name>` — empty command; `/build` stores `build`
- `skil delete <name>`
- `skil list`
- `skil add <command> <skillId>` / `skil remove <command> <skillId>` — map edits; remove does not auto-inbox
- `skil install <skillId> --to <ide>` — push a skill
- `skil export <command> --to <ide> [--replace]` — push our command file
- `skil search [query] [--trending]` — unchanged discover

Bin is `skil`. `contextkit` is an alias of the same entry. Help and product-loop errors say **command**, not collection. Engine method is `file` (was `fileToCollection`). `Collection` remains a type alias. GUI chrome says Commands. Window/title says skil.

### 6. GUI (Thin)

Same engine. No business logic in React.

**Connect:** folder picker (already on Sync). No login. Discover works with no folder. Scan and install/export need a connected repo (or CLI cwd). Window title and brand say **skil**.

**Tabs (target):**
- **Commands** — command list, Inbox (unfiled), file, create `/build`, delete, install, export
- **Discover** — skills.sh browse/search, Add → Inbox (does not install)
- **Sync** — pick / change folder only. Not a live merge.

After pick, the GUI calls `scan()` once. The Commands surface shows Inbox as unfiled inventory (scanned locals + Discover adds) — not a rail tab. Scan is disabled with a clear message when no folder is connected. Re-scan is the Scan button. Show gone ids from the last scan result (`role="status"`). Do not auto-create commands. Discover Add is unchanged (still no install).

**Install (Commands only):** a known skill (Inbox or filed on a command) has an IDE picker and Install. That calls `bridge.install(skillId, ide)` → `engine.install`. Failure is a visible `role="alert"` (not `sr-only`). Install is disabled until a folder is connected. Discover does not grow an Install control.

**Export (Commands only):** a command has an IDE picker and Export. That calls `bridge.exportCommand(name, ide)` → `engine.exportCommand`. Does not install skills. Unstamped existing file shows the engine error and a Replace confirm. Export is disabled until a folder is connected.

## User Flow

1. **Connect a repo.** No login.
2. **Scan** `.cursor` / `.claude` / `.windsurf` / `.agents` — **skills only.**
3. **Inventory.** Ungrouped skills sit in Inbox until filed.
4. **Organize.** Create `/build`, file `tdd` onto it. Map saves. Folders do not move.
5. **Discover → Inbox → file onto a command → install** writes the skill into that IDE's skills dir.
6. **Export** (explicit): write **our** command file (`skills:` + short steps + stamps). Do not touch their old `/build.md` unless they opt in to replace.
7. **Re-scan** = refresh the skill list. Map stays. If a folder is gone, drop that id and tell them.

## Data Model

### Catalog and map (`state.json`)

Schema **v4** (target):

```typescript
interface State {
  version: string              // "4.0"
  commands: Command[]          // was collections
  skills: SkillRecord[]        // catalog — we are SoT
  inbox: string[]              // unfiled ids
}

interface Command {
  name: string                 // "build" — display as /build
  skills: string[]             // catalog ids
  createdAt: string
}

interface SkillRecord {
  id: string                   // path relative to that IDE's skills root ("tdd", "ui/styling")
  hash: string                 // sha256 of SKILL.md (utf-8)
  paths: string[]              // folders we have seen, relative to project root
  deployedTo: Array<{ ide: IDE; path: string; installedAt: string }>
  source: 'local' | 'skills.sh'
}

interface ScanResult {
  added: string[]
  gone: string[]
  changed: string[]            // path still there, hash updated
}

interface ExportResult {
  succeeded: string[]
  failures: string[]
}
```

**Id rule:** id = path relative to the scanned skills root. Same id in two IDE trees is one catalog row with multiple `paths`. Nested `build/tdd/SKILL.md` → id `build/tdd`. If a slug exists only as a leaf, id is `tdd`.

**Load:** v3 `collections` → `commands`. Missing `skills` → `[]`. `installedSkills` is ignored (not the catalog). `inbox` missing → `[]`. v1 `activeCollection` still ignored.

**Hash:** `SKILL.md` only, not the whole folder. Disk stays SoT for the body; we store the hash so rescan can report `changed` and so export can stamp what we saw.

### Command file we write (push)

Target path by IDE:

| IDE | Skills (scan + install) | Our command file |
|-----|-------------------------|------------------|
| cursor | `.cursor/skills/` | `.cursor/commands/<name>.md` |
| claude | `.claude/skills/` | `.claude/commands/<name>.md` |
| windsurf | `.windsurf/skills/` | `.windsurf/workflows/<name>.md` |
| agents | `.agents/skills/` | `.agents/commands/<name>.md` |

We scan **skills** dirs only. We write commands dirs only on export.

```markdown
---
name: /build
skills:
  - tdd
  - design
generated_by: skil
generated_at: 2026-08-22T23:00:00.000Z
---

1. Use the skills listed in frontmatter when they apply.
2. Do not invent extra required steps.
```

Stamp = `generated_by: skil` in frontmatter. If the target file exists and lacks that stamp, `exportCommand` errors unless `replace: true`. If it is our file, we may rewrite frontmatter `skills:` and keep a short stub body (v1 does not merge their edits).

### Listing `Skill` (Discover)

Unchanged: skills.sh listing DTO. In-memory only. Not a catalog row until they Add (inbox) and later install (disk + `SkillRecord`).

## Key Technical Decisions

### Split SoT (map vs disk)

**Decision:** Disk owns skill bodies. skil owns the catalog, hashes, deploys, and command membership.

**Rationale:** Users already edit `SKILL.md` in the repo. If we copied bodies into state, we would drift and fight their editor. The map is what they cannot get from a file manager: what is filed on `/build`, what we deployed, what disappeared.

### Scan is pull, not import-as-command

**Decision:** `scan()` never upserts a command named `cursor` or `claude`. Unfiled skills go to Inbox.

**Rationale:** Commands are SDLC knobs the user creates. An IDE-named command would recreate the folder tree in the app — the thing we are not building.

### We do not scan `commands/` (or Windsurf `workflows/`)

**Decision:** Their `/planning.md` / `/build.md` are not ours. We do not parse, index, or overwrite them unless export `--replace` (or the file is stamped by us).

**Rationale:** Those files are their workflow text. Owning them makes skil a competing command manager. We generate **our** template when they ask.

### Export is a command file, not skillsmith convert

**Decision:** `exportCommand` writes one markdown command file. Skill install is a separate push.

**Rationale:** The old `export` converted every skill via skillsmith. That is not "command templates we generate." Convert/skillsmith stays leftover, not the loop.

### Install is push-to-an-IDE

**Decision:** `install(skillId, targetIDE)` writes the folder into that IDE's skills dir and appends `deployedTo`. Filing can happen before or after; the recommended flow is file then install.

**Rationale:** The map is IDE-agnostic. Disk layout is not. One skill can be deployed to more than one IDE.

### Project-local, no login

**Decision:** One connected folder (CLI = cwd, GUI = picker + `createEngine(root)`). No account. No last-folder file this phase.

### Leftovers stay leftover

`sync`, `run`, skillsmith `export`/`convert` remain in the tree until a cleanup task. They are not the product. Do not build Phase 8 `importFromIDE` or Phase 9 "export = fetch then convert."

## Test Strategy

**Unit (70%)** — engine: scan reconcile, file, gone ids, export stamp/replace, install deploy record. Adapters mocked.

**Integration (20%)** — CLI with in-memory engine; temp-dir FS for walk + hash.

**E2E (10%)** — GUI with real engine, fake adapters: connect → scan → inbox → create command → file → install/export.

**Agreed seams**
1. Engine: `scan`, `file`, `install`, `exportCommand`, inbox
2. `IFileSystemAdapter.findSkillFolders` / `readFile` / `writeFile`
3. `ISkillsAdapter.install(skillId, targetIDE)`
4. CLI `scan` / `install` / `export`
5. GUI via the bridge

**Not seams:** concatenating `.cursor/skills` in a standalone test if `findSkillFolders` already takes that root; `createEngine` wiring.

## Architecture Diagram

See `architecture-diagram.html` for the older collection/export picture. Treat this document as source of truth until that diagram is redrawn.

## Implementation Notes

### Dependency Injection

```typescript
class CollectionEngine {
  constructor(
    private fs: FileSystemAdapter,
    private config: ConfigAdapter,
    private skills: SkillsAdapter
  ) {}
}
```

Production wiring: `createEngine(projectRoot = process.cwd())`.

### Errors

`Result<T>` for expected failure. Persist failure rolls back in-memory state.

### State

Atomic JSON write. Schema version on every persist. v3 → v4 on load, no rewrite until the next mutation.

## Open Questions

1. One skill on many commands — the map allows it (`addSkill` / a second file). GUI this phase files from Inbox only.
2. npm package name is still `contextkit`. Bins are `skil` and `contextkit`. Publish-as-`skil` can wait if the name is taken.
3. After we rewrite a stamped file, do we preserve a user-edited body? v1 no. Revisit if people use export as a round-trip editor.
4. Team YAML sync — keep or delete. Not in this loop.

## Decision Log

- **README matches the loop (2026-08-22, Task 40):** User-facing README documents scan → Inbox → file → install and/or export. Primary bin is `skil`. No one-click install from Discover, no import-from-IDE, no skillsmith export, no team YAML / `run` / linter as product. Architecture + PRD stay the spec; README stays the loop.
- **State path and bin are skil (2026-08-22, Task 39):** Persist `.skil/state.json`. Load falls back to `.contextkit/state.json` with no copy until the next persist. Bins: `skil` + `contextkit` alias. API origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`. GUI title/brand say skil. Engine class and IPC stay `CollectionEngine` / `window.contextkit`.
- **Product is skil; groupings are commands (2026-08-22):** ContextKit / collections were the old names. User-facing language is skil + command. Engine class may stay `CollectionEngine` until a rename task. State target: `.skil/state.json`.
- **Map + inbox + deploy, not folder trees (2026-08-22):** Commands are named id lists. Skills stay where they are on disk. Inbox is the unfiled inventory (scan + Discover).
- **Pull = scan skills; push = install and/or write our command file (2026-08-22):** Re-scan is not a live merge. Export does not parse their `commands/`.
- **No SkillScanner adapter (2026-08-22):** Grow `IFileSystemAdapter`. Two FS adapters already make the seam real.
- **Export replaces symlink activation (historical):** Collections were never a single "active" slot. Still true for commands — there is no active command.
- **Skills search/browse via OIDC backend (resolved):** No user `SKILLS_API_KEY`. Browse is proxy + CDN, not a registry.
- **Discover details use listing fields (resolved):** No SKILL.md proxy, no GitHub stars.
- **Project root is adapter config (resolved):** `createEngine(projectRoot)`. GUI picker rebuilds the engine. No `chdir`.
- **Inbox is a field on State, not a command (resolved):** Reserved name `inbox`. Discover Add does not install.
- **CLI/engine words are command (2026-08-22, Task 32):** `fileToCollection` is `file`. `create('/build')` stores `build`. Product-loop help/errors say command. Leftover sync/export/run may still mention collection internally.
- **Install records catalog `deployedTo` (2026-08-22, Task 35):** `engine.install(skillId, targetIDE)` calls the adapter, then upserts `SkillRecord` (`source` stays `local` if already scanned, else `skills.sh`; `paths` + `deployedTo` for that IDE). Persist rolls back on write failure. Does not write command files and does not require the id to be filed. Leftover `installedSkills` / `getInstalled()` is not the catalog. CLI `install <skillId> --to <ide>` requires `--to` and rejects an unknown IDE before the engine.
- **Install agent flag lives in the adapter (2026-08-22, Task 34):** `ISkillsAdapter.install(skillId, targetIDE)`. Real adapter runs `npx skills add <id> --agent <name>` with cwd = project root. Claude is `claude-code`; our `agents` IDE uses vercel's `universal`. In-memory adapter records `(skillId, ide)`. Convert unchanged.
- **CLI/GUI export is our stamped file (2026-08-22, Task 38):** `skil export <command> --to <ide> [--replace]` and GUI Export call `exportCommand`. Help says this is our template, not skillsmith convert. GUI does not install skills. Unstamped existing file shows the engine error plus a Replace confirm. Export is disabled until a folder is connected. Leftover `engine.export` (convert-all) stays in the tree unused by CLI/GUI.
- **exportCommand writes our stamped file (2026-08-22, Task 37):** `exportCommand(name, targetIDE, { replace? })` writes markdown with `name`, `skills`, `generated_by: skil`, `generated_at`, and a short stub body. Unstamped existing file → error unless `replace: true`. Stamped files may be rewritten. Does not call `convert`. Windsurf path is `.windsurf/workflows/<name>.md` (Cascade workflows). Cursor / Claude use `commands/`. Agents has no documented command dir; we write `.agents/commands/<name>.md` next to `.agents/skills/`.
- **GUI install on Commands (2026-08-22, Task 36):** Inbox and filed skills pick an IDE and call `bridge.install(skillId, ide)` → engine. Error is a visible alert, not `sr-only`. Disabled until a folder is connected. Discover Add stays Inbox-only and does not grow Install. IDE picker includes `agents`.
- **GUI chrome says Commands (2026-08-22, Task 33):** Tab, headings, create/delete/export copy, and empty states say command. Filenames (`CollectionList.tsx`) and the `Collection` type alias stay. Discover Add is still Inbox-only.
- **GUI scans once after pick (2026-08-22, Task 31):** Pick folder calls `scan()`. Scan on Commands is the re-scan. Disabled until a folder is connected. Inbox is inventory on that surface, not a rail tab. Gone ids come from the last scan result.
- **GUI design system (resolved, Task 44):** oklch tokens, Geist, Phosphor, shared `FOCUS_RING`.

## Success Criteria

1. Scan a repo with nested `SKILL.md` folders and see them in Inbox without creating commands.
2. File onto `/build`; folders do not move; re-scan keeps the map.
3. Delete a skill folder, re-scan, that id is gone from map and the user is told.
4. Install writes into the target IDE skills dir and records `deployedTo`.
5. Export writes a stamped command file and will not clobber an unstamped `/build.md` without `--replace`.
6. CLI and GUI share the engine. Zero catalog logic in React.

## References

- Deep module design: `.cursor/skills/design/codebase-design/SKILL.md`
- TDD: `.cursor/skills/philosophy/tdd/SKILL.md`
- PRD: `docs/requirements/prd.md`
- User-facing loop: `README.md`
- Phase tasks: `tasks/todo2.md` Phase 11, `tasks/plan.md`
