# skil Architecture

## Overview

**skil** (one L) is a map + inbox + skill deploy tool, plus command templates we generate.

It is a thin orchestration layer (CLI + GUI) over a connected repo. No login.

- **Skills** = folders that contain `SKILL.md`. Disk is the source of truth for the body. One catalog (`skills[]`), many `paths` / `deployedTo`.
- **Inbox** = one global staging pool. Not per IDE.
- **Commands** = named SDLC knobs (`/build`, `/tdd`). **Membership is per IDE** (M:N). `/build` can be Cursor `[tdd, design]` and Claude `[tdd]`. Skills sit under them **in the app**, not as a folder tree.
- We **do not** scan or own the user's unstamped `commands/` files.

We are **not** SoT for skill file contents.  
We **are** SoT for: which skills exist in this project, their hashes, where we deployed them, and which skills sit on which command **for which IDE** (after the user files them, copies them, or a stamped file wins on pull).

**Pull** = scan skills, then pull stamped command files per IDE (that IDE's disk wins). **Push** = install skills and/or write our command template for one IDE.

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

One deep module: the engine. Callers learn a small interface (scan, inbox, file, copy, install, export). The implementation hides catalog merge, hashing, gone-id cleanup, **per-IDE command membership**, deploy records, and stamped command-file writes.

Callers pass an `ide` into membership methods. They do **not** see a membership map. `list('claude')` returns `{ name, skills }` for Claude only.

**Deletion test:** delete the engine and that complexity reappears in CLI and GUI. Keep it in one place.

Do **not** split into Scanner + Map + Deployer. Those would be three shallow modules that always update together. One adapter of each kind already exists (real vs in-memory FS; real vs in-memory skills). That is enough.

**Supporting adapters**
- `FileSystemAdapter`: JSON state, directory walk, file read/write. Local-substitutable (real + in-memory).
- `SkillsAdapter`: skills.sh via our backend, `npx skills add`. True-external (nock / in-memory).
- `ConfigAdapter`: leftover team YAML. Not on the new pull/push loop.
- `DiskWatch` (thin, after write-through): debounce / mute / skip `.git`. Not a second deep module. Calls `scan()` then write-through for IDEs that already have a stamped file.

### Testability

Accept dependencies, don't create them. Tests and callers cross the same seam.

**Primary seams:** engine public methods; adapter interfaces; CLI handlers; GUI via the bridge; DiskWatch debounce/mute.

**Not seams:** persist helpers, `createEngine` forwarding a path, one-line search/browse pass-throughs.

## Module Boundaries

### 1. Engine (Deep Module)

**Interface:**

Membership methods take optional `ide` (default `'cursor'`) so old callers still hit the migrated Cursor list.

```typescript
type IDE = 'cursor' | 'claude' | 'windsurf' | 'agents'

interface SkilEngine {
  scan(): Result<ScanResult>                         // pull skills + stamped command files; then write-through
  skills(): SkillRecord[]                            // one catalog
  inbox(): string[]                                  // one global pool
  addToInbox(skillId: string): Result<string[]>
  removeFromInbox(skillId: string): Result<string[]>
  // leftover 3rd arg is the old shell template; ide defaults to cursor
  create(name: string, skillIds: string[], command?: string, ide?: IDE): Result<Command>
  delete(name: string, ide?: IDE): Result<void>      // drop that IDE only
  list(ide?: IDE): Command[]                         // that IDE's commands; skills = that list
  file(skillId: string, commandName: string, ide?: IDE): Result<Command>
  addSkill(name: string, skillId: string, ide?: IDE): Result<Command>
  removeSkill(name: string, skillId: string, ide?: IDE): Result<Command>
  copyTo(name: string, fromIde: IDE, toIde: IDE, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  copyAll(fromIde: IDE, toIde: IDE, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  install(skillId: string, targetIDE: IDE, opts?: { dest?: string }): Promise<Result<SkillRecord>>
  exportCommand(name: string, targetIDE: IDE, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  exportAll(targetIDE: IDE, opts?: { replace?: boolean; dest?: string }): Promise<Result<ExportResult>>
  lastWrittenPaths(): string[]                       // mute list for DiskWatch
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
}
```

`Command` returned to callers stays `{ name, skills, createdAt }`. `skills` is **that IDE's** list. Persist uses `membership` (see Data Model). GUI never reads the M:N map.

**Invariants**
- A skill is a folder that contains `SKILL.md` (nested folders ok).
- One Inbox. One `skills[]` catalog. Command membership is per IDE. No `.cursor/.skil/state.json`.
- Scan never creates commands from skill folders and never moves folders.
- Inbox = staging pool (scanned locals + Discover adds). Filing onto a command does **not** drop the id from Inbox. "Not on any command" is a UI filter, not a second list.
- Scan puts new ids in Inbox if they are not already there. Discover Add does too.
- Filing / unfiling / create / delete take an `ide`. They change **that IDE's** membership only.
- `create('build', [], undefined, 'cursor')` when `/build` already exists on Claude **adds** `membership.cursor` — not "already exists". "Already exists" only if that IDE already has the name.
- `delete('build', 'cursor')` drops Cursor membership (and Cursor's stamped file if it is ours). Claude's `/build` stays. Drop the command row when no IDE still has it.
- Filing (`file` / GUI `addSkill`) does not drop the id from Inbox. Inbox is the picker. "Not on any command" is a UI filter.
- `removeSkill` updates that IDE's list only. Inbox keeps the id. Gone folders drop the id from catalog, **every IDE's membership**, and Inbox.
- `create('inbox')` is an error. Inbox is not a command. `create('/inbox')` is the same error.
- Command names store without a leading slash. `create('/build', …)` and `file(..., '/build', ide)` normalize to `build`. UI may show `/build`.
- Re-scan refreshes the catalog. Same hash at a new path is a rename (keep membership, update the id) — not gone + added. If a folder is gone, drop that id and report it.
- We never read **unstamped** `commands/` trees to build the map.
- **Stamped** command file for an IDE ≠ that IDE's membership → **that IDE's disk wins** on pull. Report it once (`ScanResult.commandPulls`). Do not overwrite the other three IDEs. No silent 3-way merge.
- Write-through: file / unfile / create / delete on Cursor rewrite **Cursor** stamped files only. Other IDEs stay until Copy / Export.
- Copy (`copyTo` / `copyAll`) sets dest membership from source, writes the dest stamped file, and deploys missing skill folders (same rules as export). Unstamped dest file needs `replace: true`.
- Export writes **our** command file for that IDE's membership, then ensures filed skills exist in that IDE's skills dir. Dest folders that already have `SKILL.md` are left alone. Local folders are copied; Discover-only ids go through `install`. If a command file exists and is not stamped by us, refuse unless `replace: true` — no skill deploy in that case.
- Install writes a skill folder into that IDE's skills dir and records the deploy. It does not write command files.

**Implementation responsibilities**
- Persist the catalog, inbox, and per-IDE membership in `.skil/state.json`. Missing file → empty state. Leftover `.contextkit/state.json` with no `.skil/` file is an error (no fallback).
- Walk the four skill roots, hash `SKILL.md`, reconcile gone/changed/new/rename.
- On scan, parse stamped command files per IDE and adopt `skills:` into that IDE's membership when they disagree.
- Coordinate `npx skills add` (or a copy into another IDE tree) and record `deployedTo`.
- Write stamped command markdown for **one** IDE at a time. Leave dest skill folders that already exist.
- After a membership mutation, rewrite that IDE's stamped files (write-through). `lastWrittenPaths()` is the mute list for DiskWatch. `writeThrough` / `writeThroughAfterScan` live on the class, not the public interface; `scan()` calls the latter. After-scan write-through skips a stamp whose `skills:` list already matches that IDE's membership.

**Why deep:** CLI, GUI, and tests all call the same methods. Membership, hash policy, gone-id cleanup, and stamp rules must not leak to the UI.

**Leftover methods** (still in the tree, not the product loop): `sync`, `convert`, `getCommand` / `run`, skillsmith `export`. Product export is `exportCommand`. CLI and GUI call `exportCommand` / `copyTo`. Do not extend the leftover convert-all `export`.

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
  removeFile(path: string): Result<void>            // missing is ok
}
```

**Why this seam:** real + in-memory already exist. Walking and hashing are local-substitutable. Do not add a SkillScanner adapter (one implementation would be a fake seam).

**Skill definition stays in the engine.** The adapter only answers "which folders under `root` contain a file named `SKILL.md`" and reads/writes bytes. Engine assigns ids, hashes, membership, and reconcile rules.

`findSkillFolders('.cursor/skills')` returns paths relative to the adapter root, nested, files ignored. A parent is a skill only if it has its own `SKILL.md`.

`writeFile` is for our command templates (and tests). `copyDir` copies a local skill folder to another IDE tree. `listFiles` is how scan finds stamped command files. `removeFile` deletes our stamp on per-IDE delete. Install of a remote id still goes through SkillsAdapter (`npx skills add`).

### 3. ConfigAdapter

Unchanged. Team `.contextkit.yml` sync is leftover, not part of pull/push. Do not design `.skil.yml` this phase.

### 4. SkillsAdapter

**Interface:**

```typescript
interface SkillsAdapter {
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  install(skillId: string, targetIDE: IDE, opts?: { cwd?: string }): Promise<Result<void>>
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>  // leftover
  getInstalled(): Skill[]                                         // leftover
}
```

- `search` / `browse`: our Vercel backend + OIDC. No user API key. Browse is CDN-cached (`Cache-Control` on 200 only). Not a skil registry. Origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.
- `install`: `npx skills add <source> --agent <name> -y` with `cwd` = project root, or `opts.cwd` for a one-shot dest. 3-part skills.sh ids become `owner/repo@skill`. Agent/IDE flag stays **inside** the adapter.

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

Verbs:
- `skil scan` — pull skills + stamped command files
- `skil inbox` / `inbox add` / `inbox file <skillId> <command> --ide <ide>`
- `skil create <name> --ide <ide>` — empty command on that IDE; `/build` stores `build`
- `skil delete <name> --ide <ide>` — drop that IDE's membership
- `skil list [--ide <ide>]` — one IDE, or a compact per-IDE view
- `skil add <command> <skillId> --ide <ide>` / `skil remove <command> <skillId> --ide <ide>`
- `skil copy <command> --from <ide> --to <ide> [--replace]` / `skil copy --all --from <ide> --to <ide>`
- `skil install <skillId> --to <ide>` — push a skill
- `skil export <command> --to <ide> [--replace]` — push our command file and filed skills the target IDE is missing
- `skil search [query] [--trending]` — unchanged discover

Mutating command verbs take `--ide` (default `cursor` so old scripts still hit the migrated Cursor list). Unknown IDE is rejected before the engine.

Bin is `skil`. `contextkit` is an alias of the same entry. Help and product-loop errors say **command**, not collection. Engine method is `file` (was `fileToCollection`). `Collection` remains a type alias. GUI chrome says Commands. Window/title says skil.

### 6. GUI (Thin)

Same engine. No business logic in React.

**Connect:** folder picker (already on Sync). No login. Discover works with no folder. Scan needs a connected repo (or CLI cwd). Install/export/copy can write to a picked dest without binding. Window title and brand say **skil**.

**Tabs:**
- **Inbox** — one global staging pool (scan + Discover adds), re-scan, install from Inbox. Filing onto a command does not remove the id. Not per IDE.
- **Commands** — one tab. Landing is four IDE cards (Cursor / Claude / Windsurf / Agents) with command + unique skill counts. Click a card to open that IDE's workspace (list + detail). Create / file / delete / install apply to that IDE. **Copy to** is dest chips plus Copy / Copy all — writes stamped file + missing skill folders. Back returns to the cards. Do **not** add four IDE tabs.
- **Discover** — skills.sh browse/search, Add → Inbox (does not install)
- **Sync** — pick / change folder only. Not a live merge. No per-IDE `state.json`.

After pick, the GUI calls `scan()` once. Inbox is a rail tab above Commands. Scan without a folder opens a modal explaining it needs a connected project. Re-scan is the Scan button on Inbox. Show gone ids and `commandPulls` from the last scan result (`role="status"`). Do not auto-create commands from skill folders. Discover Add is unchanged (still no install).

**Install:** Inbox matches Discover (search + 25-per-page list). A download icon opens an IDE menu; picking an IDE calls `bridge.install(skillId, ide)` → `engine.install`. Same icon-then-pick on filed skills. Progress, success, and failure open a modal. Failure keeps a short `role="alert"`; the full message is in collapsed Details. No connected folder → dest picker, then `install(..., { dest })`. Discover does not grow an Install control.

**Copy (Commands):** from the open IDE workspace, dest chips pick the other IDE, then Copy (selected command) or Copy all. Calls `copyTo` / `copyAll`. Same stamp / replace / missing-skill rules as export. Unstamped existing dest file shows a Replace confirm.

**Export (Commands):** still available as push of the **current IDE's** membership (Save / export). Writes the command file, then copies local filed skills the target IDE is missing (or `install` for Discover-only ids). Dest skill folders already present are left alone. Loading / success / failure is a modal; failure details stay collapsed. Unstamped existing command file shows a Replace confirm. IDE picker stays enabled with no folder; Export then picks a dest and calls `exportCommand(..., { dest })` without binding the session.

**Watcher:** GUI main starts `DiskWatch` after folder pick (four `skills/` dirs plus command/workflow dirs). Debounce ~500ms, mute our writes ~1s, skip `.git`. Flush calls `scan()` (which write-throughs existing stamps) then mutes `lastWrittenPaths()`. Not a live 3-way merge. Not a CLI daemon.

## User Flow

1. **Connect a repo.** No login.
2. **Scan** `.cursor` / `.claude` / `.windsurf` / `.agents` — **skills** (catalog + Inbox) and **stamped command files** (that IDE's membership).
3. **Inventory.** Scanned and Discover ids sit in one Inbox. They stay there after filing.
4. **Organize on an IDE.** Open the Cursor card. Create `/build`, file `tdd` onto it. Cursor membership saves. Claude's `/build` is unchanged (or absent).
5. **Copy to Claude.** Writes Claude membership, Claude's stamped file, and missing skill folders.
6. **Discover → Inbox → file onto a command → install** writes the skill into that IDE's skills dir.
7. **Export** (explicit, current IDE): write **our** command file and deploy filed skills that IDE is missing. Do not touch their old `/build.md` unless they opt in to replace. Do not overwrite dest skill folders.
8. **Re-scan / watcher** = refresh skills + stamped lists. Each IDE's disk wins that IDE only.

## Data Model

### Catalog and map (`state.json`)

Schema **v5**:

```typescript
interface State {
  version: string              // "5.0"
  commands: CommandRecord[]    // membership by IDE
  skills: SkillRecord[]        // one catalog — we are SoT
  inbox: string[]              // one global staging pool
}

interface CommandRecord {
  name: string                 // "build" — display as /build
  membership: Partial<Record<IDE, string[]>>
  // e.g. { cursor: ['tdd', 'design'], claude: ['tdd'] }
  createdAt: string
}

/** View DTO from list(ide) — not persisted. */
interface Command {
  name: string
  skills: string[]             // membership[ide]
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
  commandPulls: Array<{ ide: IDE; name: string }>  // stamped file won for that IDE
}

interface ExportResult {
  succeeded: string[]
  failures: string[]
}
```

**Id rule:** id = path relative to the scanned skills root. Same id in two IDE trees is one catalog row with multiple `paths`. Nested `build/tdd/SKILL.md` → id `build/tdd`. If a slug exists only as a leaf, id is `tdd`.

**Load:** v4 `commands[].skills` → `membership: { cursor: skills }` (other IDEs empty until Copy or a stamped file wins on scan). v3 `collections` → `commands` first, then the same. Missing `skills` → `[]`. `installedSkills` is ignored (not the catalog). `inbox` missing → `[]`. v1 `activeCollection` still ignored.

**Hash:** `SKILL.md` only, not the whole folder. Disk stays SoT for the body; we store the hash so rescan can report `changed` and so export can stamp what we saw.

### Command file we write (push)

Target path by IDE:

| IDE | Skills (scan + install) | Our command file |
|-----|-------------------------|------------------|
| cursor | `.cursor/skills/` | `.cursor/commands/<name>.md` |
| claude | `.claude/skills/` | `.claude/commands/<name>.md` |
| windsurf | `.windsurf/skills/` | `.windsurf/workflows/<name>.md` |
| agents | `.agents/skills/` | `.agents/commands/<name>.md` |

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

1. Use the skills listed in frontmatter when they apply.
2. Do not invent extra required steps.
```

Stamp = `generated_by: skil` in frontmatter. If the target file exists and lacks that stamp, `exportCommand` / `copyTo` / write-through skip the file (map may still update) unless `replace: true`. If it is our file, we may rewrite frontmatter `skills:` and keep a short stub body (v1 does not merge their edits).

### Listing `Skill` (Discover)

Unchanged: skills.sh listing DTO. In-memory only. Not a catalog row until they Add (inbox) and later install (disk + `SkillRecord`).

## Key Technical Decisions

### Split SoT (catalog vs disk vs membership)

**Decision:** Disk owns skill bodies. skil owns the catalog, hashes, deploys, **and per-IDE command membership**. Stamped command files are a projection we will adopt on pull.

**Rationale:** Users already edit `SKILL.md` in the repo. The map is what they cannot get from a file manager: what is filed on Cursor's `/build` vs Claude's `/build`, what we deployed, what disappeared.

### Scan is pull, not import-as-command

**Decision:** `scan()` never upserts a command named `cursor` or `claude` from skill folders. New skill ids go to Inbox. Stamped `/build.md` updates membership for **that IDE only**.

**Rationale:** Commands are SDLC knobs the user creates. An IDE-named command would recreate the folder tree in the app — the thing we are not building.

### One catalog, per-IDE command membership (not four state files, not four tabs)

**Decision:** `.skil/state.json` is the only map. Inbox + `skills[]` stay global. `commands[].membership` is M:N by IDE. Commands landing is IDE cards; click opens that list. Copy writes the dest IDE. No `.cursor/.skil/state.json`.

**Rejected (this phase):** four IDE tabs. **Rejected:** per-IDE Inbox. **Rejected:** four taxonomies to merge.

**If Cursor `/test.md` and Claude `/test.md` disagree:** that is allowed. They are different memberships. Pull: each IDE's stamped file wins **that IDE**. Map does not copy the winner onto the other three.

**Rationale:** Filing once for every IDE was the old product and fought real repos (Cursor `/build` ≠ Claude `/build`). Per-IDE lists match disk. Copy is the explicit share. One catalog still avoids duplicating skill rows.

This **reverses** the 2026-08-24 "one map, not four memberships" decision.

### Write-through is per IDE

**Decision:** Create / file / unfile / delete in the Cursor workspace rewrite Cursor stamped files only. Claude / Windsurf / Agents stay until Copy or Export.

**Rationale:** A Cursor edit must not clobber Claude's `/build.md`.

### Inbox is a staging pool (still global)

**Decision:** Filing onto a command does not remove the id from Inbox. Gone folders still drop the id from Inbox and every IDE's membership. Inbox is not per IDE.

**Rationale:** Inbox is the picker. "Unfiled" is a filter. `file()` and GUI `addSkill` both keep the id.

### We do not scan unstamped `commands/` (or Windsurf `workflows/`)

**Decision:** Their unstamped `/planning.md` / `/build.md` are not ours. We do not parse, index, or overwrite them unless export/copy `--replace` (or the file is stamped by us).

**Rationale:** Those files are their workflow text. Owning them makes skil a competing command manager. We generate **our** template when they ask, and we adopt it on pull once stamped.

### Copy is membership + stamped file + missing skills

**Decision:** `copyTo` / `copyAll` set dest membership from source, write the dest command file, then deploy each filed skill the dest IDE is missing. Same skip / copy / install / replace rules as `exportCommand`.

**Rationale:** A command file that lists `tdd` is useless in Claude if `.claude/skills/tdd` is missing. Copy is the share action. Export remains push of the current IDE.

### Install is push-to-an-IDE

**Decision:** `install(skillId, targetIDE)` writes the folder into that IDE's skills dir and appends `deployedTo`. Filing can happen before or after; the recommended flow is file then install.

**Rationale:** The catalog is IDE-agnostic. Disk layout is not. One skill can be deployed to more than one IDE.

### Watcher is scan, not live merge

**Decision:** Watch the four skills dirs and the four command/workflow dirs. Debounce ~500ms. Mute paths we just wrote for ~1s. Skip `.git`. Then scan + write-through IDEs that already have a stamped file. Skip rewrite when the stamp already matches membership (including a stamp just adopted from disk). Gone-id cleanup that changed the list still rewrites. After a successful scan, GUI main notifies the window so lists refresh. Explicit Scan remains for connect / nothing-changed-on-disk.

**Rationale:** Explicit Scan is too easy to skip. A 3-way merge of map + disk + body edits is the next-phase trap. Disk wins that IDE; we tell them once.

### Project-local, no login

**Decision:** One connected folder (CLI = cwd, GUI = picker + `createEngine(root)`). No account. No last-folder file this phase.

### Leftovers stay leftover

`sync`, `run`, skillsmith `export`/`convert` remain in the tree until a cleanup task. They are not the product. Do not build Phase 8 `importFromIDE` or Phase 9 "export = fetch then convert."

## Test Strategy

**Unit (70%)** — engine: scan reconcile, per-IDE file/create/delete, copyTo isolation, gone ids, export stamp/replace, install deploy record, scan disk-wins one IDE. Adapters mocked.

**Integration (20%)** — CLI with in-memory engine; temp-dir FS for walk + hash + stamped pull; DiskWatch debounce/mute with fake clock.

**E2E (10%)** — GUI with real engine, fake adapters: connect → scan → open Claude card → empty or pulled list → Copy to Claude → Cursor list unchanged.

**Agreed seams**
1. Engine: `scan`, `list(ide)`, `file` / `create` / `delete` with `ide`, `copyTo` / `copyAll`, `install`, `exportCommand`, inbox
2. `IFileSystemAdapter.findSkillFolders` / `readFile` / `writeFile`
3. `ISkillsAdapter.install(skillId, targetIDE)`
4. CLI `scan` / `list --ide` / `copy` / `install` / `export`
5. GUI via the bridge (IDE cards → workspace, Copy dest chips, `onScan`)
6. DiskWatch: debounce, mute, skip `.git`

**Not seams:** concatenating `.cursor/skills` in a standalone test if `findSkillFolders` already takes that root; `createEngine` wiring; asserting the persisted `membership` object from the GUI.

## Architecture Diagram

See `docs/design/architecture-diagram.html` (modules + seams) and `docs/design/per-ide-membership.html` (one catalog, per-IDE lists, watcher).

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

Production wiring: `createEngine(projectRoot = process.cwd())`. Watcher lives in GUI main (and a small `DiskWatch` helper). It is not an engine constructor arg this phase.

### Errors

`Result<T>` for expected failure. Persist failure rolls back in-memory state.

### State

Atomic JSON write. Schema version on every persist. v4 → v5 on load, no rewrite until the next mutation.

## Open Questions

1. One skill on many commands **on the same IDE** — the map allows it (`addSkill` / a second file). GUI this phase files from Inbox only.
2. npm package name is still `contextkit`. Bins are `skil` and `contextkit`. Publish-as-`skil` can wait if the name is taken.
3. After we rewrite a stamped file, do we preserve a user-edited body? v1 no. Revisit if people use export as a round-trip editor.
4. Team YAML sync — keep or delete. Not in this loop.
5. `--ide` default `cursor` vs required flag. Shipped default `cursor` (Phase 13). Revisit if people want a required flag.

## Decision Log

- **Commands landing is IDE cards (2026-08-24):** One Commands tab. Overview cards show command + unique skill counts. Click opens that IDE's workspace. Copy bar is dest chips + Copy / Copy all. Not a Format dropdown. Still not four tabs.
- **Per-IDE command membership (2026-08-24, Phase 13, shipped):** One Inbox + one `skills[]`. Commands store `membership` by IDE. IDE cards on Commands, not four tabs. Copy writes dest stamped file + missing skills. Write-through is per IDE. Stamped pull: that IDE's disk wins; other IDEs untouched. Watcher after write-through. Reverses "one shared membership, prompt when Cursor and Claude disagree." Schema is v5 (`commands[].membership`); v4 `skills[]` loads as Cursor.
- **Not this phase (2026-08-24):** SQLite / eval library, stamps on `SKILL.md`, live 3-way merge, per-IDE Inbox.
- **README matches the loop (2026-08-22, Task 40):** User-facing README documents scan → Inbox → file → install and/or export. Primary bin is `skil`. No one-click install from Discover, no import-from-IDE, no skillsmith export, no team YAML / `run` / linter as product. Architecture + PRD stay the spec; README stays the loop.
- **No leftover state fallback (2026-08-24):** Only `.skil/state.json`. If that is missing and `.contextkit/state.json` is present, throw: move the file. CLI prints the message and exits; GUI folder pick shows an error and does not bind.
- **State path and bin are skil (2026-08-22, Task 39):** Persist `.skil/state.json`. Bins: `skil` + `contextkit` alias. API origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`. GUI title/brand say skil. Engine class and IPC stay `CollectionEngine` / `window.contextkit`.
- **Product is skil; groupings are commands (2026-08-22):** ContextKit / collections were the old names. User-facing language is skil + command. Engine class may stay `CollectionEngine` until a rename task. State target: `.skil/state.json`.
- **Inbox is a staging pool (2026-08-24):** Filing onto a command does not drop the id from Inbox. Scan still adds new ids. Gone folders still drop the id. `file()` and GUI `addSkill` both keep the id.
- **One catalog, IDE picker on Commands (updated 2026-08-24):** No per-IDE `state.json`, no IDE tabs. Membership is per IDE inside one file. Install/export/copy `--to` / IDE cards on Commands is how you see and push a specific tree.
- **Watcher after write-through (2026-08-24, shipped):** Explicit Scan remains (connect / nothing changed on disk). Write-through for GUI edits on the active IDE. Light watcher (debounce / mute / skip `.git`) is scan + write-through, not a live merge. Successful scan notifies the GUI to refresh. Unchanged stamps are not rewritten.
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
- **exportCommand writes our stamped file (2026-08-22, Task 37):** `exportCommand(name, targetIDE, { replace? })` writes markdown with `name`, `skills`, `generated_by: skil`, `generated_at`, and a short stub body. Unstamped existing file → error unless `replace: true`. Stamped files may be rewritten. Does not call `convert`. Windsurf path is `.windsurf/workflows/<name>.md` (Cascade workflows). Cursor / Claude use `commands/`. Agents has no documented command dir; we write `.agents/commands/<name>.md` next to `.agents/skills/`.
- **GUI install on Commands (2026-08-22, Task 36):** Inbox and filed skills pick an IDE and call `bridge.install(skillId, ide)` → engine. Error is a visible alert, not `sr-only`. Disabled until a folder is connected. Discover Add stays Inbox-only and does not grow Install. IDE picker includes `agents`.
- **GUI chrome says Commands (2026-08-22, Task 33):** Tab, headings, create/delete/export copy, and empty states say command. Filenames (`CollectionList.tsx`) and the `Collection` type alias stay. Discover Add is still Inbox-only.
- **Inbox install is icon-then-pick (2026-08-23):** No standing IDE dropdown. Download icon opens a menu (cursor / claude / windsurf / agents). Inbox layout matches Discover: search filters the pool, Scan is an icon.
- **Inbox is a rail tab above Commands (2026-08-23):** Staging pool, Scan, and Inbox install live on Inbox. Commands stays the command list plus the From Inbox file picker, filed install, and export.
- **GUI scans once after pick (2026-08-22, Task 31):** Pick folder calls `scan()`. Scan on Inbox is the re-scan. Disabled until a folder is connected. Gone ids come from the last scan result.
- **GUI design system (resolved, Task 44):** oklch tokens, Geist, Phosphor, shared `FOCUS_RING`.

## Success Criteria

1. Scan a repo with nested `SKILL.md` folders and see them in Inbox without creating commands from those folders.
2. File onto Cursor `/build`; Claude's `/build` is unchanged; Inbox still has the id; folders do not move.
3. Copy `/build` to Claude writes Claude's stamped file and missing skill folders; Cursor's file is not rewritten.
4. Delete a skill folder, re-scan, that id is gone from catalog, every IDE list, and Inbox, and the user is told.
5. Stamped Claude `/build.md` with a different `skills:` list wins for Claude on pull; Cursor membership stays.
6. Install writes into the target IDE skills dir and records `deployedTo`.
7. Export / write-through will not clobber an unstamped `/build.md` without `--replace` or overwrite an existing dest skill folder.
8. CLI and GUI share the engine. Zero catalog logic in React. IDE cards on Commands, not four tabs.
9. DiskWatch: two events inside 500ms become one scan; muted paths are ignored; `.git` is skipped.

## Not this phase

- SQLite / eval library
- Stamps on `SKILL.md`
- Live 3-way merge of map + disk + body
- Per-IDE Inbox
- Four IDE tabs or per-IDE `state.json`

## References

- Deep module design: `.cursor/skills/design/codebase-design/SKILL.md`
- TDD: `.cursor/skills/philosophy/tdd/SKILL.md`
- PRD: `docs/requirements/prd.md`
- User-facing loop: `README.md`
- Phase tasks: `tasks/todo2.md` Phase 13, `tasks/plan.md`
