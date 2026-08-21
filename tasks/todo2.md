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
