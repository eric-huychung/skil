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

**37 tasks across 8 phases.** Detailed acceptance criteria, verification steps, and file estimates in `tasks/todo.md`.

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
2. GUI priority: Build in parallel or wait for CLI validation? → **Wait for CLI MVP first**

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

## References

- Architecture: `docs/design/architecture.md`
- PRD: `docs/requirements/prd.md`
- Diagram: `docs/design/architecture-diagram.html`
- Deep modules: `.cursor/skills/design/codebase-design/SKILL.md`
- TDD: `.cursor/skills/philosophy/tdd/SKILL.md`
