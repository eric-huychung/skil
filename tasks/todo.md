# ContextKit Implementation Tasks

Tasks follow TDD: write failing test first, then minimal implementation. Each task should take 30-90 minutes focused work.

---

## Phase 1: Foundation

### Task 1: Initialize TypeScript project with Vitest

**Description:** Bootstrap Node.js project with TypeScript, Vitest testing framework, and development tooling. Set up proper module resolution, source/test directories, and npm scripts.

**Acceptance criteria:**

- [ ] `package.json` created with TypeScript and Vitest dependencies
- [ ] `tsconfig.json` configured for Node.js with strict mode
- [ ] Vitest configured (`vitest.config.ts`)
- [ ] `npm test` runs successfully (even with no tests)
- [ ] `npm run build` compiles TypeScript to `dist/`
- [ ] `.gitignore` includes `node_modules/`, `dist/`, `.contextkit/`

**Verification:**

- [ ] Tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] TypeScript compiles without errors

**Dependencies:** None

**Files likely touched:**

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.gitignore`

**Estimated scope:** Small (4 config files)

---



### Task 2: Create Result type and error utilities

**Description:** Implement functional error handling with Result type. No exceptions in business logic—return Result for operations that can fail. Include helper functions for creating success/error results.

**Acceptance criteria:**

- [ ] `Result<T>` type defined as discriminated union
- [ ] Helper functions: `ok<T>(value: T)`, `err(error: Error)`
- [ ] Helper functions: `isOk(result)`, `isErr(result)`
- [ ] Test cases verify type narrowing works correctly
- [ ] Documentation with usage examples

**Verification:**

- [ ] Tests pass: `npm test -- result.test.ts`
- [ ] TypeScript type checking catches misuse of Result type
- [ ] Manual check: Example code compiles and runs

**Dependencies:** Task 1

**Files likely touched:**

- `src/core/result.ts`
- `src/core/result.test.ts`

**Estimated scope:** Small (2 files)

---



### Task 3: Define core interfaces (Engine, Adapters)

**Description:** Define TypeScript interfaces for CollectionEngine and all adapters. This is the contract that guides all implementation. Interfaces include type signatures and JSDoc comments explaining behavior.

**Acceptance criteria:**

- [ ] `ICollectionEngine` interface with 5 methods: create, activate, deactivate, list, status
- [ ] `IFileSystemAdapter` interface with symlink, IDE detection, and JSON methods
- [ ] `IConfigAdapter` interface with read, write, validate
- [ ] `ISkillsAdapter` interface with search, install, convert, getInstalled
- [ ] All data types defined: `Collection`, `State`, `Config`, `Status`, `IDEInfo`, `Skill`
- [ ] JSDoc comments explain expected behavior and error cases

**Verification:**

- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] Manual check: Interfaces are clear and well-documented

**Dependencies:** Task 2 (needs Result type)

**Files likely touched:**

- `src/interfaces/engine.ts`
- `src/interfaces/adapters.ts`
- `src/types/index.ts`

**Estimated scope:** Small (3 files)

---



### Task 4: Create in-memory adapter implementations for testing

**Description:** Build fake adapters that store state in memory instead of touching file system or external APIs. Used as test doubles for CollectionEngine tests. These are production test infrastructure, not throwaway mocks.

**Acceptance criteria:**

- [ ] `InMemoryFileSystemAdapter` stores symlinks and files in Map
- [ ] `InMemoryConfigAdapter` stores config in memory
- [ ] `InMemorySkillsAdapter` returns hardcoded skill list
- [ ] All adapters implement their interfaces correctly
- [ ] Helper method to reset in-memory state between tests
- [ ] Basic tests verify adapters work as expected

**Verification:**

- [ ] Tests pass: `npm test -- adapters/in-memory.test.ts`
- [ ] TypeScript confirms adapters satisfy interfaces
- [ ] Manual check: Can create and query in-memory data

**Dependencies:** Task 3 (needs interfaces)

**Files likely touched:**

- `src/adapters/in-memory-fs.ts`
- `src/adapters/in-memory-config.ts`
- `src/adapters/in-memory-skills.ts`
- `src/adapters/in-memory.test.ts`

**Estimated scope:** Medium (4 files)

---



## Checkpoint: Foundation Complete

- [ ] `npm test` passes
- [ ] `npm run build` succeeds with no errors
- [ ] Result type works correctly
- [ ] All interfaces defined
- [ ] In-memory adapters ready for use

---



## Phase 2: Collection Management



### Task 5: TDD - User can create a collection

**Description:** RED: Write failing test for creating a collection. GREEN: Implement CollectionEngine.create() to pass test. Verify collection appears in state.

**Acceptance criteria:**

- [ ] Test: `engine.create('frontend', [])` returns success
- [ ] Test: Created collection stored in state with correct name and empty skills
- [ ] Test: Collection has `createdAt` timestamp
- [ ] Implementation: CollectionEngine class with create method
- [ ] Implementation: State structure initialized correctly
- [ ] Follow TDD: test written first, implementation second

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Can create collection with in-memory adapters
- [ ] State includes new collection

**Dependencies:** Task 4 (needs in-memory adapters)

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files)

---



### Task 6: TDD - User can list all collections

**Description:** RED: Write failing test for listing collections. GREEN: Implement CollectionEngine.list() to return all collections from state.

**Acceptance criteria:**

- [ ] Test: `engine.list()` returns empty array when no collections
- [ ] Test: `engine.list()` returns all created collections
- [ ] Test: Returned collections have correct properties (name, skills, timestamps)
- [ ] Implementation: list() method reads from state

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] List correctly shows all collections
- [ ] Empty state handled correctly

**Dependencies:** Task 5

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, just adding to existing)

---



### Task 7: TDD - Creating duplicate collection returns error

**Description:** RED: Write failing test for duplicate name validation. GREEN: Implement validation in create() to check for existing collection name. Return error Result instead of throwing.

**Acceptance criteria:**

- [ ] Test: Creating collection with duplicate name returns error Result
- [ ] Test: Error message is clear: "Collection 'frontend' already exists"
- [ ] Test: State unchanged after failed creation attempt
- [ ] Implementation: Validation checks collection names before creating

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Duplicate creation fails gracefully
- [ ] Error message is actionable

**Dependencies:** Task 5

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding validation logic)

---



### Task 8: TDD - State persists to JSON file

**Description:** RED: Write failing test that state is written to file after create. GREEN: Implement state persistence via FileSystemAdapter.writeJSON(). Use in-memory adapter for test, verify writeJSON called correctly.

**Acceptance criteria:**

- [ ] Test: Creating collection calls `fs.writeJSON()` with correct state
- [ ] Test: State written to `.contextkit/state.json` path
- [ ] Test: JSON structure matches State type
- [ ] Implementation: Engine writes state after every mutation
- [ ] Mock assertion verifies write was called

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Mock assertion confirms writeJSON called
- [ ] State structure is correct JSON

**Dependencies:** Task 5

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding persistence)

---



### Task 9: TDD - State loads from existing JSON file

**Description:** RED: Write failing test for loading existing state on engine initialization. GREEN: Implement constructor to load state from file via FileSystemAdapter.readJSON(). Handle missing file (start with empty state).

**Acceptance criteria:**

- [ ] Test: Engine constructor loads existing state from file
- [ ] Test: Collections from file appear in list()
- [ ] Test: Missing state file handled gracefully (empty state)
- [ ] Test: Corrupted JSON returns error during construction
- [ ] Implementation: Constructor calls fs.readJSON() and initializes state

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Existing state loaded on startup
- [ ] Missing file doesn't crash

**Dependencies:** Task 8

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding load logic)

---



## Checkpoint: Basic Engine Works

- [ ] All CollectionEngine tests pass (5+ tests)
- [ ] Can create and list collections programmatically
- [ ] State persists and loads correctly
- [ ] No file system operations in tests (fully mocked via in-memory adapter)
- [ ] Error cases handled with Result type

---



## Phase 3: Collection Activation



### Task 10: TDD - User can activate a collection

**Description:** RED: Write failing test for activating a collection. GREEN: Implement activate() to set active collection in state. No symlinks yet—just state management.

**Acceptance criteria:**

- [ ] Test: `engine.activate('frontend')` returns success
- [ ] Test: Status shows 'frontend' as active collection
- [ ] Test: Activating non-existent collection returns error
- [ ] Implementation: activate() updates state.activeCollection
- [ ] Implementation: Validation checks collection exists

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Status correctly shows active collection
- [ ] Error on non-existent collection

**Dependencies:** Task 9

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding activate)

---



### Task 11: TDD - Activating collection creates symlinks in IDE directories

**Description:** RED: Write failing test that activate() calls FileSystemAdapter.createSymlink() for each skill. GREEN: Implement symlink creation via adapter. Use mock to verify calls.

**Acceptance criteria:**

- [ ] Test: Activating collection calls `fs.createSymlink()` for each skill
- [ ] Test: Symlinks created in all detected IDE directories
- [ ] Test: Mock assertions verify correct source and target paths
- [ ] Implementation: Engine calls adapter.detectIDEs() then creates symlinks
- [ ] Implementation: Handles multiple IDE directories

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Mock assertions confirm symlinks created
- [ ] Correct paths passed to adapter

**Dependencies:** Task 10

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (2 files, adding symlink logic)

---



### Task 12: TDD - Only one collection can be active at a time

**Description:** RED: Write failing test that activating collection B deactivates collection A. GREEN: Implement deactivation logic in activate(). Remove old symlinks before creating new ones.

**Acceptance criteria:**

- [ ] Test: Activating collection B when A is active removes A's symlinks
- [ ] Test: Only B's symlinks exist after activation
- [ ] Test: Status shows B as active, not A
- [ ] Implementation: activate() calls deactivate internally if collection already active

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Only one collection active at a time
- [ ] Symlinks correctly swapped

**Dependencies:** Task 11

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding deactivation logic)

---



### Task 13: TDD - User can deactivate active collection

**Description:** RED: Write failing test for deactivate(). GREEN: Implement deactivate() to clear activeCollection state and return success.

**Acceptance criteria:**

- [ ] Test: `engine.deactivate()` returns success
- [ ] Test: Status shows no active collection after deactivate
- [ ] Test: Deactivating when nothing active returns success (idempotent)
- [ ] Implementation: deactivate() sets state.activeCollection to null

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Deactivate clears active status
- [ ] Idempotent behavior works

**Dependencies:** Task 10

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding deactivate)

---



### Task 14: TDD - Deactivating removes all symlinks

**Description:** RED: Write failing test that deactivate() calls removeSymlink() for each active skill. GREEN: Implement symlink removal via adapter.

**Acceptance criteria:**

- [ ] Test: Deactivating calls `fs.removeSymlink()` for each skill in active collection
- [ ] Test: All symlinks removed from all IDE directories
- [ ] Test: Mock assertions verify removeSymlink called with correct paths
- [ ] Implementation: Engine iterates over active collection skills and removes symlinks

**Verification:**

- [ ] Tests pass: `npm test -- collection-engine.test.ts`
- [ ] Mock confirms symlinks removed
- [ ] All IDE directories handled

**Dependencies:** Task 13

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding removal logic)

---



## Checkpoint: Activation Works

- [ ] All activation tests pass
- [ ] Activate/deactivate lifecycle complete
- [ ] Symlink creation/removal verified via mocks
- [ ] Status correctly reflects active collection
- [ ] Ready for real FileSystemAdapter integration

---



## Phase 4: FileSystemAdapter Implementation



### Task 15: Implement real symlink creation and removal

**Description:** Build real FileSystemAdapter using Node.js fs module. Implement createSymlink and removeSymlink with proper error handling. Use temp directories for tests.

**Acceptance criteria:**

- [x] `createSymlink()` uses `fs.symlink()` to create symbolic link
- [x] `removeSymlink()` uses `fs.unlink()` to remove symlink
- [x] Error cases handled: permission denied, target doesn't exist, symlink already exists
- [x] Tests use temp directory (clean up after each test)
- [x] Tests verify real symlinks created on filesystem

**Verification:**

- [x] Tests pass: `npm test -- real-fs-adapter.test.ts`
- [x] Build succeeds: `npm run build`
- [x] Manual check: Run test, inspect temp directory for symlinks

**Dependencies:** Task 3 (needs interfaces)

**Files likely touched:**

- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`

**Estimated scope:** Medium (2 files)

---



### Task 16: Implement IDE directory detection

**Description:** Implement detectIDEs() to scan project root for IDE directories (`.agents/`, `.claude/`, `.windsurf/`). Return array of IDEInfo with name and path.

**Acceptance criteria:**

- [x] `detectIDEs()` checks for existence of `.agents/`, `.claude/`, `.windsurf/`
- [x] Returns array of found IDEs with name and full path
- [x] Tests verify detection with temp directories
- [x] Handles case where no IDE directories exist (empty array)

**Verification:**

- [x] Tests pass: `npm test -- real-fs-adapter.test.ts`
- [x] Multiple IDEs detected correctly
- [x] Empty directory handled gracefully

**Dependencies:** Task 15

**Files likely touched:**

- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`

**Estimated scope:** Small (adding to existing files)

---



### Task 17: Implement JSON read/write with atomic operations

**Description:** Implement readJSON() and writeJSON() with atomic writes (write to temp, then rename). Handle file not found, parse errors, and write failures.

**Acceptance criteria:**

- [x] `readJSON()` reads file and parses JSON, returns Result
- [x] `writeJSON()` writes to temp file, then renames to target (atomic)
- [x] File not found returns error Result
- [x] Malformed JSON returns error Result
- [x] Tests verify atomic write (temp file used, then renamed)

**Verification:**

- [x] Tests pass: `npm test -- real-fs-adapter.test.ts`
- [x] Atomic write verified (check for temp file pattern)
- [x] Error cases handled correctly

**Dependencies:** Task 15

**Files likely touched:**

- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`

**Estimated scope:** Small (adding to existing files)

---



### Task 18: Integration test - Full flow with temp directory

**Description:** End-to-end integration test: create collection, activate, verify symlinks exist, deactivate, verify symlinks removed. Use real FileSystemAdapter with temp directory.

**Acceptance criteria:**

- [x] Test creates temp directory with fake IDE directories
- [x] Test creates CollectionEngine with real FileSystemAdapter
- [x] Test runs full create → activate → deactivate flow
- [x] Test verifies symlinks physically exist after activate
- [x] Test verifies symlinks removed after deactivate
- [x] Test cleans up temp directory after completion

**Verification:**

- [x] Tests pass: `npm test -- integration.test.ts`
- [x] Manual check: Watch temp directory during test
- [x] All IDE directories get symlinks

**Dependencies:** Tasks 15, 16, 17, 14 (needs full engine + real adapter)

**Files likely touched:**

- `src/__tests__/integration.test.ts`

**Estimated scope:** Medium (1 file, but comprehensive test)

---



## Checkpoint: File System Works

- [x] Integration test passes with real FileSystemAdapter
- [x] Symlinks actually created and removed on disk
- [x] JSON state file correctly persisted
- [x] Multi-IDE support verified
- [x] Manual test: Create collection in temp directory, inspect symlinks

---



## Phase 5: Config Management



### Task 19: TDD - ConfigAdapter reads and parses .contextkit.yml

**Description:** RED: Write failing test for reading YAML config. GREEN: Implement ConfigAdapter using js-yaml to parse .contextkit.yml.

**Acceptance criteria:**

- [x] Test: `adapter.read('.contextkit.yml')` parses valid YAML
- [x] Test: Returned Config object matches expected structure
- [x] Test: File not found returns error Result
- [x] Implementation: Uses js-yaml library
- [x] Handles YAML syntax errors

**Verification:**

- [x] Tests pass: `npm test -- config-adapter.test.ts`
- [x] Valid YAML parsed correctly
- [x] Errors handled gracefully

**Dependencies:** Task 3 (needs interfaces)

**Files likely touched:**

- `src/adapters/config-adapter.ts`
- `src/adapters/config-adapter.test.ts`
- `src/__tests__/fixtures/valid.contextkit.yml` (test fixture)

**Estimated scope:** Small (3 files)

---



### Task 20: TDD - ConfigAdapter validates YAML schema

**Description:** RED: Write failing test for invalid YAML structure. GREEN: Implement validate() to check schema (collections object, array of skill IDs).

**Acceptance criteria:**

- [x] Test: Invalid structure returns error Result
- [x] Test: Missing collections key returns error
- [x] Test: Non-array skill list returns error
- [x] Implementation: validate() checks schema constraints
- [x] Error messages specify what's wrong with config

**Verification:**

- [x] Tests pass: `npm test -- config-adapter.test.ts`
- [x] Invalid configs rejected
- [x] Error messages are clear

**Dependencies:** Task 19

**Files likely touched:**

- `src/adapters/config-adapter.ts`
- `src/adapters/config-adapter.test.ts`
- `src/__tests__/fixtures/invalid.contextkit.yml` (test fixture)

**Estimated scope:** Small (adding to existing files)

---



### Task 21: TDD - User can sync collections from config file

**Description:** RED: Write failing test for sync operation. GREEN: Implement CollectionEngine.sync() to merge config into local state. Additive: don't delete local collections.

**Acceptance criteria:**

- [x] Test: Sync adds collections from config to local state
- [x] Test: Existing local collections preserved
- [x] Test: Config collections overwrite existing with same name
- [x] Implementation: sync() reads config via adapter, merges into state
- [x] Implementation: Writes updated state to file

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Config collections added
- [x] Local collections not deleted

**Dependencies:** Task 20

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (2 files, sync logic is complex)

---



### Task 22: TDD - Sync warns on conflicts (local skills not in config)

**Description:** RED: Write failing test that sync returns warnings for local-only collections. GREEN: Implement conflict detection and return warning messages.

**Acceptance criteria:**

- [x] Test: Sync returns success with warnings array
- [x] Test: Warning lists local collections not in config
- [x] Test: Warning message is actionable
- [x] Implementation: Compare local and config collections, note differences
- [x] Implementation: Return Result with warnings field

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Conflicts detected correctly
- [x] Warnings are clear

**Dependencies:** Task 21

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (adding to existing sync logic)

---



## Checkpoint: Config Sync Works

- [x] Config parsing tests pass
- [x] Sync operation works correctly
- [x] Conflict detection and warnings work
- [x] Integration test: Sync from real YAML file

---



## Phase 6: Skills Management



### Task 23: Implement skills.sh API search (mock HTTP calls in tests)

**Description:** Implement SkillsAdapter.search() using HTTP client to query skills.sh API. Mock HTTP calls in tests using nock.

**Acceptance criteria:**

- [x] `search(query)` makes HTTP GET to skills.sh API
- [x] Returns array of Skill objects with id, name, description
- [x] Tests mock HTTP response with nock
- [x] Handles network errors gracefully
- [x] Handles empty search results

**Verification:**

- [x] Tests pass: `npm test -- skills-adapter.test.ts`
- [x] Mock HTTP calls verified
- [x] Error cases handled

**Dependencies:** Task 3 (needs interfaces)

**Files likely touched:**

- `src/adapters/skills-adapter.ts`
- `src/adapters/skills-adapter.test.ts`

**Estimated scope:** Medium (2 files, HTTP client setup)

---



### Task 24: Implement npx skills install wrapper

**Description:** Implement SkillsAdapter.install() using execa to run npx skills add command. Mock subprocess in tests.

**Acceptance criteria:**

- [x] `install(skillId)` executes `npx skills add <skillId>`
- [x] Returns success Result on successful install
- [x] Returns error Result if subprocess fails
- [x] Tests mock subprocess with vi.mock (Vitest)
- [x] Parses error output from npx

**Verification:**

- [x] Tests pass: `npm test -- skills-adapter.test.ts`
- [x] Subprocess mocked correctly
- [x] Error handling works

**Dependencies:** Task 3

**Files likely touched:**

- `src/adapters/skills-adapter.ts`
- `src/adapters/skills-adapter.test.ts`

**Estimated scope:** Small (adding to existing files)

---



### Task 25: Implement skillsmith convert wrapper

**Description:** Implement SkillsAdapter.convert() using execa to run skillsmith command. Mock subprocess in tests.

**Acceptance criteria:**

- [x] `convert(skillId, targetIDE)` executes `skillsmith convert ...`
- [x] Supports target IDEs: cursor, claude, windsurf
- [x] Returns success/error Result
- [x] Tests mock subprocess
- [x] Handles missing skillsmith binary

**Verification:**

- [x] Tests pass: `npm test -- skills-adapter.test.ts`
- [x] Conversion command correct
- [x] Missing binary handled

**Dependencies:** Task 3

**Files likely touched:**

- `src/adapters/skills-adapter.ts`
- `src/adapters/skills-adapter.test.ts`

**Estimated scope:** Small (adding to existing files)

---



### Task 26: Add installed skills tracking to state

**Description:** Extend State type to include installedSkills array. Update CollectionEngine to track installed skills when install() called via adapter.

**Acceptance criteria:**

- [x] State includes `installedSkills: Skill[]`
- [x] Engine calls adapter.getInstalled() on startup
- [x] Install operation adds skill to state.installedSkills
- [x] Tests verify tracking works
- [x] State persistence includes installed skills

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Installed skills tracked in state
- [x] State file includes installed skills

**Dependencies:** Task 24

**Files likely touched:**

- `src/types/index.ts`
- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (adding tracking logic)

---



## Checkpoint: Skills Management Works

- [x] Skills adapter tests pass with mocked external calls
- [x] Search returns results
- [x] Install and convert wrappers work
- [x] Installed skills tracked in state

---



## Phase 7: CLI Interface



### Task 27: Set up CLI framework (commander or yargs)

**Description:** Initialize CLI application using commander.js. Set up command structure, version, help text, and global options.

**Acceptance criteria:**

- [x] CLI entry point at `src/cli/index.ts`
- [x] Commander.js configured
- [x] Version flag works: `contextkit --version`
- [x] Help text works: `contextkit --help`
- [x] Executable script configured in package.json

**Verification:**

- [x] Build succeeds: `npm run build`
- [x] Manual check: `node dist/cli/index.js --version`
- [x] Help text displays correctly

**Dependencies:** All Phase 2-6 tasks (needs engine and adapters ready)

**Files likely touched:**

- `src/cli/index.ts`
- `package.json` (add bin field)

**Estimated scope:** Small (2 files)

---



### Task 28: Implement `contextkit create` command

**Description:** Implement create command that parses args and calls CollectionEngine.create(). Format success/error output for terminal.

**Acceptance criteria:**

- [x] `contextkit create <name> --skills skill1,skill2` works
- [x] Calls engine.create() with parsed args
- [x] Success message: "Created collection 'name' with N skills"
- [x] Error message displays if creation fails
- [x] Tests mock engine and verify command routing

**Verification:**

- [x] Tests pass: `npm test -- cli-create.test.ts`
- [x] Manual check: `contextkit create test-collection --skills skill1`
- [x] Output is user-friendly

**Dependencies:** Task 27

**Files likely touched:**

- `src/cli/commands/create.ts`
- `src/cli/commands/create.test.ts`

**Estimated scope:** Small (2 files per command)

---



### Task 29: Implement `contextkit use` and `contextkit disable` commands

**Description:** Implement use and disable commands that call engine.activate() and engine.deactivate(). Format output.

**Acceptance criteria:**

- [x] `contextkit use <name>` activates collection
- [x] Success message: "Activated collection 'name' (N skills)"
- [x] `contextkit disable` deactivates current collection
- [x] Success message: "Deactivated collection"
- [x] Error messages for failures

**Verification:**

- [x] Tests pass: `npm test -- cli-use.test.ts`
- [x] Manual check: Commands work end-to-end
- [x] Error cases handled

**Dependencies:** Task 27

**Files likely touched:**

- `src/cli/commands/use.ts`
- `src/cli/commands/disable.ts`
- `src/cli/commands/use.test.ts`

**Estimated scope:** Small (3 files)

---



### Task 30: Implement `contextkit list` and `contextkit status` commands

**Description:** Implement list and status commands with formatted table output. List shows all collections, status shows active collection.

**Acceptance criteria:**

- [x] `contextkit list` displays table of collections
- [x] Table includes: name, skill count, last used
- [x] `contextkit status` shows active collection or "No active collection"
- [x] Output formatted with cli-table3 or similar
- [x] Tests verify correct data passed to formatter

**Verification:**

- [x] Tests pass: `npm test -- cli-list.test.ts`
- [x] Manual check: Table renders correctly
- [x] Empty state handled

**Dependencies:** Task 27

**Files likely touched:**

- `src/cli/commands/list.ts`
- `src/cli/commands/status.ts`
- `src/cli/commands/list.test.ts`

**Estimated scope:** Medium (3 files, table formatting)

---



### Task 31: Implement `contextkit search` and `contextkit install` commands

**Description:** Implement search and install commands that call SkillsAdapter methods. Display results in terminal.

**Acceptance criteria:**

- [x] `contextkit search [query]` displays skills from skills.sh
- [x] Search results formatted as table (name, description)
- [x] `contextkit install <skillId>` installs skill via adapter
- [x] Progress indicator during install
- [x] Success/error messages

**Verification:**

- [x] Tests pass: `npm test -- cli-search.test.ts`
- [x] Manual check: Search displays results
- [x] Install completes (or errors correctly)

**Dependencies:** Task 27, Task 23, Task 24

**Files likely touched:**

- `src/cli/commands/search.ts`
- `src/cli/commands/install.ts`
- `src/cli/commands/search.test.ts`

**Estimated scope:** Medium (3 files)

---



### Task 32: Implement `contextkit sync` command

**Description:** Implement sync command that calls engine.sync(). Display warnings if conflicts found.

**Acceptance criteria:**

- [x] `contextkit sync` reads .contextkit.yml and syncs
- [x] Success message: "Synced N collections from config"
- [x] Warnings displayed if local collections not in config
- [x] Error if .contextkit.yml missing or invalid

**Verification:**

- [x] Tests pass: `npm test -- cli-sync.test.ts`
- [x] Manual check: Create .contextkit.yml, run sync
- [x] Warnings displayed correctly

**Dependencies:** Task 27, Task 21

**Files likely touched:**

- `src/cli/commands/sync.ts`
- `src/cli/commands/sync.test.ts`

**Estimated scope:** Small (2 files)

---



### Task 33: Add colored output and error formatting

**Description:** Add chalk for colored output. Format success messages in green, errors in red, warnings in yellow. Consistent error formatting across all commands.

**Acceptance criteria:**

- [x] Success messages colored green
- [x] Error messages colored red
- [x] Warnings colored yellow
- [~] Error formatting includes actionable advice (basic messages only; richer "how to fix it" text is Task 37 scope)
- [x] Colors disabled when not in TTY (CI/CD friendly)

**Verification:**

- [x] Tests pass: all CLI tests
- [x] Manual check: Run commands, verify colors
- [x] No colors in non-TTY output

**Dependencies:** Tasks 28-32

**Files likely touched:**

- `src/cli/utils/output.ts`
- All command files (update to use output utilities)

**Estimated scope:** Small (updating existing files)

---



## Checkpoint: CLI Complete

- [x] All CLI commands implemented and tested
- [x] Manual testing of each command works
- [x] Error messages are user-friendly
- [x] Colors and formatting look good
- [x] Help text and examples correct

---



## Phase 8: Polish and Edge Cases



### Task 34: Handle symlink conflicts (file already exists)

**Description:** Detect and handle case where symlink target already exists. Offer clear error message with resolution steps.

**Acceptance criteria:**

- [ ] Test: Creating symlink when file exists returns specific error
- [ ] Error message: "File already exists at . Remove manually or use --force"
- [ ] Optional --force flag to overwrite (future enhancement)
- [ ] Tests verify conflict detection

**Verification:**

- [ ] Tests pass: `npm test -- edge-cases.test.ts`
- [ ] Manual test: Create conflicting file, try activation
- [ ] Error message is actionable

**Dependencies:** Task 18

**Files likely touched:**

- `src/adapters/real-fs-adapter.ts`
- `src/adapters/real-fs-adapter.test.ts`
- `src/__tests__/edge-cases.test.ts`

**Estimated scope:** Small (3 files)

---



### Task 35: Handle missing skill directories gracefully

**Description:** Detect and handle case where skill source directories don't exist. Warning instead of error.

**Acceptance criteria:**

- [ ] Test: Activating collection with missing skill directory shows warning
- [ ] Warning: "Skill 'skill-id' not found in directory"
- [ ] Collection still activates (skip missing skills)
- [ ] Tests verify warning generated

**Verification:**

- [ ] Tests pass: `npm test -- edge-cases.test.ts`
- [ ] Manual test: Activate collection with missing skill
- [ ] Warning displayed, doesn't crash

**Dependencies:** Task 18

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`
- `src/__tests__/edge-cases.test.ts`

**Estimated scope:** Small (3 files)

---



### Task 36: Add rollback on partial failure (symlink creation fails midway)

**Description:** If symlink creation fails partway through (e.g., permissions issue), rollback any created symlinks. Leave system in clean state.

**Acceptance criteria:**

- [ ] Test: Failure during activation rolls back created symlinks
- [ ] Test: State reverts to previous active collection (or none)
- [ ] Error message explains what failed and what was rolled back
- [ ] Implementation: Transaction-like behavior (all or nothing)

**Verification:**

- [ ] Tests pass: `npm test -- edge-cases.test.ts`
- [ ] Manual test: Simulate permission error midway
- [ ] Rollback leaves no partial symlinks

**Dependencies:** Task 11

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (2 files, rollback logic is complex)

---



### Task 37: Add validation messages and actionable error text

**Description:** Review all error messages. Ensure each tells user exactly what to do. Add suggestions to error messages.

**Acceptance criteria:**

- [ ] Every error includes "what went wrong" and "how to fix it"
- [ ] Examples: "Collection 'foo' not found. Run 'contextkit list' to see collections."
- [ ] Examples: "Permission denied creating symlink. Try sudo or check directory permissions."
- [ ] Validation errors include valid examples
- [ ] Documentation includes common error scenarios

**Verification:**

- [ ] Tests pass: all existing tests
- [ ] Manual review: Trigger each error, verify message quality
- [ ] Documentation updated with troubleshooting section

**Dependencies:** All previous tasks

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/adapters/real-fs-adapter.ts`
- `src/adapters/config-adapter.ts`
- `README.md`

**Estimated scope:** Small (improving existing error messages)

---



## Checkpoint: Production Ready

- [ ] All edge case tests pass
- [ ] Error messages guide user to fix issues
- [ ] Manual testing of failure scenarios works correctly
- [ ] README includes usage examples, troubleshooting
- [ ] Ready for MVP release

---



## Phase 9: GUI (Desktop App)

Deferred from the original architecture until the CLI (Phases 1-8) is stable. Same `CollectionEngine` and adapters as the CLI — this phase is presentation-only, per `docs/design/architecture.md`'s "GUI (Thin Interface)" module. Use the `.cursor/skills/build/ui/ui-ux-pro-max/` and `.cursor/skills/build/ui/ui-styling/` skills for design decisions (color, typography, layout, accessibility).



### Task 38: Decide and scaffold desktop GUI shell (Electron vs Tauri) with React

**Description:** Resolve the open question from `architecture.md`: Electron vs Tauri. Scaffold the chosen shell with a React renderer that imports `CollectionEngine` and adapters directly from the existing `src/` package — no duplicated business logic.

**Acceptance criteria:**

- [ ] Decision recorded (Electron or Tauri) with rationale
- [ ] `gui/` directory scaffolded with the chosen shell + React
- [ ] Renderer boots to a blank window in dev mode
- [ ] GUI imports `CollectionEngine`/adapters from `src/` without duplication
- [ ] `npm run gui:dev` (or equivalent) launches the app

**Verification:**

- [ ] App window opens showing placeholder content
- [ ] Build succeeds for the GUI target
- [ ] TypeScript compiles across CLI + GUI

**Dependencies:** Phase 7 complete (needs stable CollectionEngine + adapters)

**Files likely touched:**

- `gui/package.json`
- `gui/src/main.tsx`, `gui/src/App.tsx`
- Root `package.json` (workspaces), `tsconfig` references

**Estimated scope:** Medium (project scaffolding)

---



### Task 39: Set up component test harness with in-memory CollectionEngine

**Description:** Configure React Testing Library. Build a test helper that constructs a `CollectionEngine` backed by in-memory adapters (same test doubles the CLI/engine tests use) for injecting into components.

**Acceptance criteria:**

- [ ] React Testing Library configured for the GUI project
- [ ] Test helper builds a `CollectionEngine` with in-memory adapters
- [ ] Smoke test renders `<App>` and asserts it mounts without crashing

**Verification:**

- [ ] `npm test -- gui` passes

**Dependencies:** Task 38

**Files likely touched:**

- `gui/src/test-utils.tsx`
- `gui/src/App.test.tsx`

**Estimated scope:** Small (2 files)

---



### Task 40: TDD - Collection list view

**Description:** RED: failing test that a `CollectionList` component renders `engine.list()` results with the active collection (per `engine.status()`) visually indicated. GREEN: implement the component.

**Acceptance criteria:**

- [ ] Test: renders one row per collection from `engine.list()`
- [ ] Test: active collection is visually indicated
- [ ] Test: empty state shows "No collections yet"
- [ ] Implementation: `CollectionList` component

**Verification:**

- [ ] Tests pass: `npm test -- CollectionList.test.tsx`
- [ ] Manual check: renders correctly in dev mode

**Dependencies:** Task 39

**Files likely touched:**

- `gui/src/components/CollectionList.tsx`
- `gui/src/components/CollectionList.test.tsx`

**Estimated scope:** Medium (2 files)

---



### Task 41: TDD - Activate/deactivate controls

**Description:** RED/GREEN: clicking a collection row calls `engine.activate(name)`; a "Deactivate" button calls `engine.deactivate()`. UI re-renders to reflect the new status, and engine errors surface inline.

**Acceptance criteria:**

- [ ] Test: clicking a collection calls `engine.activate()` with the correct name
- [ ] Test: deactivate button calls `engine.deactivate()`
- [ ] Test: UI reflects updated active state after the action
- [ ] Test: an error Result from `engine.activate()` shows an inline error message

**Verification:**

- [ ] Tests pass: `npm test -- CollectionList.test.tsx`

**Dependencies:** Task 40

**Files likely touched:**

- `gui/src/components/CollectionList.tsx` (extended)
- `gui/src/components/CollectionList.test.tsx`

**Estimated scope:** Small (adding to existing component)

---



### Task 42: TDD - Create collection flow

**Description:** RED/GREEN: a form (name + skill picker) that calls `engine.create(name, skillIds)` on submit. Duplicate-name errors from the engine surface as validation errors in the form.

**Acceptance criteria:**

- [ ] Test: submitting a valid form calls `engine.create()` with the parsed values
- [ ] Test: a duplicate-name error Result surfaces as a form validation error
- [ ] Test: skill picker allows selecting multiple skill IDs
- [ ] Implementation: `CreateCollectionForm` component

**Verification:**

- [ ] Tests pass: `npm test -- CreateCollectionForm.test.tsx`
- [ ] Manual check: form works end-to-end in dev mode

**Dependencies:** Task 39

**Files likely touched:**

- `gui/src/components/CreateCollectionForm.tsx`
- `gui/src/components/CreateCollectionForm.test.tsx`

**Estimated scope:** Medium (2 files, form + validation)

---



### Task 43: TDD - Skill search and install panel

**Description:** RED/GREEN: a search input that calls the skills search (via the engine) and lists results; an install button that calls `engine.install(skillId)`. Show loading and error states for both async calls.

**Acceptance criteria:**

- [ ] Test: typing a query triggers search and renders results
- [ ] Test: clicking install calls `engine.install(skillId)` and shows success/error
- [ ] Test: loading state shown while search/install is pending

**Verification:**

- [ ] Tests pass: `npm test -- SkillSearch.test.tsx`

**Dependencies:** Task 39

**Files likely touched:**

- `gui/src/components/SkillSearch.tsx`
- `gui/src/components/SkillSearch.test.tsx`

**Estimated scope:** Medium (2 files, async states)

---



### Task 44: Apply design system with the ui-ux-pro-max skill

**Description:** Use `.cursor/skills/build/ui/ui-ux-pro-max/` and `.cursor/skills/build/ui/ui-styling/` to choose a coherent color palette, typography, and spacing scale, then apply it consistently across the collection list, forms, and search panel. Cover keyboard navigation and screen-reader labels for interactive elements.

**Acceptance criteria:**

- [ ] Design decisions documented (palette, font pairing, spacing scale)
- [ ] Existing components updated to use the chosen design tokens
- [ ] Accessibility check: keyboard navigation and aria labels on interactive elements
- [ ] No regressions in existing component tests

**Verification:**

- [ ] Tests pass: full GUI test suite
- [ ] Manual visual review against the documented design decisions

**Dependencies:** Tasks 40, 41, 42, 43

**Files likely touched:**

- `gui/src/styles/*`
- Existing component files (style updates only)

**Estimated scope:** Medium (styling pass across existing components)

---



### Task 45: E2E test - full GUI workflow with real engine

**Description:** End-to-end test: render the app with a real `CollectionEngine` (in-memory or temp-dir adapters, not mocked), then drive create → activate → deactivate through the rendered components, asserting UI state matches engine state at each step.

**Acceptance criteria:**

- [ ] Test drives the full create → activate → deactivate flow through rendered components
- [ ] Test uses a real `CollectionEngine`, not a mocked one
- [ ] Test verifies UI state matches engine state after each action

**Verification:**

- [ ] Tests pass: `npm test -- gui/e2e`

**Dependencies:** Tasks 40, 41, 42

**Files likely touched:**

- `gui/src/__tests__/e2e.test.tsx`

**Estimated scope:** Medium (1 file, comprehensive test)

---



## Checkpoint: GUI MVP Complete

- [ ] All GUI component tests pass
- [ ] E2E flow works end-to-end through rendered components
- [ ] Design system applied consistently, with accessibility covered
- [ ] GUI shares 100% of business logic with the CLI (no duplicated engine code)
- [ ] App builds/packages for at least one platform

---



## Summary

**Total tasks:** 45
**Estimated duration:** 8-11 focused work days (assuming 4-5 tasks per day)

**Task size distribution:**

- Small: 29 tasks (1-2 files, <1 hour each)
- Medium: 16 tasks (3-5 files, 1-2 hours each)
- Large: 0 tasks (broken down further if needed)

**Parallelization opportunities:**

- Phase 4 (FileSystem) and Phase 5 (Config) can run in parallel after Phase 3
- Phase 6 (Skills) can start after Phase 2
- Phase 7 (CLI) needs Phases 2-6 complete
- Phase 9 (GUI) needs Phase 7-8 complete (shares the same engine/adapters, but the CLI must be stable first)

**Critical path:** Phase 2 → Phase 3 → Phase 4 → Phase 7 → Phase 9