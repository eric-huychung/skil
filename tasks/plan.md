# Implementation Plan: skil (map + inbox + deploy)

## Overview

Turn the current collection/export app into **skil**: scan skills on disk, hold unfiled ids in Inbox, file them onto **commands** (the map), then **push** by installing a skill folder and/or writing **our** stamped command file. Disk stays SoT for `SKILL.md`. We stay SoT for catalog, hashes, deploys, and command membership.

Phase 7 inbox/file/delete is already in the tree. Phases 8–10 in `todo2.md` (import-as-IDE-collection, export-as-skillsmith-convert) are **superseded**. Do not implement them.

Tasks live in `tasks/todo2.md` Phase 11.

## Architecture Decisions

- **One deep module.** Keep today's engine. Do not add a Scanner or Deployer module. Grow `IFileSystemAdapter` (`findSkillFolders`, `readFile`, `writeFile`) — two FS adapters already make that seam real.
- **Command, not collection.** `State.commands`, type `Command`. Temporary `export type Collection = Command` so CLI/GUI typecheck while copy catches up.
- **Inbox = unfiled.** Scan adds new catalog ids to inbox if they are not on a command. Discover Add unchanged. Gone folder → drop id from catalog, commands, inbox, and report it.
- **Id = path relative to that skills root.** Same name in two IDEs is one row with multiple `paths`. Nested `ui/styling/SKILL.md` → `ui/styling`.
- **Hash = sha256 of SKILL.md** only. Update on rescan (`changed`); do not drop the map row.
- **Install takes `targetIDE`.** Agent flag stays inside `SkillsAdapter`. Engine records `deployedTo`.
- **Export writes our file.** Stamp `generated_by: skil`. Unstamped existing file → error unless `replace`. Does not scan `commands/`.
- **Leftovers:** `sync`, `run`, skillsmith `convert`/`export`. Do not extend. Full `contextkit` → `skil` identifier sweep is a late task, not a blocker for scan.
- **Engine class name** may stay `CollectionEngine` this phase (rename is XL across tests). Interface grows; the lie in the class name is acceptable until a dedicated rename.

## Task List

### Phase 11: Pull (scan)

- [ ] Task 28: FS `findSkillFolders` + `readFile` + `writeFile`
- [ ] Task 29: Engine catalog + `scan()` (schema v4, inbox for unfiled, gone/changed)
- [ ] Task 30: CLI `scan`
- [x] Task 31: GUI scan after connect + Inbox from disk + gone message

### Checkpoint: Pull

- [ ] Scan nested `SKILL.md` folders; no commands auto-created
- [ ] Re-scan keeps the map; gone ids dropped and reported
- [ ] Tests pass, build clean
- [ ] Review with human before install/export

### Phase 11: Organize

- [ ] Task 32: Command words in CLI (file, help, errors)
- [ ] Task 33: GUI Collections → Commands chrome

### Checkpoint: Organize

- [ ] Create `/build`, file `tdd`, folders do not move
- [ ] Inbox is unfiled only

### Phase 11: Push skills

- [x] Task 34: `SkillsAdapter.install(skillId, targetIDE)`
- [ ] Task 35: Engine install records deploy + CLI `--to`
- [ ] Task 36: GUI install

### Checkpoint: Push skills

- [ ] Discover Add still does not download
- [ ] Install writes into the target IDE skills dir
- [ ] `deployedTo` persisted

### Phase 11: Push command file

- [x] Task 37: Engine `exportCommand` (stamp, no clobber)
- [ ] Task 38: CLI + GUI export

### Checkpoint: Push templates

- [ ] Our file has `skills:` + `generated_by: skil`
- [ ] Unstamped `/build.md` is not overwritten without `--replace`

### Phase 11: Name + docs

- [x] Task 39: `.skil/state.json` + bin alias `skil`
- [ ] Task 40: README (architecture/PRD already updated)

### Checkpoint: Complete

- [ ] Flow: connect → scan → inbox → command → file → install and/or export
- [ ] No `importFromIDE`; no skillsmith export as the loop
- [ ] Human review before team-sync cleanup or linter work

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema v4 + Command rename breaks every state fixture | High | Alias `Collection = Command` for one task; migrate on load; one persist shape |
| `findSkillFolders` + scan + GUI in one sitting | High | Vertical but split: FS, then engine, then CLI, then GUI |
| Old Phase 8/9 get implemented by habit | High | Mark superseded in todo2; this plan is the index |
| Windsurf/agents command paths wrong | Med | Skills roots are fixed; confirm command dirs in Task 37 |
| Full product rename mid-feature | Med | Feature verbs first; bin/path rename last |
| `export()` tests still expect skillsmith convert | Med | Replace those tests when Task 37 lands; do not keep two exports |

## Open Questions

- Auto-scan once after GUI pick vs Scan-only button (plan: pick may scan once; button for re-scan)
- npm name `skil` availability
- Whether to delete `run` / `sync` in a later cleanup (not Phase 11)

## Parallelization

- **Sequential:** 28 → 29 → 30/31; 34 → 35 → 36; 37 → 38
- **After 29:** Task 32 (CLI words) can start while 31 (GUI scan) is in progress
- **Must not parallel:** two writers on `State` / engine persist
