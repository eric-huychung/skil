# Implementation Plan: ContextKit

## Overview

Build a CLI-first AI skill collection manager using deep module design and test-driven development. Implementation follows vertical slicing: each phase delivers working, testable functionality. The architecture centers on a deep `CollectionEngine` module with thin adapter and UI layers.

## Architecture Decisions

**Deep module at the core:**
- `CollectionEngine` is the only deep module: small interface (5 methods), rich implementation (state management, validation, multi-IDE coordination)
- All business logic concentrates here; changes to requirements only touch this module
- CLI and GUI are thin—just I/O routing to the engine

**Adapter pattern for boundaries:**
- `FileSystemAdapter`: wraps all file operations (symlinks, JSON, IDE detection)
- `ConfigAdapter`: wraps YAML parsing and validation
- `SkillsAdapter`: wraps external tool calls (skills.sh API, npx, skillsmith)
- Adapters are the test seams—mock these, not the engine internals

**Dependency injection throughout:**
- Engine accepts adapters as constructor params
- CLI accepts engine as param
- Makes testing natural: inject mocks at construction

**Result type for errors:**
- No thrown exceptions in business logic
- Return `Result<T>` for operations that can fail
- Forces callers to handle errors explicitly

**Vertical slicing:**
- Each phase delivers end-to-end functionality
- Phase 1: User can create a collection (test + implementation)
- Phase 2: User can activate a collection (test + implementation)
- Avoids horizontal "build all models, then all logic, then all UI" antipattern

## Technology Stack

**Runtime:** Node.js 18+ (LTS)
**Language:** TypeScript (strict mode)
**Testing:** Vitest
**CLI:** Commander.js + chalk + cli-table3
**External tools:** axios (HTTP), execa (subprocess), js-yaml (YAML)

**Why TypeScript:**
- Ecosystem alignment: Vercel skills, skillsmith, asm are all TypeScript/npm
- Code sharing: One codebase serves CLI + future Electron GUI
- User expectations: Users already have Node/npm for `npx skills add`
- Distribution: `npm install -g contextkit` fits existing workflow

See `docs/design/architecture.md` for detailed rationale and dependency versions.

## Task List

**45 tasks across 9 phases.** Detailed acceptance criteria, verification steps, and file estimates in `tasks/todo.md`.

### Phase 1: Foundation (Tasks 1-4)
Bootstrap project with TypeScript, testing, and core types.

1. Initialize TypeScript project with Vitest
2. Create Result type and error utilities
3. Define core interfaces (Engine, Adapters)
4. Create in-memory adapter implementations for testing

**Checkpoint:** Project compiles, tests run, types defined

---

### Phase 2: Collection Management (Tasks 5-9)
Build CollectionEngine with TDD: create, list, and basic state management.

5. TDD - User can create a collection
6. TDD - User can list all collections
7. TDD - Creating duplicate collection returns error
8. TDD - State persists to JSON file
9. TDD - State loads from existing JSON file

**Checkpoint:** CollectionEngine can create and list collections, state persists

---

### Phase 3: Collection Activation (Tasks 10-14)
Add activate/deactivate logic with symlink management.

10. TDD - User can activate a collection
11. TDD - Activating collection creates symlinks in IDE directories
12. TDD - Only one collection can be active at a time
13. TDD - User can deactivate active collection
14. TDD - Deactivating removes all symlinks

**Checkpoint:** Full collection lifecycle working (create → activate → deactivate)

---

### Phase 4: FileSystemAdapter Implementation (Tasks 15-18)
Implement real file system operations. Move from mocks to real I/O.

15. Implement real symlink creation and removal
16. Implement IDE directory detection
17. Implement JSON read/write with atomic operations
18. Integration test: Full flow with temp directory

**Checkpoint:** Real FileSystemAdapter works, integration tests pass

---

### Phase 5: Config Management (Tasks 19-22)
Implement config file parsing, validation, and sync operation.

19. TDD - ConfigAdapter reads and parses .contextkit.yml
20. TDD - ConfigAdapter validates YAML schema
21. TDD - User can sync collections from config file
22. TDD - Sync warns on conflicts (local skills not in config)

**Checkpoint:** Team config sync working

---

### Phase 6: Skills Management (Tasks 23-26)
Implement SkillsAdapter to wrap external tools.

23. Implement skills.sh API search (mock HTTP calls in tests)
24. Implement npx skills install wrapper
25. Implement skillsmith convert wrapper
26. Add installed skills tracking to state

**Checkpoint:** Can search, install, and convert skills via engine

---

### Phase 7: CLI Interface (Tasks 27-33)
Build thin CLI layer that routes commands to engine.

27. Set up CLI framework (Commander.js)
28. Implement `contextkit create` command
29. Implement `contextkit use` and `contextkit disable` commands
30. Implement `contextkit list` and `contextkit status` commands
31. Implement `contextkit search` and `contextkit install` commands
32. Implement `contextkit sync` command
33. Add colored output and error formatting

**Checkpoint:** Full CLI working end-to-end

---

### Phase 8: Polish and Edge Cases (Tasks 34-37)
Handle error scenarios, edge cases, and user experience improvements.

34. Handle symlink conflicts (file already exists)
35. Handle missing skill directories gracefully
36. Add rollback on partial failure
37. Add validation messages and actionable error text

**Checkpoint:** Production ready - robust error handling, documentation complete

---

### Phase 9: GUI (Tasks 38-45)
Desktop GUI, built only after the CLI (Phases 1-8) is stable. Same `CollectionEngine` and adapters as the CLI — this phase is presentation-only.

38. Decide and scaffold desktop GUI shell (Electron vs Tauri) with React
39. Set up component test harness with in-memory CollectionEngine
40. TDD - Collection list view
41. TDD - Activate/deactivate controls
42. TDD - Create collection flow
43. TDD - Skill search and install panel
44. Apply design system with the ui-ux-pro-max skill
45. E2E test: full GUI workflow with real engine

**Checkpoint:** GUI MVP complete - shares 100% of business logic with the CLI

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| IDE restart required after symlink changes | High | Test with Cursor/Claude Desktop early (Task 18 manual verification). Document if restart needed. |
| Symlink support on Windows | Medium | Use Node.js fs.symlink with proper flags. Test on Windows VM or defer Windows support to post-MVP. |
| External tool API changes (skills.sh, npx) | Medium | Wrap in adapters (already planned). Adapter tests catch API breakage quickly. |
| State file corruption | Medium | Atomic writes (write temp, rename). Add schema version for future migrations. |
| Merge conflicts during team sync | Low | Additive sync strategy (don't delete local collections). Clear warning messages. |

## Open Questions

**Technical:**
1. IDE restart requirements: Do Cursor/Claude Desktop/Windsurf watch symlink changes? → **Validate in Task 18**
2. Symlink conflict resolution: Overwrite, skip, or error when symlink already exists? → **Decide in Task 34**
3. Error recovery: Full rollback or partial state on failure? → **Implement in Task 36**

**Product:**
1. Terminology: Is "collection" clear, or should it be "profile", "context", "bundle"? → **User feedback after MVP**
2. GUI priority: Build in parallel or wait for CLI validation? → **Resolved: wait for CLI MVP first, then Phase 9 (Tasks 38-45)**

**Validation criteria (from PRD assumptions):**
- Do 50%+ of users create multiple collections? → Measure in month 1
- Do teams adopt `.contextkit.yml`? → Track config file usage
- Is GUI necessary or is CLI sufficient? → Wait for user requests

## Parallelization Opportunities

**Can run in parallel:**
- Phase 4 (FileSystemAdapter) and Phase 5 (ConfigAdapter) are independent
- Phase 6 (SkillsAdapter) can start after Phase 2 (doesn't depend on symlinks)
- Documentation can be written alongside Phase 7 (CLI)

**Must be sequential:**
- Phase 2 (Engine) before Phase 3 (Activation)—activation depends on engine
- Phase 3 (Activation) before Phase 4 (real FileSystemAdapter)—need tests first
- Phase 7 (CLI) needs Phases 2-6 complete—CLI just routes to engine
- Phase 9 (GUI) needs Phases 7-8 complete—deferred by design; GUI is presentation-only over the same engine

**Coordination needed:**
- If multiple agents work on adapters, agree on Result type and error handling patterns first
- If CLI is built in parallel, agree on engine interface contract

## Success Criteria

This implementation succeeds if:

1. **Tests are fast:** Engine tests run in <100ms (no I/O), full suite in <5s
2. **Engine is deep:** Adding new IDE support takes <2 hours (just adapter changes)
3. **CLI is thin:** <10% of code in CLI layer (just routing and formatting)
4. **Errors are actionable:** Every error tells user exactly how to fix it
5. **State is reliable:** No corruption possible, atomic writes, schema versioned
6. **Team sync works:** Config-as-code validated by 5+ teams using `.contextkit.yml`

## Definition of Done (per task)

Every task must satisfy:

- [ ] Tests written first (TDD: red → green)
- [ ] Tests pass and cover acceptance criteria
- [ ] TypeScript compiles with no errors
- [ ] No linter warnings
- [ ] Error cases handled with Result type
- [ ] Changes don't break existing tests
- [ ] Manual verification performed if integration test

---

# Implementation Plan: Leaderboard Browse

Detailed tasks: `tasks/todo2.md` Phase 5 (Tasks 10–14). Original 9-phase plan remains above; this is the next slice after that refactor.

## Overview

Empty search is a dead end (GUI blank form; CLI no-query 400s). Browse skills.sh **all-time** and **trending** through the existing Vercel OIDC proxy. Cache on Vercel CDN (`s-maxage` + `stale-while-revalidate`). Typed search and local install stay unchanged. Not a marketplace and not a new store (no Redis, no local JSON, no localStorage).

## Architecture Decisions

- **`browse` is a new method, not magic `search("")`.** Different skills.sh endpoint (`GET /api/v1/skills` vs `/search`), different params (`view`, not `q`), different cache policy. Putting that behind empty-string search would leak an invariant into every caller. `ISkillsAdapter.browse(view)` / `ICollectionEngine.browse(view)` stay small: one view param, no `per_page`.
- **CDN cache is an implementation detail of the Vercel function**, not the adapter. Adapter still does one GET. Future Cron/Redis go *behind* `GET /api/skills` without changing CLI/GUI.
- **Fixed origin page size (20).** One CDN cache key per view. CLI slices to 10 (presentation). GUI shows 20. Do not let clients pass `per_page` in v1.
- **`installs?: number` on `Skill`.** Leaderboard ranking is install count. Optional so existing `state.json` installed-skill records stay valid. Search may keep omitting it.
- **Engine stays a pass-through.** Ranking, HTTP, and cache do not belong in `CollectionEngine`. Do not write tests whose only assertion is that `browse` forwards to the adapter.
- **Thin wrapper (PRD).** This is pointing at skills.sh's leaderboard, not a ContextKit registry. Out of scope remains: curated/hot, paging, skill file trees, collection starter packs, custom skill hosting.

## Seams under test (confirm before implementing)

| Seam | What a test observes |
|------|----------------------|
| `browseSkills` + browse route in `src/backend/skills-proxy.ts` | skills.sh URL, OIDC header, 400/502, `Cache-Control` on 200 |
| `ISkillsAdapter.browse` | Mapped `Skill[]` from mocked `GET /api/skills`, errors as `Result` |
| CLI `runSearch` | Empty query → all-time cap 10; `--trending`; typed query still `search` |
| GUI `SkillSearch` via `ContextKitBridge.browseSkills` | Empty-state all-time, trending tab, install count, typed search/install unchanged |

Not a seam: `CollectionEngine.browse` forwarding; real CDN HIT (`x-vercel-cache`) — needs a deployed project (same as Task 1 OIDC).

## Task List

### Phase 5: Leaderboard Browse
- [ ] Task 10: Proxy the skills.sh leaderboard with CDN cache headers
- [ ] Task 11: TDD — `SkillsAdapter.browse`
- [ ] Task 12: TDD — `contextkit search` with no query browses the leaderboard
- [ ] Task 13: TDD — GUI empty search shows All time / Trending
- [ ] Task 14: Sync architecture, PRD, and README with browse

### Checkpoint: After Phase 5
- [ ] Tests pass (root + gui)
- [ ] CLI empty search + `--trending` work; typed search unchanged
- [ ] GUI empty state shows both views with install counts
- [ ] Browse route sends CDN Cache-Control; search route does not
- [ ] Docs match; no Cron/Redis/marketplace scope creep

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `api/skills/index.ts` vs `api/skills/search.ts` routing clash on Vercel | High | Use directory index (`api/skills/index.ts` → `GET /api/skills`); verify locally with `vercel dev` if needed |
| OIDC / CDN HIT not testable locally | Med | Unit-test headers and upstream URL; note deploy check like Task 1 |
| Inline `ISkillsAdapter` fakes miss `browse` | Med | Task 11 includes typecheck of those fakes |
| Empty GUI fetch on app boot | Low | Task 13: fetch on first visit to Search, not window open |
| Treating this as a marketplace | Med | Task 14 + PRD "no marketplace"; browse is a proxy of skills.sh |

## Open Questions

- Confirm the four seams above before the first red test. If you want engine passthrough tests to match existing `search` tests in `collection-engine.test.ts`, say so — default is skip (tautological).
- `contextkit search react --trending`: plan is ignore `--trending` and typed-search. Error instead if you want it strict.

## References

- Architecture: `docs/design/architecture.md`
- PRD: `docs/requirements/prd.md`
- Diagram: `docs/design/architecture-diagram.html`
- Deep modules: `.cursor/skills/design/codebase-design/SKILL.md`
- TDD: `.cursor/skills/philosophy/tdd/SKILL.md`
- Tasks: `tasks/todo2.md` Phase 5
