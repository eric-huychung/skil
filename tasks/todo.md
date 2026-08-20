# ContextKit Implementation Tasks

Tasks follow TDD: write failing test first, then minimal implementation. Each task should take 30-90 minutes focused work.

---

## Phase 1: Foundation

### Task 1: Initialize TypeScript project with Vitest

**Description:** Bootstrap Node.js project with TypeScript, Vitest testing framework, and development tooling. Set up proper module resolution, source/test directories, and npm scripts.

**Acceptance criteria:**

- [x] `package.json` created with TypeScript and Vitest dependencies
- [x] `tsconfig.json` configured for Node.js with strict mode
- [x] Vitest configured (`vitest.config.ts`)
- [x] `npm test` runs successfully (even with no tests)
- [x] `npm run build` compiles TypeScript to `dist/`
- [x] `.gitignore` includes `node_modules/`, `dist/`, `.contextkit/`

**Verification:**

- [x] Tests pass: `npm test`
- [x] Build succeeds: `npm run build`
- [x] TypeScript compiles without errors

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

- [x] `Result<T>` type defined as discriminated union
- [x] Helper functions: `ok<T>(value: T)`, `err(error: Error)`
- [x] Helper functions: `isOk(result)`, `isErr(result)`
- [x] Test cases verify type narrowing works correctly
- [x] Documentation with usage examples

**Verification:**

- [x] Tests pass: `npm test -- result.test.ts`
- [x] TypeScript type checking catches misuse of Result type
- [x] Manual check: Example code compiles and runs

**Dependencies:** Task 1

**Files likely touched:**

- `src/core/result.ts`
- `src/core/result.test.ts`

**Estimated scope:** Small (2 files)

---



### Task 3: Define core interfaces (Engine, Adapters)

**Description:** Define TypeScript interfaces for CollectionEngine and all adapters. This is the contract that guides all implementation. Interfaces include type signatures and JSDoc comments explaining behavior.

**Acceptance criteria:**

- [x] `ICollectionEngine` interface with 5 methods: create, activate, deactivate, list, status (later grew to include sync, install, search as those phases landed)
- [x] `IFileSystemAdapter` interface with symlink, IDE detection, and JSON methods
- [x] `IConfigAdapter` interface with read, write, validate
- [x] `ISkillsAdapter` interface with search, install, convert, getInstalled
- [x] All data types defined: `Collection`, `State`, `Config`, `Status`, `IDEInfo`, `Skill`
- [x] JSDoc comments explain expected behavior and error cases

**Verification:**

- [x] Build succeeds: `npm run build`
- [x] No TypeScript errors
- [x] Manual check: Interfaces are clear and well-documented

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

- [x] `InMemoryFileSystemAdapter` stores symlinks and files in Map
- [x] `InMemoryConfigAdapter` stores config in memory
- [x] `InMemorySkillsAdapter` returns hardcoded skill list
- [x] All adapters implement their interfaces correctly
- [x] Helper method to reset in-memory state between tests
- [x] Basic tests verify adapters work as expected

**Verification:**

- [x] Tests pass: `npm test -- adapters/in-memory.test.ts`
- [x] TypeScript confirms adapters satisfy interfaces
- [x] Manual check: Can create and query in-memory data

**Dependencies:** Task 3 (needs interfaces)

**Files likely touched:**

- `src/adapters/in-memory-fs.ts`
- `src/adapters/in-memory-config.ts`
- `src/adapters/in-memory-skills.ts`
- `src/adapters/in-memory.test.ts`

**Estimated scope:** Medium (4 files)

---



## Checkpoint: Foundation Complete

- [x] `npm test` passes
- [x] `npm run build` succeeds with no errors
- [x] Result type works correctly
- [x] All interfaces defined
- [x] In-memory adapters ready for use

---



## Phase 2: Collection Management



### Task 5: TDD - User can create a collection

**Description:** RED: Write failing test for creating a collection. GREEN: Implement CollectionEngine.create() to pass test. Verify collection appears in state.

**Acceptance criteria:**

- [x] Test: `engine.create('frontend', [])` returns success
- [x] Test: Created collection stored in state with correct name and empty skills
- [x] Test: Collection has `createdAt` timestamp
- [x] Implementation: CollectionEngine class with create method
- [x] Implementation: State structure initialized correctly
- [x] Follow TDD: test written first, implementation second

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Can create collection with in-memory adapters
- [x] State includes new collection

**Dependencies:** Task 4 (needs in-memory adapters)

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files)

---



### Task 6: TDD - User can list all collections

**Description:** RED: Write failing test for listing collections. GREEN: Implement CollectionEngine.list() to return all collections from state.

**Acceptance criteria:**

- [x] Test: `engine.list()` returns empty array when no collections
- [x] Test: `engine.list()` returns all created collections
- [x] Test: Returned collections have correct properties (name, skills, timestamps)
- [x] Implementation: list() method reads from state

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] List correctly shows all collections
- [x] Empty state handled correctly

**Dependencies:** Task 5

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, just adding to existing)

---



### Task 7: TDD - Creating duplicate collection returns error

**Description:** RED: Write failing test for duplicate name validation. GREEN: Implement validation in create() to check for existing collection name. Return error Result instead of throwing.

**Acceptance criteria:**

- [x] Test: Creating collection with duplicate name returns error Result
- [x] Test: Error message is clear: "Collection 'frontend' already exists"
- [x] Test: State unchanged after failed creation attempt
- [x] Implementation: Validation checks collection names before creating

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Duplicate creation fails gracefully
- [x] Error message is actionable

**Dependencies:** Task 5

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding validation logic)

---



### Task 8: TDD - State persists to JSON file

**Description:** RED: Write failing test that state is written to file after create. GREEN: Implement state persistence via FileSystemAdapter.writeJSON(). Use in-memory adapter for test, verify writeJSON called correctly.

**Acceptance criteria:**

- [x] Test: Creating collection calls `fs.writeJSON()` with correct state
- [x] Test: State written to `.contextkit/state.json` path
- [x] Test: JSON structure matches State type
- [x] Implementation: Engine writes state after every mutation
- [x] Mock assertion verifies write was called

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Mock assertion confirms writeJSON called
- [x] State structure is correct JSON

**Dependencies:** Task 5

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding persistence)

---



### Task 9: TDD - State loads from existing JSON file

**Description:** RED: Write failing test for loading existing state on engine initialization. GREEN: Implement constructor to load state from file via FileSystemAdapter.readJSON(). Handle missing file (start with empty state).

**Acceptance criteria:**

- [x] Test: Engine constructor loads existing state from file
- [x] Test: Collections from file appear in list()
- [x] Test: Missing state file handled gracefully (empty state)
- [~] Test: Corrupted JSON returns error during construction (no test for this; actual behavior falls back to empty state silently rather than erroring - worth a follow-up task)
- [x] Implementation: Constructor calls fs.readJSON() and initializes state

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Existing state loaded on startup
- [x] Missing file doesn't crash

**Dependencies:** Task 8

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding load logic)

---



## Checkpoint: Basic Engine Works

- [x] All CollectionEngine tests pass (5+ tests)
- [x] Can create and list collections programmatically
- [x] State persists and loads correctly
- [x] No file system operations in tests (fully mocked via in-memory adapter)
- [x] Error cases handled with Result type

---



## Phase 3: Collection Activation



### Task 10: TDD - User can activate a collection

**Description:** RED: Write failing test for activating a collection. GREEN: Implement activate() to set active collection in state. No symlinks yet—just state management.

**Acceptance criteria:**

- [x] Test: `engine.activate('frontend')` returns success
- [x] Test: Status shows 'frontend' as active collection
- [x] Test: Activating non-existent collection returns error
- [x] Implementation: activate() updates state.activeCollection
- [x] Implementation: Validation checks collection exists

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Status correctly shows active collection
- [x] Error on non-existent collection

**Dependencies:** Task 9

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding activate)

---



### Task 11: TDD - Activating collection creates symlinks in IDE directories

**Description:** RED: Write failing test that activate() calls FileSystemAdapter.createSymlink() for each skill. GREEN: Implement symlink creation via adapter. Use mock to verify calls.

**Acceptance criteria:**

- [x] Test: Activating collection calls `fs.createSymlink()` for each skill
- [x] Test: Symlinks created in all detected IDE directories
- [x] Test: Mock assertions verify correct source and target paths
- [x] Implementation: Engine calls adapter.detectIDEs() then creates symlinks
- [x] Implementation: Handles multiple IDE directories

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Mock assertions confirm symlinks created
- [x] Correct paths passed to adapter

**Dependencies:** Task 10

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (2 files, adding symlink logic)

---



### Task 12: TDD - Only one collection can be active at a time

**Description:** RED: Write failing test that activating collection B deactivates collection A. GREEN: Implement deactivation logic in activate(). Remove old symlinks before creating new ones.

**Acceptance criteria:**

- [x] Test: Activating collection B when A is active removes A's symlinks
- [x] Test: Only B's symlinks exist after activation
- [x] Test: Status shows B as active, not A
- [x] Implementation: activate() calls deactivate internally if collection already active

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Only one collection active at a time
- [x] Symlinks correctly swapped

**Dependencies:** Task 11

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding deactivation logic)

---



### Task 13: TDD - User can deactivate active collection

**Description:** RED: Write failing test for deactivate(). GREEN: Implement deactivate() to clear activeCollection state and return success.

**Acceptance criteria:**

- [x] Test: `engine.deactivate()` returns success
- [x] Test: Status shows no active collection after deactivate
- [x] Test: Deactivating when nothing active returns success (idempotent)
- [x] Implementation: deactivate() sets state.activeCollection to null

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Deactivate clears active status
- [x] Idempotent behavior works

**Dependencies:** Task 10

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding deactivate)

---



### Task 14: TDD - Deactivating removes all symlinks

**Description:** RED: Write failing test that deactivate() calls removeSymlink() for each active skill. GREEN: Implement symlink removal via adapter.

**Acceptance criteria:**

- [x] Test: Deactivating calls `fs.removeSymlink()` for each skill in active collection
- [x] Test: All symlinks removed from all IDE directories
- [x] Test: Mock assertions verify removeSymlink called with correct paths
- [x] Implementation: Engine iterates over active collection skills and removes symlinks

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts`
- [x] Mock confirms symlinks removed
- [x] All IDE directories handled

**Dependencies:** Task 13

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Small (2 files, adding removal logic)

---



## Checkpoint: Activation Works

- [x] All activation tests pass
- [x] Activate/deactivate lifecycle complete
- [x] Symlink creation/removal verified via mocks
- [x] Status correctly reflects active collection
- [x] Ready for real FileSystemAdapter integration

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

- [x] Test: Creating symlink when file exists returns specific error
- [x] Error message: "File already exists at . Remove manually or use --force"
- [~] Optional --force flag to overwrite (future enhancement; not implemented, out of MVP scope)
- [x] Tests verify conflict detection

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts` (conflict now surfaces via `activate()`, covered there rather than a separate edge-cases file)
- [x] Manual test: Create conflicting file, try activation
- [x] Error message is actionable

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

- [x] Test: Activating collection with missing skill directory shows warning
- [x] Warning: "Skill 'skill-id' not found in directory"
- [x] Collection still activates (skip missing skills)
- [x] Tests verify warning generated

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts` (and `integration.test.ts` for the real-fs case; no separate edge-cases file, kept alongside existing activate() tests)
- [x] Manual test: Activate collection with missing skill
- [x] Warning displayed, doesn't crash

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

- [x] Test: Failure during activation rolls back created symlinks
- [x] Test: State reverts to previous active collection (or none)
- [~] Error message explains what failed and what was rolled back (explains what failed and how to fix it; doesn't enumerate what was rolled back since that's an implementation detail, not user-actionable)
- [x] Implementation: Transaction-like behavior (all or nothing)

**Verification:**

- [x] Tests pass: `npm test -- collection-engine.test.ts` (no separate edge-cases file; rollback tests live alongside the other activate() tests)
- [x] Manual test: Simulate permission error midway (simulated via a symlink conflict, same failure path)
- [x] Rollback leaves no partial symlinks

**Dependencies:** Task 11

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/core/collection-engine.test.ts`

**Estimated scope:** Medium (2 files, rollback logic is complex)

---



### Task 37: Add validation messages and actionable error text

**Description:** Review all error messages. Ensure each tells user exactly what to do. Add suggestions to error messages.

**Acceptance criteria:**

- [x] Every error includes "what went wrong" and "how to fix it"
- [x] Examples: "Collection 'foo' not found. Run 'contextkit list' to see collections."
- [x] Examples: "Permission denied creating symlink. Try sudo or check directory permissions." (implemented as "Permission denied creating symlink at '<path>'. Check directory permissions and try again.")
- [x] Validation errors include valid examples
- [x] Documentation includes common error scenarios

**Verification:**

- [x] Tests pass: all existing tests
- [x] Manual review: Trigger each error, verify message quality
- [x] Documentation updated with troubleshooting section

**Dependencies:** All previous tasks

**Files likely touched:**

- `src/core/collection-engine.ts`
- `src/adapters/real-fs-adapter.ts`
- `src/adapters/config-adapter.ts`
- `README.md`

**Estimated scope:** Small (improving existing error messages)

---



## Checkpoint: Production Ready

- [x] All edge case tests pass
- [x] Error messages guide user to fix issues
- [x] Manual testing of failure scenarios works correctly
- [x] README includes usage examples, troubleshooting
- [x] Ready for MVP release

---



## Phase 9: GUI (Desktop App)

Deferred from the original architecture until the CLI (Phases 1-8) is stable. Same `CollectionEngine` and adapters as the CLI — this phase is presentation-only, per `docs/design/architecture.md`'s "GUI (Thin Interface)" module. Use the `.cursor/skills/build/ui/ui-ux-pro-max/` and `.cursor/skills/build/ui/ui-styling/` skills for design decisions (color, typography, layout, accessibility).



### Task 38: Decide and scaffold desktop GUI shell (Electron vs Tauri) with React

**Description:** Resolve the open question from `architecture.md`: Electron vs Tauri. Scaffold the chosen shell with a React renderer that imports `CollectionEngine` and adapters directly from the existing `src/` package — no duplicated business logic.

**Acceptance criteria:**

- [x] Decision recorded (Electron or Tauri) with rationale — **Electron**: renderer + main both run on Node/Chromium, so the main process can `import` `CollectionEngine` and the real adapters straight from `src/` with zero rewrite or IPC-to-Rust bridge. Tauri's Rust backend can't run the TypeScript engine natively; reusing it would need a Node sidecar + IPC plumbing, working against the "no duplicated engine code" goal. Cost accepted: larger installer (~150-200MB) vs Tauri's ~10MB.
- [x] `gui/` directory scaffolded with the chosen shell + React (electron-vite + React 19 + TypeScript + Tailwind v4)
- [x] Renderer boots to a window in dev/production mode (verified: built app launched with main/gpu/renderer/network processes all healthy, no crash)
- [x] GUI imports `CollectionEngine`/adapters from `src/` without duplication (main process imports `../../../src/core/collection-engine.js` etc. directly; renderer never touches Node — it calls a `window.contextkit` bridge over IPC, since Electron's `contextIsolation` blocks direct Node access from the renderer)
- [x] `npm run gui:dev` (and `gui:build`) launch/build the app from the repo root

**Verification:**

- [x] App window opens (verified via process check: main + renderer + gpu-process all running, no errors in log; manual visual confirmation still recommended via `npm run gui:dev`)
- [x] Build succeeds for the GUI target: `npm run gui:build`
- [x] TypeScript compiles across CLI + GUI: `npm run build` (CLI) + `npm run gui:build` --workspace typecheck (renderer + main/preload)

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

- [x] React Testing Library configured for the GUI project
- [x] Test helper builds a `CollectionEngine` with in-memory adapters
- [x] Smoke test renders `<App>` and asserts it mounts without crashing

**Verification:**

- [x] `npm test -- gui` passes (via `npm run gui:test`)

**Dependencies:** Task 38

**Files likely touched:**

- `gui/src/test-utils.tsx`
- `gui/src/App.test.tsx`

**Estimated scope:** Small (2 files)

---



### Task 40: TDD - Collection list view

**Description:** RED: failing test that a `CollectionList` component renders `engine.list()` results with the active collection (per `engine.status()`) visually indicated. GREEN: implement the component.

**Acceptance criteria:**

- [x] Test: renders one row per collection from `engine.list()`
- [x] Test: active collection is visually indicated
- [x] Test: empty state shows "No collections yet"
- [x] Implementation: `CollectionList` component

**Verification:**

- [x] Tests pass: `npm test -- CollectionList.test.tsx`
- [~] Manual check: renders correctly in dev mode (not verifiable from this sandbox — `electron-vite dev` can't launch the real Electron binary here, falls back to plain Node and fails on the `electron` module's native exports; please run `npm run gui:dev` locally to confirm)

**Dependencies:** Task 39

**Files likely touched:**

- `gui/src/components/CollectionList.tsx`
- `gui/src/components/CollectionList.test.tsx`

**Estimated scope:** Medium (2 files)

---



### Task 41: TDD - Activate/deactivate controls

**Description:** RED/GREEN: clicking a collection row calls `engine.activate(name)`; a "Deactivate" button calls `engine.deactivate()`. UI re-renders to reflect the new status, and engine errors surface inline.

**Acceptance criteria:**

- [x] Test: clicking a collection calls `engine.activate()` with the correct name
- [x] Test: deactivate button calls `engine.deactivate()`
- [x] Test: UI reflects updated active state after the action
- [x] Test: an error Result from `engine.activate()` shows an inline error message

**Verification:**

- [x] Tests pass: `npm test -- CollectionList.test.tsx`

**Dependencies:** Task 40

**Files likely touched:**

- `gui/src/components/CollectionList.tsx` (extended)
- `gui/src/components/CollectionList.test.tsx`

**Estimated scope:** Small (adding to existing component)

---



### Task 42: TDD - Create collection flow

**Description:** RED/GREEN: a form (name + skill picker) that calls `engine.create(name, skillIds)` on submit. Duplicate-name errors from the engine surface as validation errors in the form.

**Acceptance criteria:**

- [x] Test: submitting a valid form calls `engine.create()` with the parsed values
- [x] Test: a duplicate-name error Result surfaces as a form validation error
- [x] Test: skill picker allows selecting multiple skill IDs
- [x] Implementation: `CreateCollectionForm` component

**Verification:**

- [x] Tests pass: `npm test -- CreateCollectionForm.test.tsx`
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

- [x] Test: typing a query triggers search and renders results
- [x] Test: clicking install calls `engine.install(skillId)` and shows success/error
- [x] Test: loading state shown while search/install is pending

**Verification:**

- [x] Tests pass: `npm test -- SkillSearch.test.tsx`

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