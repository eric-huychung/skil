# skil tasks (was ContextKit refactor)

## Overview
Phases 1–7: OIDC browse, editable groups, folder picker, Inbox. **Current work is Phase 11:** map + scan + command file. Product spec: `docs/design/architecture.md`. Plan index: `tasks/plan.md`.

Phases 8–10 (import-as-IDE-collection, export-as-skillsmith) are superseded — see Status 2026-08-22.

## Phase 1: Backend Infrastructure

### Task 1: Add Vercel OIDC setup
**Description:** Create backend API routes for skills.sh proxy using Vercel OIDC token.

**Acceptance criteria:**
- [x] `@vercel/oidc` installed
- [x] `/api/skills/search` route proxies to skills.sh with OIDC
- [x] ~~`/api/skills/install` route proxies install requests~~ — dropped: skills.sh has no HTTP install endpoint, `install`/`convert` shell out locally (`npx skills add`/`skillsmith`) and need no OIDC token. See `docs/design/architecture.md` Decision Log.
- [x] Returns proper errors for missing/invalid tokens (`src/backend/skills-proxy.ts`, tested in `skills-proxy.test.ts`)

**Verification:**
- [x] API routes return skills from skills.sh
- [x] OIDC token is used in headers
- [ ] Local dev works with `vercel env pull` — needs a real Vercel deployment with OIDC Federation enabled to verify; not testable locally

**Dependencies:** None

**Files likely touched:**
- `app/api/skills/search/route.ts` (new)
- `app/api/skills/install/route.ts` (new)
- `package.json`

**Estimated scope:** Small (2-3 files)

---

### Task 2: Point CLI to Vercel backend
**Description:** Update SkillsAdapter to call Vercel backend instead of skills.sh directly.

**Acceptance criteria:**
- [x] CLI search calls your Vercel API (`CONTEXTKIT_API_URL`, defaults to `https://contextkit.dev`)
- [x] ~~CLI install calls your Vercel API~~ — dropped along with Task 1's install route; install runs `npx skills add` locally and was never affected by the proxy
- [x] No SKILLS_API_KEY required from user
- [x] Error handling for backend unavailability (`skills-adapter.test.ts`)

**Verification:**
- [x] `contextkit search` works without API key
- [x] `contextkit install` works (locally, via `npx skills add` — not "through the proxy", see above)
- [x] Error messages are clear

**Dependencies:** Task 1

**Files likely touched:**
- `src/adapters/skills-adapter.ts`

**Estimated scope:** Small (1 file)

---

## Phase 2: Collection Editing

### Task 3: Add collection add/remove to engine
**Description:** Implement `addSkill()` and `removeSkill()` in CollectionEngine with validation and persistence.

**Acceptance criteria:**
- [x] `addSkill(collection, skillId)` adds skill to existing collection
- [x] `removeSkill(collection, skillId)` removes skill from collection
- [x] Returns error if collection doesn't exist
- [x] Persists changes to state.json
- [x] Rollback on persist failure

**Verification:**
- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Can add skill to collection multiple times (idempotent)
- [x] Can remove skill that exists
- [x] No-op when removing non-existent skill

**Dependencies:** None

**Files likely touched:**
- `src/core/collection-engine.ts`
- `src/interfaces/engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (3 files)

---

### Task 4: Add CLI commands for add/remove
**Description:** Add `contextkit add` and `contextkit remove` commands that call the engine.

**Acceptance criteria:**
- [x] `contextkit add <collection> <skillId>` works
- [x] `contextkit remove <collection> <skillId>` works
- [x] Clear success/error messages
- [x] Help text documents both commands

**Verification:**
- [ ] Manual: create collection, add skill, verify in state.json — automated tests cover this; manual pass still worth doing before release
- [ ] Manual: remove skill, verify gone from state.json — same

**Dependencies:** Task 3

**Files likely touched:**
- `src/cli/commands/add.ts` (new)
- `src/cli/commands/remove.ts` (new)
- `src/cli/program.ts`

**Estimated scope:** Small (3 files)

---

## Phase 3: Command Templates

### Task 5: Add command field to Collection type
**Description:** Extend Collection type to include optional command template string.

**Acceptance criteria:**
- [x] Collection type has `command?: string`
- [x] Create command accepts `--command` flag
- [x] Command stored in state.json
- [x] Backwards compatible with existing collections

**Verification:**
- [x] Tests pass: `npm test`
- [x] Create collection with command flag works
- [x] Existing collections load without breaking

**Dependencies:** None

**Files likely touched:**
- `src/types/index.ts`
- `src/cli/commands/create.ts`
- `src/core/collection-engine.ts`

**Estimated scope:** Small (3 files)

---

### Task 6: Add run command
**Description:** Add `contextkit run <collection>` that executes the collection's command template.

**Acceptance criteria:**
- [x] `contextkit run <collection>` executes stored command
- [x] Error if collection has no command defined
- [x] Command runs in user's shell (inherits env)
- [x] Clear output from command execution

**Verification:**
- [ ] Manual: create collection with command, run it — automated test covers this; manual pass still worth doing before release
- [x] Error message clear when no command set

**Dependencies:** Task 5

**Files likely touched:**
- `src/cli/commands/run.ts` (new)
- `src/cli/program.ts`

**Estimated scope:** Small (2 files)

---

## Phase 4: Export Focus

### Task 7: Remove symlink logic
**Description:** Delete activate/deactivate commands and all symlink creation/removal code.

**Acceptance criteria:**
- [x] `activate()` and `deactivate()` removed from engine
- [x] `use` and `disable` CLI commands removed (and `status`)
- [x] Symlink helper methods removed
- [x] State no longer tracks activeCollection
- [x] Tests for removed features deleted

**Verification:**
- [x] Tests pass: `npm test`
- [x] Build succeeds: `npm run build`
- [x] No references to symlink or activate in `src/`, `api/`, or docs — **but the GUI (`gui/`) still called the removed `activate`/`deactivate`/`status` methods and failed `npm run typecheck`.** This wasn't in Task 7's file list because Task 7 only touched `src/`; fixed as Task 9 below.

**Dependencies:** None

**Files likely touched:**
- `src/core/collection-engine.ts`
- `src/interfaces/engine.ts`
- `src/cli/commands/use.ts` (delete)
- `src/cli/commands/disable.ts` (delete)
- `src/cli/program.ts`
- `src/types/index.ts`

**Estimated scope:** Medium (5+ files)

---

### Task 8: Add bulk export command
**Description:** Add `contextkit export <collections...> --to <ide>` that converts all skills in specified collections.

**Acceptance criteria:**
- [x] Accepts comma-separated collection names
- [x] Converts all skills in each collection to target IDE
- [x] Uses existing convert logic from SkillsAdapter
- [x] Reports success/failure per skill
- [x] Continues on single skill failure

**Verification:**
- [ ] Manual: export collection to cursor format — automated test covers this; manual pass still worth doing before release
- [ ] Manual: export multiple collections — same
- [x] Error handling for non-existent collections

**Dependencies:** Task 7

**Files likely touched:**
- `src/cli/commands/export.ts` (new)
- `src/core/collection-engine.ts`
- `src/interfaces/engine.ts`
- `src/cli/program.ts`

**Estimated scope:** Medium (4 files)

---

### Task 9: Fix GUI for the refactored engine, sync docs to match
**Description:** Task 7 removed `activate()`/`deactivate()`/`status()` from `ICollectionEngine`, but the Electron GUI (built in an earlier phase, before this refactor existed) still called all three end to end — IPC channels, main-process handlers, preload bridge, and `CollectionList`'s Activate/Deactivate UI. `gui`'s `npm run typecheck` failed with 5 errors. Fix the GUI to match the current engine, and bring `README.md`, `docs/design/architecture.md`, and `docs/requirements/prd.md` — all still describing the old symlink/activate model — back in line with what's actually built.

**Acceptance criteria:**
- [x] `ContextKitBridge`/`IPC_CHANNELS` drop `getStatus`/`activateCollection`/`deactivateCollection`, add `addSkillToCollection`/`removeSkillFromCollection`/`exportCollections`
- [x] `gui/src/main/index.ts` handlers call `engine.addSkill`/`removeSkill`/`export` instead of the removed methods
- [x] `CollectionList` UI: per-skill remove button, add-skill input, and an IDE-select + Export button per collection — no more Active/Deactivate concept
- [x] `README.md`, `architecture.md`, `prd.md` no longer describe symlinks, activate/deactivate, or a single "active" collection

**Verification:**
- [x] `npm --workspace gui run typecheck` passes
- [x] `npm --workspace gui test` passes (component tests for add/remove/export, plus the create → add → remove → export E2E test with a real engine)
- [x] `npm test` (root) still passes — engine/CLI untouched by this task

**Dependencies:** Task 7, Task 8

**Files touched:**
- `gui/src/shared/ipc.ts`, `gui/src/main/index.ts`, `gui/src/preload/index.ts`
- `gui/src/renderer/src/components/CollectionList.tsx` (+ `.test.tsx`)
- `gui/src/renderer/src/test-utils.tsx`, `gui/src/renderer/src/__tests__/e2e.test.tsx`
- `README.md`, `docs/design/architecture.md`, `docs/requirements/prd.md`

**Estimated scope:** Medium (10 files)

---

## Checkpoint: Complete (Phases 1–4)
- [x] All tests pass (root: 133/133, gui: 19/19)
- [x] CLI commands work end-to-end
- [x] OIDC auth functional
- [x] Collections editable
- [x] Export replaces activate (CLI and GUI)
- [x] README updated with new commands

---

## Phase 5: Leaderboard Browse

Empty search is a dead end: the GUI is a blank form, and `contextkit search` with no query hits `/api/skills/search` without `q` and 400s. Add all-time + trending browse through the existing OIDC proxy, cached on Vercel's CDN. Typed search and local `npx skills add` stay as they are.

Not in this phase: curated/hot, paging, skill file contents, local JSON/localStorage, Redis, Cron, a ContextKit marketplace (PRD: point at skills.sh, don't rebuild it).

**Seams under test (TDD — confirm before implementing):**
1. `browseSkills` / browse route handler in `src/backend/skills-proxy.ts` — skills.sh leaderboard HTTP + OIDC + Cache-Control on the Vercel response
2. `ISkillsAdapter.browse(view)` — ContextKit backend HTTP, maps to `Skill[]` (nock)
3. CLI `runSearch` — empty query / `--trending`, cap 10, installs column
4. GUI `SkillSearch` via `ContextKitBridge.browseSkills` — empty-state tabs, cap 20

Do **not** add tests whose only assertion is that `CollectionEngine.browse` forwards to the adapter (tautological). Engine grows a one-line pass-through so CLI/GUI stay engine-only, same as `search`.

**TDD:** red → green per task, at the seam above. No bulk-write-all-tests.

---

### Task 10: Proxy the skills.sh leaderboard with CDN cache headers
**Description:** Add `browseSkills(view, deps)` next to `searchSkills` in the skills-proxy module. New Vercel Function `GET /api/skills?view=all-time|trending` (file: `api/skills/index.ts`, alongside existing `api/skills/search.ts`) forwards to `https://skills.sh/api/v1/skills` with the same OIDC bearer token. Always request `per_page=20` from origin so CLI (display 10) and GUI (display 20) share one CDN key per view. On 200, set `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600`. Do not add these headers to the search route. Reject missing/invalid `view` with 400.

**Acceptance criteria:**
- [ ] `browseSkills` calls `https://skills.sh/api/v1/skills?view=<view>&per_page=20` with `Authorization: Bearer <oidc>`
- [ ] `GET /api/skills?view=all-time` and `?view=trending` return upstream `data` on success and set the CDN Cache-Control header
- [ ] Invalid or missing `view` → 400; skills.sh/network failure → 502 with the upstream message
- [ ] `/api/skills/search` is unchanged (still requires `q`, no leaderboard cache headers)

**Verification:**
- [ ] Tests pass: `npm test -- skills-proxy.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual (post-deploy): `x-vercel-cache` is HIT on a second `GET /api/skills?view=all-time` — not testable without a real Vercel deployment, same caveat as Task 1 OIDC

**Dependencies:** None (Phases 1–4 complete)

**Files likely touched:**
- `src/backend/skills-proxy.ts`
- `src/backend/skills-proxy.test.ts`
- `api/skills/index.ts` (new)

**Estimated scope:** Small (3 files)

---

### Task 11: TDD — SkillsAdapter.browse
**Description:** Extend the SkillsAdapter seam with `browse(view: 'all-time' | 'trending')`. Real adapter GETs `${CONTEXTKIT_API_URL}/api/skills?view=`. Map each hit to `Skill` including optional `installs` (search can keep omitting it). `InMemorySkillsAdapter` returns two distinct hardcoded lists so CLI/GUI tests can tell the views apart. Update any inline `ISkillsAdapter` fakes so typecheck still passes.

**Acceptance criteria:**
- [ ] `ISkillsAdapter` / `InMemorySkillsAdapter` / `SkillsAdapter` all have `browse(view)`
- [ ] Successful browse maps `{ id, installs }` → `{ id, source: 'skills.sh', installedAt: '', installs }`
- [ ] Backend 502/network error returns `Result` err (same style as search)
- [ ] `Skill.installs?: number` is optional so existing installed-skill records stay valid

**Verification:**
- [ ] Tests pass: `npm test -- skills-adapter.test.ts`
- [ ] `npm run typecheck` passes (inline adapter fakes include `browse`)
- [ ] Existing search tests still pass

**Dependencies:** Task 10

**Files likely touched:**
- `src/types/index.ts`
- `src/interfaces/adapters.ts`
- `src/adapters/skills-adapter.ts`
- `src/adapters/skills-adapter.test.ts`
- `src/adapters/in-memory-skills.ts`

**Estimated scope:** Medium (5 files)

---

### Task 12: TDD — `contextkit search` with no query browses the leaderboard
**Description:** Engine gets a one-line `browse(view)` pass-through (CLI must not call the adapter). Empty `contextkit search` shows all-time top 10; `--trending` shows trending top 10; a non-empty query is still typed search and ignores `--trending`. Table columns: Skill + Installs. Slice to 10 in the CLI layer (adapter/backend already return 20). Friendly empty and error messages, same as search.

**Acceptance criteria:**
- [ ] `ICollectionEngine.browse(view)` exists; `CollectionEngine` delegates to the adapter
- [ ] `contextkit search` (no query) lists all-time, at most 10 rows, includes install counts
- [ ] `contextkit search --trending` lists trending, at most 10 rows
- [ ] `contextkit search react` still calls `search('react')`, not browse
- [ ] Help text documents empty search and `--trending`

**Verification:**
- [ ] Tests pass: `npm test -- search.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: `npx contextkit search` and `npx contextkit search --trending` against a live backend (OIDC) — same Task 1 caveat

**Dependencies:** Task 11

**Files likely touched:**
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/cli/commands/search.ts`
- `src/cli/commands/search.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 13: TDD — GUI empty search shows All time / Trending
**Description:** Mirror `browse` on the Electron bridge (IPC + main + preload + test bridge). `SkillSearch` empty state fetches all-time on first visit to the panel (not app boot). Tabs: All time | Trending. Cap 20. Show install count. Typed search and Install stay as they are. After the first fetch of a view, keep it in component/main memory for that session so tab switches don't refetch; CDN already covers process restarts.

**Acceptance criteria:**
- [ ] `ContextKitBridge.browseSkills(view)` → `engine.browse(view)`
- [ ] Opening Search with an empty query renders all-time results (install count visible) without clicking Search
- [ ] Trending tab renders a different list (from InMemorySkillsAdapter's trending set)
- [ ] Existing typed-search and install tests still pass
- [ ] Loading and error states exist for browse, same as search

**Verification:**
- [ ] Tests pass: `npm --workspace gui test -- SkillSearch.test.tsx`
- [ ] `npm --workspace gui run typecheck` passes
- [ ] `npm test` (root) still passes

**Dependencies:** Task 12

**Files likely touched:**
- `gui/src/shared/ipc.ts`
- `gui/src/main/index.ts`
- `gui/src/preload/index.ts`
- `gui/src/renderer/src/test-utils.tsx`
- `gui/src/renderer/src/components/SkillSearch.tsx`
- `gui/src/renderer/src/components/SkillSearch.test.tsx`

**Estimated scope:** Medium (6 files)

---

### Task 14: Sync architecture, PRD, and README with browse
**Description:** Docs still describe search-only discovery. Record `browse` on the engine/adapter interfaces, the CDN-cached `/api/skills` route, empty-search CLI behavior, and GUI leaderboard tabs. Keep PRD out-of-scope items: no marketplace, no collection starter packs, no Redis/local cache. Add a Decision Log entry: leaderboard is a proxy + CDN cache, not a ContextKit registry.

**Acceptance criteria:**
- [ ] `docs/design/architecture.md`: `browse` on SkillsAdapter and CollectionEngine; search vs browse endpoints; Cache-Control on browse only; Decision Log entry
- [ ] `docs/requirements/prd.md`: user story for empty-state / no-query browse; CLI `search [query] [--trending]`; GUI All time / Trending; still "no marketplace"
- [ ] `README.md`: `contextkit search` / `search --trending` documented

**Verification:**
- [ ] Docs match the implemented commands and interfaces (no leftover "search-only" empty-query 400)
- [ ] No new product promises (cron, Redis, curated, paging)

**Dependencies:** Task 13

**Files likely touched:**
- `docs/design/architecture.md`
- `docs/requirements/prd.md`
- `README.md`

**Estimated scope:** Small (3 files)

---

## Checkpoint: After Phase 5
- [ ] All tests pass (root + gui)
- [ ] `contextkit search` with no query prints all-time top 10
- [ ] `contextkit search --trending` prints trending top 10
- [ ] `contextkit search <query>` still typed-searches
- [ ] GUI Search empty state shows All time / Trending with install counts
- [ ] Browse responses send CDN Cache-Control; search route does not
- [ ] Docs match; human review before implementing Cron/Redis

---

## Phase 6: Project Root

GUI currently constructs one `CollectionEngine` at main-process load (`gui/src/main/index.ts`). Relative paths (`.contextkit/state.json`) and `npx skills add` both follow Electron's cwd — the app, not the user's repo. CLI already means "this directory". Root the adapters and let the GUI rebuild the engine against a picked folder.

Not in this phase: last-folder persistence, GitHub remotes, putting the picker on the Sync tab.

**Seams under test:** `RealFileSystemAdapter` resolving paths against `root`; `SkillsAdapter` passing `cwd` to execa; GUI bridge `pickProjectFolder` / `getProjectRoot`. Do not test that `createEngine` forwards a string (tautological).

---

### Task 15: Root FS + skills adapters on `createEngine(projectRoot)`
**Description:** `createEngine(projectRoot = process.cwd())` constructs `RealFileSystemAdapter` and `SkillsAdapter` bound to that directory. Relative paths like `.contextkit/state.json` resolve under the root. `npx skills add` / `skillsmith` run with `execa` `cwd` set to the root. Absolute paths passed to the FS adapter stay absolute. CLI `src/cli/index.ts` can keep `createEngine()` (cwd default). Existing engine tests using `InMemoryFileSystemAdapter` stay path-as-given — no root required on the in-memory adapter.

**Acceptance criteria:**
- [x] `createEngine('/tmp/proj')` reads/writes `/tmp/proj/.contextkit/state.json`, not cwd
- [x] `SkillsAdapter.install` / `convert` invoke execa with `cwd` equal to that project root
- [x] `createEngine()` with no args keeps today's CLI behavior (cwd)
- [x] Absolute paths to `readJSON`/`writeJSON` are not prefixed again

**Verification:**
- [x] Tests pass: `npm test -- real-fs-adapter.test.ts skills-adapter.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Existing `npm test` (root) still passes — in-memory engine tests unchanged

**Dependencies:** None (Phase 5 independent)

**Files likely touched:**
- `src/create-engine.ts`
- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`
- `src/adapters/skills-adapter.ts`
- `src/adapters/skills-adapter.test.ts`

**Estimated scope:** Medium (5 files)

---

### Task 16: GUI folder picker rebuilds the engine
**Description:** Electron `dialog.showOpenDialog({ properties: ['openDirectory'] })` in main. On pick, replace the module-level `engine` with `createEngine(selectedPath)` and re-register nothing — handlers close over a `let engine`. Renderer shows Pick / Change on the **Sync** tab. Discover always shows the leaderboard. Collections shows its normal empty UI before a folder is connected (scratch workspace under `userData`). Session-only: do not write last path to disk.

**Acceptance criteria:**
- [x] `ContextKitBridge.pickProjectFolder()` opens a directory dialog and, on confirm, rebuilds the engine for that path
- [x] `getProjectRoot()` returns the bound path or `null` if none yet
- [x] Canceling the dialog leaves the previous engine (or none) unchanged
- [x] Sync tab shows Pick / Change folder; team-config copy stays as a separate card
- [x] Discover shows the leaderboard with no folder connected
- [x] Collections shows its empty UI with no folder connected
- [x] After pick, `listCollections` reads that project's `.contextkit/state.json`

**Verification:**
- [x] Tests pass: `npm --workspace gui test -- App.test.tsx`
- [x] `npm --workspace gui run typecheck` passes
- [ ] Manual: pick this repo, see existing collections if any; pick an empty temp dir, see none

**Dependencies:** Task 15

**Files likely touched:**
- `gui/src/shared/ipc.ts`
- `gui/src/main/index.ts`
- `gui/src/preload/index.ts`
- `gui/src/renderer/src/App.tsx`
- `gui/src/renderer/src/test-utils.tsx`
- `gui/src/renderer/src/App.test.tsx`

**Estimated scope:** Medium (6 files — one GUI vertical slice; do not split IPC from Sync)

---

## Checkpoint: After Phase 6
- [x] `npm test` and `npm --workspace gui test` pass
- [x] CLI from a project dir still uses that dir
- [x] GUI can bind to a folder without `chdir`
- [x] Review with human before Inbox UI copy — 2026-08-21, see below

---

## Human review: after Phase 6 (2026-08-21)

Phase 6 is done (folder picker + scratch workspace + Discover browse with no folder). Inbox is not. The four GUI notes are one slice — that is Phase 7. Import / export-fetch / docs wait.

Restart `gui:dev` after main-process edits (no HMR). Do not copy the `context-kit/` mock: its Add dumps onto the selected collection; ours is Inbox then file. No auto-named collections. No typed skill IDs in the GUI.

---

## Phase 7: Inbox + Collections chrome

One vertical slice. Inbox is a holding list of skill IDs on `State` (`inbox: string[]`, schema v3, missing → `[]`). Not a collection, not a download. Discover Add writes Inbox. Collections: name-only create modal, delete, Inbox list → file into a named collection. CLI stays thin over the same engine methods.

**Seams under test:** engine `addToInbox` / `inbox` / `removeFromInbox` / `fileToCollection` / `delete`; CLI with in-memory engine; GUI via the bridge. Do not test persist-helper internals. Do not disable Add when no folder is picked — write to `currentEngine()` (scratch or picked).

**Not in this phase:** GitHub, last-folder persistence, mock Add-to-active-collection, `npx skills add` from Discover, skill IDs in the create modal.

---

### Task 17: Engine — inbox, file, delete
**Description:** `State.inbox`. `addToInbox` / `inbox` / `removeFromInbox` as already specified (idempotent add, no-op remove, missing field → `[]`, `create('inbox')` errors). `fileToCollection(skillId, collectionName)` moves one Inbox ID into an existing collection (one persist, rollback on failure; error if collection missing or ID not in inbox; already-in-collection still drops from inbox). `delete(name)` removes a collection; missing name is an error; deleting the last collection is allowed. None of these call `install`.

**Acceptance criteria:**
- [ ] `addToInbox('obra/react-patterns')` persists under `.contextkit/state.json` `inbox`; duplicates stay one entry
- [ ] `create('inbox', [])` errors; old state without `inbox` loads as `[]`
- [ ] Filing into `frontend` moves the ID; missing collection / ID not in inbox errors and leaves state unchanged
- [ ] `delete('frontend')` removes it; last collection may be deleted; write failure rolls back
- [ ] In-memory `install` call count stays 0

**Verification:**
- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Build succeeds: `npm run build`

**Dependencies:** None

**Files likely touched:**
- `src/types/index.ts`
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium

---

### Task 18: CLI — inbox + delete
**Description:** `contextkit inbox` lists IDs. `inbox add <skillId>` / `inbox file <skillId> <collection>`. `contextkit delete <name>`. Help: Inbox is a holding list; Export (not inbox) downloads. No `staging` alias.

**Acceptance criteria:**
- [ ] The four commands work against the engine; errors print
- [ ] `contextkit --help` lists inbox and delete; no "staging" in CLI source

**Verification:**
- [ ] Tests pass: `npm test -- inbox.test.ts` (and a small delete CLI test)
- [ ] Build succeeds: `npm run build`

**Dependencies:** Task 17

**Files likely touched:**
- `src/cli/commands/inbox.ts` (new) + test
- `src/cli/commands/delete.ts` (new) + test
- `src/cli/program.ts`

**Estimated scope:** Small

---

### Task 19: GUI — Discover Add, create modal, Inbox file, delete
**Description:** Discover row is Add → `addToInbox`, copy Add / Added, visible errors (not `sr-only`). Drop `installSkill` from the bridge. Collections: Create opens a name-only modal (`create(name, [])`); trash on the detail header confirms then `delete`; Inbox list with File into a named collection. Remove typed "skill id" inputs. CLI `contextkit add` can stay; GUI does not type IDs.

**Acceptance criteria:**
- [ ] Add on a browse/search row lands in Inbox and does not call `install`; duplicate Add is fine
- [ ] Create fields are hidden until Create is clicked; submit makes an empty collection; cancel does not
- [ ] Trash deletes the selected collection (empty list is ok)
- [ ] Inbox IDs show on Collections; File moves them into a named collection
- [ ] No `installSkill` on `ContextKitBridge`; no typed skill-id fields left

**Verification:**
- [ ] Tests pass: `npm --workspace gui test`
- [ ] `npm --workspace gui run typecheck` passes
- [ ] Manual: Add from Discover → create `frontend` → file → see it on the collection (export still does not download in this phase)

**Dependencies:** Task 17

**Files likely touched:**
- `gui/src/shared/ipc.ts` / main / preload / test-utils
- `gui/src/renderer/src/components/SkillSearch.tsx` + test
- `gui/src/renderer/src/components/CreateCollectionForm.tsx` + test
- `gui/src/renderer/src/components/CollectionList.tsx` + test
- `gui/src/renderer/src/App.tsx`

**Estimated scope:** Medium (one GUI vertical slice)

---

## Checkpoint: After Phase 7
- [x] Discover Add → Inbox, no download — landed in engine/CLI/GUI (boxes on Tasks 17–19 were stale)
- [x] Create is a name-only modal; delete trash works; skills come from Inbox
- [x] `create inbox` is rejected
- [x] CLI inbox + delete work

---

## Status (2026-08-22)

Product is now **skil** (one L): map + inbox + skill deploy + generated command files. Spec: `docs/design/architecture.md`, `docs/requirements/prd.md`. Plan: `tasks/plan.md`.

Phase 7 is in the tree. **Phases 8–10 are superseded** (old task text is in git history). Do not implement `importFromIDE`, export-as-fetch+skillsmith, or the old docs task. Next work is Phase 11.

---

## Phases 8–10 — superseded

Old plan: one-IDE import into a `cursor`/`claude` collection; export = `npx skills add` then skillsmith convert.

That fights the new loop: scan skills only → Inbox → file onto a **command** → install writes a skill folder; export writes **our** command file. We do not scan `commands/`.

Tasks 21–27 are not to be implemented as written. Old task text is in git history.

---

## Phase 11: skil map + pull + push

One engine. Disk is SoT for `SKILL.md`. We are SoT for catalog, hashes, deploys, command membership.

**Pull** = `scan`. **Push** = `install` and/or `exportCommand`.

**Seams:** engine `scan` / `file` / `install` / `exportCommand`; `IFileSystemAdapter.findSkillFolders` + `readFile` + `writeFile`; `ISkillsAdapter.install(skillId, targetIDE)`; CLI handlers; GUI via the bridge. Do not add a Scanner adapter. Do not test `createEngine` string-forwarding.

**Not in this phase:** import-as-command, skillsmith export, team YAML, `run`, scanning `commands/`, full identifier sweep of every `contextkit` string (Task 39 is path + bin only), token linter.

**TDD:** red → green per task at the seam above.

---

### Task 28: FS — find `SKILL.md` folders + read/write bytes
**Description:** Grow `IFileSystemAdapter` so scan and export do not pretend the disk is JSON-only. `findSkillFolders(root)` walks nested dirs and returns relative paths of folders that contain a file named `SKILL.md`. Missing root → `ok([])`. File-at-root → error. `readFile` / `writeFile` for hashing and command-file output. In-memory adapter: seedable files + dirs (not only JSON maps).

**Acceptance criteria:**
- [ ] Real adapter finds nested `a/b` when `a/b/SKILL.md` exists and does not treat parent `a` as a skill unless `a/SKILL.md` exists
- [ ] Missing root is `ok([])`, not an error
- [ ] `readFile` / `writeFile` work relative to the adapter root; absolute paths stay absolute
- [ ] In-memory adapter can seed `.cursor/skills/tdd/SKILL.md` for engine tests

**Verification:**
- [ ] Tests pass: `npm test -- real-fs-adapter.test.ts in-memory.test.ts`
- [ ] Build succeeds: `npm run typecheck`
- [ ] Other `IFileSystemAdapter` fakes compile

**Dependencies:** Task 15 (rooted paths)

**Files likely touched:**
- `src/interfaces/adapters.ts`
- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`
- `src/adapters/in-memory-fs.ts`
- `src/adapters/in-memory.test.ts`

**Estimated scope:** Medium (5 files)

---

### Task 29: Engine — catalog + `scan()` (schema v4)
**Description:** Persist `commands` (was `collections`), `skills: SkillRecord[]`, `inbox`. Load v3: `collections` → `commands`, missing `skills` → `[]`. Id = path relative to that IDE's skills root. Hash = sha256 of `SKILL.md`. `scan()` walks `.cursor/skills`, `.claude/skills`, `.windsurf/skills`, `.agents/skills` only. New unfiled ids → inbox. Already-on-a-command → stay filed. Gone from all `paths` → drop id from catalog, commands, inbox; list it in `ScanResult.gone`. Hash change → update hash, `changed`. Do not create commands. Do not read `commands/`. Keep `export type Collection = Command` so CLI/GUI still typecheck.

**Acceptance criteria:**
- [ ] Scan of `.cursor/skills/tdd/SKILL.md` yields catalog id `tdd`, hash set, id in inbox
- [ ] Nested `.cursor/skills/ui/styling/SKILL.md` → id `ui/styling`
- [ ] Same id under `.cursor` and `.claude` is one row with two `paths`
- [ ] Re-scan after filing keeps the command map; gone folder drops the id and reports it
- [ ] Empty / missing skill trees succeed; `commands/` files are ignored

**Verification:**
- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] `install` call count stays 0

**Dependencies:** Task 28

**Files likely touched:**
- `src/types/index.ts`
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 30: CLI `scan` (pull)
**Description:** `contextkit scan` (help may say `skil scan`) calls `engine.scan()`. Print added / gone / changed counts and ids. Empty is success. Help: skills only, map stays, this is pull, not team sync.

**Acceptance criteria:**
- [ ] Scan prints a friendly empty message when nothing is found
- [ ] Gone ids are visible in output
- [ ] Invalid extra flags do not call the engine
- [ ] Help does not say import or collection-from-IDE

**Verification:**
- [ ] Tests pass: `npm test -- scan.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: run scan in this repo (has `.cursor/skills`)

**Dependencies:** Task 29

**Files likely touched:**
- `src/cli/commands/scan.ts` (new)
- `src/cli/commands/scan.test.ts` (new)
- `src/cli/program.ts`

**Estimated scope:** Small (3 files)

---

### Task 31: GUI — scan, inventory in Inbox, gone banner
**Description:** After a folder is picked, call `scan()` (once on pick is ok). Commands surface shows Inbox = unfiled (scanned + Discover). Re-scan control. Show `gone` from the last result. Do not auto-create commands. Discover Add unchanged (still no install).

**Acceptance criteria:**
- [x] Pick this repo → Inbox lists scanned skill ids that are not on a command
- [x] Re-scan after deleting a fixture folder surfaces a gone message
- [x] No folder: Discover still works; Scan is disabled or no-ops with a clear message
- [x] Existing Discover Add / file tests still pass

**Verification:**
- [x] Tests pass: `npm --workspace gui test -- App.test.tsx CollectionList.test.tsx`
- [x] `npm --workspace gui run typecheck` passes
- [ ] Manual: pick this repo, see Inbox, restart `gui:dev` after main-process edits

**Dependencies:** Task 16, Task 29

**Files likely touched:**
- `gui/src/shared/ipc.ts`
- `gui/src/main/index.ts`
- `gui/src/preload/index.ts`
- `gui/src/renderer/src/test-utils.tsx`
- `gui/src/renderer/src/App.tsx` and/or `CollectionList.tsx` (+ tests)

**Estimated scope:** Medium (one GUI vertical slice)

---

## Checkpoint: After Tasks 28–31 (pull)
- [x] Nested skills scan; Inbox unfiled; no auto commands
- [x] Re-scan keeps map; gone ids reported
- [x] `npm test` and `npm --workspace gui test` pass
- [ ] Review with human before Command chrome / install

---

### Task 32: CLI/engine words — command, not collection
**Description:** User-facing CLI: command not collection. `fileToCollection` → `file` (or `fileToCommand` on the engine; CLI `inbox file <id> <command>`). Errors and `--help` say command. Strip a leading `/` on create (`/build` → `build`). Keep the `Collection` type alias. Do not rename every GUI file in this task.

**Acceptance criteria:**
- [x] `create inbox` still errors
- [x] `create /build` stores name `build`
- [x] Help/errors do not teach "collection" as the product word
- [x] Existing inbox file tests updated and passing

**Verification:**
- [x] Tests pass: `npm test -- inbox.test.ts create.test.ts delete.test.ts program.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 29

**Files likely touched:**
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/cli/commands/*.ts` (copy + create)
- `src/cli/program.ts`

**Estimated scope:** Medium (≤5 files if you only touch help + file + create; do not rename GUI)

---

### Task 33: GUI — Commands chrome
**Description:** Tab and copy say Commands. Create modal is still name-only (`/build` ok). Inbox file target is a command. Do not rename `CollectionList.tsx` unless you have room; labels matter more than the filename.

**Acceptance criteria:**
- [x] No user-visible "Collections" as the product word
- [x] Create `/build`, file from Inbox, delete still work
- [x] Discover Add still Inbox-only

**Verification:**
- [x] Tests pass: `npm --workspace gui test`
- [x] `npm --workspace gui run typecheck` passes

**Dependencies:** Task 32

**Files likely touched:**
- `gui/src/renderer/src/App.tsx`
- `gui/src/renderer/src/components/CollectionList.tsx` (+ test)
- `gui/src/renderer/src/components/CreateCollectionForm.tsx` (+ test)

**Estimated scope:** Medium

---

## Checkpoint: After Tasks 32–33 (organize)
- [x] `/build` + file `tdd`; folders do not move
- [x] Inbox = unfiled only

---

### Task 34: Adapter `install(skillId, targetIDE)`
**Description:** `ISkillsAdapter.install` takes a target IDE. Real adapter: `npx skills add` with `cwd` = project root and the agent flag **inside** the adapter. In-memory adapter records `(skillId, ide)` so engine tests can assert the target. `convert` unchanged (leftover).

**Acceptance criteria:**
- [x] `install('obra/x', 'cursor')` invokes execa with cwd = root and a cursor agent flag
- [x] Claude / windsurf / agents pass a different flag (or documented equivalent)
- [x] Failure returns `Result` err, same style as today
- [x] Call sites that still use one-arg `install` are updated

**Verification:**
- [x] Tests pass: `npm test -- skills-adapter.test.ts`
- [x] `npm run typecheck` passes

**Dependencies:** Task 15

**Files likely touched:**
- `src/interfaces/adapters.ts`
- `src/adapters/skills-adapter.ts`
- `src/adapters/skills-adapter.test.ts`
- `src/adapters/in-memory-skills.ts`

**Estimated scope:** Medium (4 files)

---

### Task 35: Engine + CLI — install records deploy
**Description:** `engine.install(skillId, targetIDE)` calls the adapter, then upserts `SkillRecord` (`source: 'skills.sh'` or `local`), `paths`, `deployedTo`. Persist + rollback on write failure. CLI `install <skillId> --to <ide>`. Does not write command files. Does not require the id to be filed (flow recommends file first).

**Acceptance criteria:**
- [x] After install to cursor, catalog has `deployedTo` for cursor
- [x] Adapter failure does not persist a deploy
- [x] CLI requires `--to`; rejects unknown IDE before the engine
- [x] Discover/Inbox tests still show zero install unless they call install

**Verification:**
- [x] Tests pass: `npm test -- collection-engine.test.ts install.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 29, Task 34

**Files likely touched:**
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`
- `src/cli/commands/install.ts` (+ test)

**Estimated scope:** Medium (4 files)

---

### Task 36: GUI — install to an IDE
**Description:** After a skill is known (Inbox or on a command), user picks an IDE and Install. Bridge `install(skillId, ide)` → engine. Discover does not grow Install.

**Acceptance criteria:**
- [x] Install from the Commands surface calls the engine with the chosen IDE
- [x] Error is visible (not `sr-only`)
- [x] Discover Add still does not install

**Verification:**
- [x] Tests pass: `npm --workspace gui test`
- [x] `npm --workspace gui run typecheck` passes
- [ ] Manual: file a skills.sh id, install `--to cursor`, confirm a folder under the picked project

**Dependencies:** Task 35

**Files likely touched:**
- `gui/src/shared/ipc.ts` / main / preload / test-utils
- `gui/src/renderer/src/components/CollectionList.tsx` (+ test)

**Estimated scope:** Medium (one GUI slice)

---

## Checkpoint: After Tasks 34–36 (push skills)
- [x] Discover Add does not download
- [x] Install writes into the target IDE skills dir and records `deployedTo`
- [ ] Human check: where did `npx skills add` write?

---

### Task 37: Engine `exportCommand` (our file, stamp, no clobber)
**Description:** Replace the product meaning of export. `exportCommand(name, targetIDE, { replace?: boolean })` writes `.cursor/commands/<name>.md` (and the sibling paths in architecture). Frontmatter: `name`, `skills`, `generated_by: skil`, `generated_at`. Short stub body. If the file exists and lacks `generated_by: skil`, error unless `replace`. If stamped by us, overwrite. Do not scan `commands/`. Do not call `convert` / skillsmith. Old `export(names[], ide)` tests that expect convert must move to this contract or die.

**Acceptance criteria:**
- [x] Export `build` → cursor writes `.cursor/commands/build.md` with `skills:` matching the command
- [x] Existing unstamped `build.md` → error; `replace: true` overwrites
- [x] Stamped file may be rewritten
- [x] Missing command name is a failure; other IDEs keep their files

**Verification:**
- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Build succeeds: `npm run build`
- [x] In-memory skills adapter `convert` is not called

**Dependencies:** Task 28, Task 29

**Files likely touched:**
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`
- `src/cli/commands/export.ts` (help only if you also do Task 38 here — prefer not)

**Estimated scope:** Medium (3–4 files)

---

### Task 38: CLI + GUI export our command file
**Description:** `export <command> --to <ide> [--replace]`. GUI: explicit Export on a command, IDE pick, replace confirm if the engine says the file is unstamped. One vertical slice (CLI + GUI) because the contract is the same method.

**Acceptance criteria:**
- [x] CLI writes the stamped file; `--replace` maps to `replace: true`
- [x] GUI Export does not install skills
- [x] Unstamped conflict is shown; user can opt in to replace
- [x] Help: this is push of our template, not skillsmith convert

**Verification:**
- [x] Tests pass: `npm test -- export.test.ts` and `npm --workspace gui test`
- [x] Typecheck passes (root + gui)
- [ ] Manual: export `/build` to cursor; confirm their old unstamped file is left alone

**Dependencies:** Task 37

**Files likely touched:**
- `src/cli/commands/export.ts` (+ test)
- `gui/src/shared/ipc.ts` / main / preload / test-utils
- `gui/src/renderer/src/components/CollectionList.tsx` (+ test)

**Estimated scope:** Medium (GUI slice + CLI)

---

## Checkpoint: After Tasks 37–38 (push templates)
- [x] Our command file has `skills:` + `generated_by: skil`
- [x] Unstamped `/build.md` survives without `--replace`
- [x] Install and export are separate pushes

---

### Task 39: State path `.skil/` + bin alias `skil`
**Description:** Persist at `.skil/state.json`. On load, if missing, read `.contextkit/state.json` (no copy until next persist). Add bin `skil` (keep `contextkit` so old scripts work). `SKIL_API_URL` with fallback to `CONTEXTKIT_API_URL`. GUI window/title can say skil. Do not rename `CollectionEngine` or every IPC channel in this task.

**Acceptance criteria:**
- [x] New project writes `.skil/state.json`
- [x] Old `.contextkit/state.json` still loads
- [x] `npx skil scan --help` or `node dist/cli` under the `skil` bin works
- [x] Existing tests that hardcode the old path are updated or covered by the fallback test

**Verification:**
- [x] Tests pass: `npm test -- collection-engine.test.ts real-fs-adapter.test.ts program.test.ts`
- [x] Build succeeds: `npm run build`

**Dependencies:** Task 29

**Files likely touched:**
- `src/core/collection-engine.ts`
- `package.json`
- `src/cli/program.ts`
- `src/config/website.ts` (or env reader)
- integration test path fixtures

**Estimated scope:** Medium (≤5 files if you skip an IPC rename)

---

### Task 40: README matches the loop
**Description:** Architecture and PRD are already updated. README still says collections + skillsmith export. Rewrite commands and the GUI flow. No "one-click install from search." No import-from-IDE. Point at Inbox, scan, install, export-our-file.

**Acceptance criteria:**
- [x] README verbs match Phase 11
- [x] No leftover "active collection" or "export converts every skill"
- [x] No new promises (linter, team sync, marketplace)

**Verification:**
- [x] Docs match implemented commands after Tasks 30–39
- [ ] Human skim

**Dependencies:** Task 38, Task 39

**Files likely touched:**
- `README.md`

**Estimated scope:** Small (1 file)

---

## Checkpoint: After Phase 11 (complete)
- [ ] Connect → scan → Inbox → create command → file → install and/or export
- [ ] Re-scan keeps the map; gone ids dropped and reported
- [ ] We do not scan `commands/`; we do not overwrite unstamped command files
- [ ] Discover Add still does not download
- [ ] Phases 8–10 not implemented
- [ ] Human review before deleting `sync`/`run` or building a skill linter

