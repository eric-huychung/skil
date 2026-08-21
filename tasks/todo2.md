# ContextKit Refactor: Management + Export Focus

## Overview
Shift from symlink management to collection organization and IDE conversion. Add OIDC auth, make collections editable, add command templates, remove activation logic. Phase 5 (after that refactor) adds skills.sh all-time/trending browse through the existing OIDC proxy, cached on Vercel's CDN.

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
**Description:** Electron `dialog.showOpenDialog({ properties: ['openDirectory'] })` in main. On pick, replace the module-level `engine` with `createEngine(selectedPath)` and re-register nothing — handlers close over a `let engine`. Renderer shows the current folder path and a Pick / Change control in the header (not the Sync tab). Until a folder is chosen, Discover/Collections/Inbox mutations are disabled with a clear empty state. Session-only: do not write last path to disk.

**Acceptance criteria:**
- [x] `ContextKitBridge.pickProjectFolder()` opens a directory dialog and, on confirm, rebuilds the engine for that path
- [x] `getProjectRoot()` returns the bound path or `null` if none yet
- [x] Canceling the dialog leaves the previous engine (or none) unchanged
- [x] Header shows the folder name; Sync tab copy is still team-config, not this picker
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

**Estimated scope:** Medium (6 files — one GUI vertical slice; do not split IPC from the header)

---

## Checkpoint: After Phase 6
- [x] `npm test` and `npm --workspace gui test` pass
- [x] CLI from a project dir still uses that dir
- [x] GUI can bind to a folder without `chdir`
- [ ] Review with human before Inbox UI copy

---

## Phase 7: Inbox

Inbox is a real holding list of skill IDs on `State`. Not a collection. Not downloaded. Schema v3: `inbox: string[]`. Old state files missing the field load as `[]` (same ignore-unknown-fields approach as v1 → v2).

**Seams under test:** `CollectionEngine.addToInbox` / `inbox` / `removeFromInbox` / `fileToCollection` at the engine interface. CLI handlers with in-memory engine. Do not test persist-helper internals.

---

### Task 17: `State.inbox` + add / list / remove
**Description:** Add `inbox: string[]` to `State`. `addToInbox(skillId)` is idempotent, persists, rolls back on write failure (same pattern as `addSkill`). `inbox()` returns a copy of the IDs. `removeFromInbox(skillId)` is a no-op if missing. `create('inbox', …)` returns an error — Inbox is not a collection name. Constructor treats missing `inbox` as `[]`.

**Acceptance criteria:**
- [ ] `addToInbox('obra/react-patterns')` persists under `.contextkit/state.json` `inbox`
- [ ] Adding the same ID twice leaves one entry
- [ ] `create('inbox', [])` errors; no collection named `inbox` is stored
- [ ] State file without `inbox` loads; `inbox()` is `[]`
- [ ] Write failure leaves in-memory inbox unchanged

**Verification:**
- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] `npx skills add` is not invoked (in-memory adapter `install` call count stays 0)

**Dependencies:** None (can parallelize with Task 15)

**Files likely touched:**
- `src/types/index.ts`
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 18: File Inbox item into a named collection
**Description:** `fileToCollection(skillId, collectionName)` moves one Inbox ID into an existing collection: append to `collection.skills` (idempotent if already there), remove from `inbox`, one persist, rollback on failure. Error if the collection does not exist. Error if `skillId` is not in the inbox (do not silently `addSkill`). Does not call `install`.

**Acceptance criteria:**
- [ ] Filing `'obra/react-patterns'` into `'frontend'` adds the ID to that collection and drops it from `inbox()`
- [ ] Filing into a missing collection returns an error; inbox unchanged
- [ ] Filing an ID not in the inbox returns an error; collection unchanged
- [ ] Filing an ID already in the collection still removes it from inbox (move is done)
- [ ] Write failure restores both inbox and collection

**Verification:**
- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: not required; CLI coverage is Task 19

**Dependencies:** Task 17

**Files likely touched:**
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (3 files)

---

### Task 19: CLI inbox commands
**Description:** Thin CLI over the new engine methods. `contextkit inbox` lists IDs. `contextkit inbox add <skillId>` calls `addToInbox`. `contextkit inbox file <skillId> <collection>` calls `fileToCollection`. Help text says Inbox is a holding list and that Export (not this command) downloads. Do not add a `staging` alias.

**Acceptance criteria:**
- [ ] `contextkit inbox` prints current inbox IDs (friendly empty message)
- [ ] `contextkit inbox add obra/react-patterns` succeeds without installing
- [ ] `contextkit inbox file obra/react-patterns frontend` moves the ID
- [ ] Errors from the engine are printed; help documents the three commands

**Verification:**
- [ ] Tests pass: `npm test -- inbox.test.ts` (or equivalent new CLI test file)
- [ ] Build succeeds: `npm run build`
- [ ] `contextkit --help` lists inbox; no "staging" string in CLI source

**Dependencies:** Task 18

**Files likely touched:**
- `src/cli/commands/inbox.ts` (new)
- `src/cli/commands/inbox.test.ts` (new)
- `src/cli/program.ts`

**Estimated scope:** Small (3 files)

---

## Checkpoint: After Phase 7
- [ ] Inbox IDs persist with no `npx skills add`
- [ ] Filing moves Inbox → collection
- [ ] `create inbox` is rejected
- [ ] Review with human before Discover button copy

---

## Phase 8: Discover → Inbox

Browse/search stay as Phase 5. Only the row action changes: Add writes Inbox. Stop calling `engine.install` / `npx skills add` from Discover.

---

### Task 20: GUI Discover Add → Inbox
**Description:** Replace Discover's Install control with Add. Click calls `addToInbox`, not `installSkill`. Drop `installSkill` from `ContextKitBridge` / IPC / preload / test bridge so the GUI cannot regress. Keep leaderboard tabs, typed search, install-count display (that number is skills.sh popularity, not "installed locally"). Copy: Add / Added — never Install, never Staging.

**Acceptance criteria:**
- [ ] Add on a browse/search row puts the ID in `engine.inbox()` and does not call `install`
- [ ] Duplicate Add is success (idempotent); button can show Added
- [ ] Error from `addToInbox` is shown inline
- [ ] No `installSkill` on `ContextKitBridge`
- [ ] Existing browse/search tests still pass aside from the renamed action

**Verification:**
- [ ] Tests pass: `npm --workspace gui test -- SkillSearch.test.tsx`
- [ ] `npm --workspace gui run typecheck` passes
- [ ] `npm test` (root) still passes

**Dependencies:** Task 17, Task 16 (folder should be picked before mutating; if no folder, Add is disabled with the same empty state as Task 16)

**Files likely touched:**
- `gui/src/shared/ipc.ts`
- `gui/src/main/index.ts`
- `gui/src/preload/index.ts`
- `gui/src/renderer/src/test-utils.tsx`
- `gui/src/renderer/src/components/SkillSearch.tsx`
- `gui/src/renderer/src/components/SkillSearch.test.tsx`

**Estimated scope:** Medium (6 files)

---

## Phase 9: One-IDE import

Scan **one** of `.cursor/skills` or `.claude/skills` under the project root. Import seeds Collections. Empty is success. This is not `sync`.

**Seams under test:** `IFileSystemAdapter.listDirectories`; `CollectionEngine.importFromIDE` (skill IDs + upsert collection). CLI `runImport`. Do not test path-string concatenation as a separate engine test if `listDirectories` already returns names.

---

### Task 21: `listDirectories` on the FS adapter
**Description:** Add `listDirectories(path): Result<string[]>` to `IFileSystemAdapter`. Real adapter: directory names only (not files), relative to the adapter root like JSON paths. Missing path → ok empty list (import treats "no skills dir" as empty, not a crash). Not-a-directory → error. In-memory adapter: seedable map of path → child names for engine tests.

**Acceptance criteria:**
- [ ] Real adapter lists subdirectory names under a rooted path
- [ ] Missing directory returns `ok([])`, not an error
- [ ] File-at-path returns an error Result
- [ ] In-memory adapter can seed `.cursor/skills` → `['react-patterns']`

**Verification:**
- [ ] Tests pass: `npm test -- real-fs-adapter.test.ts in-memory.test.ts`
- [ ] Build succeeds: `npm run typecheck`
- [ ] `IFileSystemAdapter` fakes in other tests compile (add `listDirectories` returning `ok([])`)

**Dependencies:** Task 15 (rooted paths)

**Files likely touched:**
- `src/interfaces/adapters.ts`
- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`
- `src/adapters/in-memory-fs.ts`
- `src/adapters/in-memory.test.ts`

**Estimated scope:** Medium (5 files)

---

### Task 22: `importFromIDE('cursor' | 'claude')`
**Description:** `importFromIDE(ide)` lists `.cursor/skills` or `.claude/skills` (only those trees). Directory names become skill IDs with `source: 'local'` recorded on `installedSkills` if not already present (they are already on disk — this is not a fetch). If IDs length > 0, upsert a collection named `cursor` or `claude` whose `skills` **replace** with the scan (disk is source of truth for that one collection). Empty scan: `ok({ ide, skillIds: [] })` and do not create/overwrite a collection. Do not touch inbox, other collections, or `.contextkit.yml`. Do not scan `.cursor/rules`, `.agents`, Windsurf, or home-dir skills. Type is `'cursor' | 'claude'` — not the full `IDE` union.

**Acceptance criteria:**
- [ ] Cursor scan of `react-patterns` upserts collection `cursor` with that ID
- [ ] Claude scan uses `.claude/skills` and collection name `claude`
- [ ] Empty or missing skills dir succeeds with `skillIds: []` and no new collection
- [ ] Re-import replaces that IDE collection's skill list; other collections unchanged
- [ ] Inbox unchanged; `sync` codepath uncalled

**Verification:**
- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] In-memory skills adapter `install` is not called

**Dependencies:** Task 21

**Files likely touched:**
- `src/types/index.ts`
- `src/interfaces/engine.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (4 files)

---

### Task 23: CLI `import --from`
**Description:** `contextkit import --from cursor|claude` calls `importFromIDE`. Reports how many IDs landed and the collection name, or a friendly empty message. Rejects `--from` values other than `cursor`/`claude` (including `windsurf`, `all`, comma-separated). Help text: one IDE, empty is fine, this is not `sync`.

**Acceptance criteria:**
- [ ] `--from cursor` and `--from claude` work
- [ ] Invalid `--from` errors before the engine is called
- [ ] Empty import prints a success empty message, not an error
- [ ] Help does not mention GitHub or multi-IDE

**Verification:**
- [ ] Tests pass: `npm test -- import.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: `npx contextkit import --from cursor` in this repo (has `.cursor/skills`)

**Dependencies:** Task 22

**Files likely touched:**
- `src/cli/commands/import.ts` (new)
- `src/cli/commands/import.test.ts` (new)
- `src/cli/program.ts`

**Estimated scope:** Small (3 files)

---

### Task 24: GUI pick one IDE and import
**Description:** After a folder is picked, Collections (or a first-run prompt there — not Sync) offers **one** choice: Cursor or Claude, then Import. Empty result is a normal success state. Do not offer "both", Windsurf, or GitHub. Show imported IDs via the existing collection list (`cursor` / `claude` row).

**Acceptance criteria:**
- [ ] User can import from Cursor **or** Claude, not both in one click
- [ ] Empty import does not error the UI
- [ ] After import, `CollectionList` shows the `cursor` or `claude` collection when IDs exist
- [ ] No third holding-list label; Sync tab still unused for this

**Verification:**
- [ ] Tests pass: `npm --workspace gui test -- CollectionList.test.tsx` (or a focused import component test)
- [ ] `npm --workspace gui run typecheck` passes
- [ ] Manual: pick this repo, import Cursor, see `.cursor/skills` names

**Dependencies:** Task 16, Task 22

**Files likely touched:**
- `gui/src/shared/ipc.ts`
- `gui/src/main/index.ts`
- `gui/src/preload/index.ts`
- `gui/src/renderer/src/test-utils.tsx`
- `gui/src/renderer/src/components/CollectionList.tsx` (or a small import control next to it)

**Estimated scope:** Medium (5 files)

---

## Checkpoint: After Phase 9
- [ ] One-IDE import works empty and non-empty
- [ ] `contextkit sync` tests unchanged in behavior
- [ ] No multi-IDE import UI
- [ ] Review local-ID vs `owner/repo` mapping before Export work if names look wrong

---

## Phase 10: Export fetches

`export` is the download + convert step. Discover/Inbox/import only stored IDs (import also noted local files). Keep CLI `contextkit install` as an escape hatch; GUI Discover must not grow Install back.

---

### Task 25: `export` install-then-convert per skill
**Description:** For each skill in each named collection, `export` first `skills.install(skillId)` then `skills.convert(skillId, targetIDE)`. Same continue-on-failure rules as today: missing collection or one bad skill goes to `failures`, the rest continue. Successful fetch records `installedSkills` (reuse `install()` or equivalent persist). Convert failure after a successful fetch is still a per-skill failure (files may exist; user can retry export). Do not fetch from Discover. `SkillsAdapter.install` already has project `cwd` from Task 15. If `npx skills add` needs an agent flag to land in `.cursor` vs `.claude`, put that flag **inside** the adapter — `export()`'s interface stays `(names, targetIDE)`.

**Acceptance criteria:**
- [ ] Export of a collection whose IDs were only in state (never installed) calls install then convert per ID
- [ ] Install failure for one skill skips convert for that skill, continues the rest
- [ ] Convert-only failure still recorded; other skills proceed
- [ ] Existing multi-collection and missing-collection export cases still hold
- [ ] Discover/Inbox tests still show zero `install` calls

**Verification:**
- [ ] Tests pass: `npm test -- collection-engine.test.ts export.test.ts`
- [ ] Build succeeds: `npm run build`
- [ ] Manual: Inbox-add a skills.sh ID, file it, export `--to cursor`, confirm files appear under the project (not the GUI app dir)

**Dependencies:** Task 15, Task 8 (existing export)

**Files likely touched:**
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`
- `src/cli/commands/export.ts` (help text: fetch + convert)
- `src/adapters/skills-adapter.ts` (only if `--agent` / cwd must change)

**Estimated scope:** Medium (3–4 files)

---

## Checkpoint: After Phase 10
- [ ] Discover Add still does not download
- [ ] Export downloads + converts into the picked project
- [ ] CLI `install` still exists; GUI Discover does not call it
- [ ] Human check: where did `npx skills add` actually write?

---

## Phase 11: Inbox in the GUI

Engine + CLI inbox already exist. Collections UI needs a visible Inbox list and a way to file into a **named** collection (dropdown of existing collections + File). User creates the collection first if needed (`CreateCollectionForm` already exists).

---

### Task 26: Inbox list + file into a named collection
**Description:** Collections workspace shows Inbox IDs (empty Inbox is fine). Each row: pick a collection, File → `fileToCollection`. Refresh collection list after. Do not call this panel Staging. Do not auto-create a collection on file. Disabled until a project folder is picked (Task 16).

**Acceptance criteria:**
- [ ] Inbox IDs from Discover Add appear here without a reload hack beyond existing version keys
- [ ] Filing into a named collection removes the row from Inbox and adds the skill to that collection
- [ ] Filing with no collection selected is blocked in the UI
- [ ] Engine errors surface inline
- [ ] Copy uses Inbox / File only

**Verification:**
- [ ] Tests pass: `npm --workspace gui test` (Inbox control + existing CollectionList)
- [ ] `npm --workspace gui run typecheck` passes
- [ ] Manual: Add from Discover → file into `frontend` → export still the download step

**Dependencies:** Task 18, Task 20

**Files likely touched:**
- `gui/src/shared/ipc.ts`
- `gui/src/main/index.ts`
- `gui/src/preload/index.ts`
- `gui/src/renderer/src/test-utils.tsx`
- `gui/src/renderer/src/components/CollectionList.tsx` (or `InboxList.tsx` next to it)
- matching test file

**Estimated scope:** Medium (5–6 files)

---

## Phase 12: Docs

PRD/architecture still describe install-on-discover and convert-only export. Update them to match this flow. Keep out-of-scope: GitHub connect, multi-IDE import, marketplace, token UI.

---

### Task 27: Sync architecture, PRD, and README with Inbox + deferred export
**Description:** Record project root, Inbox on `State` (v3), `importFromIDE` vs `sync`, Discover → Inbox, export = fetch + convert. Decision Log entries for (1) Inbox is not a collection, (2) import is not sync, (3) Discover does not install. PRD: replace story 16 one-click install with Add to Inbox; keep story 5 as optional CLI `install`; GUI features list folder picker, one-IDE import, Inbox, file, export. README: `inbox`, `import --from`, export description. No "staging".

**Acceptance criteria:**
- [ ] `docs/design/architecture.md`: engine methods, `listDirectories`, rooted adapters, schema v3, Decision Log
- [ ] `docs/requirements/prd.md`: user flow + stories match; sync still team config; out of scope lists GitHub connect / multi-IDE import
- [ ] `README.md`: new CLI commands and the GUI flow
- [ ] No leftover "one-click install from search" as current behavior

**Verification:**
- [ ] Docs match implemented commands and interfaces
- [ ] No new product promises (GitHub, both IDEs at once, staging)

**Dependencies:** Task 25, Task 26

**Files likely touched:**
- `docs/design/architecture.md`
- `docs/requirements/prd.md`
- `README.md`

**Estimated scope:** Small (3 files)

---

## Checkpoint: After Phase 12 (complete)
- [ ] All tests pass (root + gui)
- [ ] Flow: pick folder → optional one-IDE import → Discover Add → Inbox → file → Export fetch+convert
- [ ] Sync is still `.contextkit.yml` only
- [ ] Words in UI/CLI: Inbox, not staging
- [ ] Not built: GitHub connect, multi-IDE import
- [ ] Human review before changing team sync or adding last-folder persistence
