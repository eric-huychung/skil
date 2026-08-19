# ContextKit Architecture

## Overview

ContextKit is a thin orchestration layer for managing AI skill collections. The architecture prioritizes **deep modules** with small interfaces, clear seams for testing, and composition over complex abstractions.

## Technology Stack

### Core Stack: TypeScript + Node.js

**Runtime:** Node.js 18+ (LTS)
**Language:** TypeScript (strict mode)
**Testing:** Vitest
**CLI Framework:** Commander.js
**HTTP Client:** axios
**Subprocess:** execa
**YAML Parser:** js-yaml
**Output:** chalk (colors) + cli-table3 (tables)
**GUI (future):** Electron or Tauri

### Why TypeScript over Python?

**Ecosystem alignment:**
- Vercel skills CLI is TypeScript/npm (8.9M weekly downloads)
- skillsmith is TypeScript
- agent-skill-manager (asm) is TypeScript (686 stars)
- Users already have Node/npm installed for `npx skills add`

**Distribution fit:**
- Users expect `npm install -g contextkit` or `npx contextkit`
- Aligns with existing workflow: `npx skills add` → `contextkit create`
- No package manager friction (pip vs npm)

**Code sharing for GUI:**
- Electron shares engine between CLI and desktop app
- One TypeScript codebase serves both interfaces
- No backend/frontend split needed

**Tooling advantages:**
- `execa` is excellent for subprocess (wrapping `npx`, `git`)
- `commander` + `chalk` are mature CLI standards
- Vitest is fast, good TypeScript support
- `memfs` and `nock` for mocking file system and HTTP

**Trade-offs:**
- Python would be simpler if this were CLI-only with no GUI
- Python's `pathlib` is nicer than Node's `path` module
- But TypeScript wins on ecosystem integration and GUI story

### Key Dependencies

```json
{
  "dependencies": {
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.3",
    "js-yaml": "^4.1.0",
    "axios": "^1.6.0",
    "execa": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "memfs": "^4.6.0",
    "nock": "^13.4.0",
    "@types/node": "^20.10.0",
    "@types/js-yaml": "^4.0.9"
  }
}
```

## Design Principles

### Deep Modules

We organize around depth: rich implementations behind small interfaces. This gives callers leverage (simple API for complex behavior) and maintainers locality (changes concentrate in one place).

**Core deep module**: `CollectionEngine`
- Small interface: create, activate, deactivate, list, status
- Rich implementation: state management, validation, conflict detection, multi-IDE coordination
- Seam: business logic boundary
- Leverage: CLI, GUI, and tests all use the same 5 methods

**Supporting modules**: adapters that wrap complexity
- `SkillsAdapter`: wraps skills.sh API and npx commands
- `FileSystemAdapter`: wraps symlink and directory operations
- `ConfigAdapter`: wraps YAML parsing and generation

### Testability

Every module accepts dependencies rather than creating them. Tests verify behavior through public interfaces at agreed seams, not implementation details.

**Primary test seams:**
1. `CollectionEngine` public methods (business logic verification)
2. Adapter interfaces (mock external dependencies)
3. CLI command handlers (integration tests with fake adapters)

**What we don't test:**
- Private implementation details
- Third-party library internals
- File system itself (we mock it)

## Module Boundaries

### 1. CollectionEngine (Deep Module)

**Interface:**
```typescript
interface CollectionEngine {
  create(name: string, skillIds: string[]): Result<Collection>
  activate(name: string): Result<void>
  deactivate(): Result<void>
  list(): Collection[]
  status(): Status
}
```

**Implementation responsibilities:**
- Maintain collection metadata in `.contextkit/state.json`
- Validate operations (no duplicate names, collection exists before activation)
- Track active collection state
- Coordinate with FileSystemAdapter to create/remove symlinks
- Handle multi-IDE support transparently
- Detect and report conflicts during sync operations

**Why deep:**
- Callers only see 5 methods with simple signatures
- Hides state management, validation logic, IDE detection, error handling
- One implementation serves CLI, GUI, and all tests
- Changes to state format, validation rules, or IDE support don't affect callers

**Seam:** Business logic boundary
- Tests mock FileSystemAdapter and ConfigAdapter
- Tests verify state transitions without touching real files
- Integration tests use in-memory implementations

### 2. FileSystemAdapter (Adapter Module)

**Interface:**
```typescript
interface FileSystemAdapter {
  createSymlink(source: string, target: string): Result<void>
  removeSymlink(path: string): Result<void>
  detectIDEs(projectRoot: string): IDEInfo[]
  readJSON<T>(path: string): Result<T>
  writeJSON<T>(path: string, data: T): Result<void>
}
```

**Implementation:**
- Node.js fs operations
- IDE directory detection (`.agents/`, `.claude/`, `.windsurf/`)
- Error handling for permissions, missing paths, existing symlinks
- Path resolution and validation

**Why this is the right seam:**
- All file operations go through one interface
- Easy to mock with in-memory filesystem for tests
- Real filesystem concerns (permissions, symlink support) isolated here
- Can swap implementations (real fs, memory fs, test doubles)

**Test strategy:**
- Unit tests use `memfs` to simulate file operations
- Mock this adapter when testing CollectionEngine
- Integration tests verify symlink creation with temp directories

### 3. ConfigAdapter (Adapter Module)

**Interface:**
```typescript
interface ConfigAdapter {
  read(path: string): Result<Config>
  write(path: string, config: Config): Result<void>
  validate(config: Config): Result<void>
}
```

**Implementation:**
- YAML parsing with `js-yaml`
- Schema validation
- Error reporting for malformed configs
- Export current state to config format

**Why this is the right seam:**
- Config format changes don't affect CollectionEngine
- Easy to test with string fixtures
- Can support multiple formats (YAML, JSON, TOML) without changing interface

**Test strategy:**
- Unit tests with YAML fixtures
- Mock for CollectionEngine tests
- Validation tests verify schema enforcement

### 4. SkillsAdapter (Adapter Module)

**Interface:**
```typescript
interface SkillsAdapter {
  search(query: string): Promise<Result<Skill[]>>
  install(skillId: string): Promise<Result<void>>
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>
  getInstalled(): Skill[]
}
```

**Implementation:**
- HTTP client for skills.sh API
- Subprocess execution for `npx skills add`
- Subprocess execution for `skillsmith`
- Error parsing and user-friendly messages
- Retry logic for network failures

**Why this is the right seam:**
- Isolates external tool dependencies
- Tests don't hit real APIs or run real commands
- Can add new external tools without changing interface
- Error handling for network/subprocess issues in one place

**Test strategy:**
- Mock HTTP calls with `nock`
- Mock subprocess with `vi.mock('execa')` (Vitest)
- Verify error handling and retries

### 5. CLI (Thin Interface)

**Structure:**
```typescript
interface CLICommand {
  name: string
  description: string
  options: Option[]
  handler(args, adapters): Promise<void>
}
```

**Implementation:**
- Command parsing with `commander` or `yargs`
- Route commands to CollectionEngine
- Format output (tables, colors, success/error messages)
- Minimal logic—just I/O and routing

**Why thin:**
- No business logic here
- All real work happens in CollectionEngine
- Easy to test command parsing separately from business logic

**Test strategy:**
- Integration tests with mocked adapters
- Verify command routing and output formatting
- Don't retest business logic already covered by CollectionEngine tests

### 6. GUI (Thin Interface)

**Structure:**
- Electron app or Tauri app
- React UI components
- Same CollectionEngine as CLI

**Implementation:**
- Visual components: collection list, skill checkboxes, search bar
- Event handlers call CollectionEngine methods
- No GUI-specific business logic
- State management for UI only (selected items, search filters)

**Why thin:**
- GUI is just a different presentation layer
- All logic lives in CollectionEngine
- Can develop and test CLI first, add GUI later
- GUI tests focus on rendering and user interaction, not business logic

**Test strategy:**
- Component tests with React Testing Library
- Mock CollectionEngine responses
- E2E tests with real engine, mocked adapters

## Data Model

### State (`state.json`)

```typescript
interface State {
  collections: Collection[]
  activeCollection: string | null
  installedSkills: Skill[]
  version: string
}

interface Collection {
  name: string
  skills: string[] // skill IDs
  createdAt: string
  lastUsedAt: string | null
}

interface Skill {
  id: string // e.g., "obra/react-patterns"
  source: string // "skills.sh" | "github" | "local"
  installedAt: string
}
```

### Config (`.contextkit.yml`)

```yaml
version: "1.0"
collections:
  frontend:
    - obra/react-patterns
    - addyosmani/performance-review
  backend:
    - addyosmani/api-design
    - vercel-labs/security-review
```

## Key Technical Decisions

### Symlink Strategy

**Decision:** Collections activate by creating symlinks in IDE directories, deactivate by removing them.

**Rationale:**
- Instant activation (no file copying)
- IDE-compatible (most IDEs watch directories)
- Source of truth remains in ContextKit-managed directory
- Easy to verify (check symlink existence)

**Trade-offs:**
- Requires symlink support (Windows may need dev mode)
- IDE restart may be needed (varies by IDE)
- Symlink conflicts need detection and user resolution

**Test seam:** FileSystemAdapter abstracts symlink operations

### One Active Collection

**Decision:** Only one collection can be active at a time.

**Rationale:**
- Simple mental model (no composition complexity)
- Avoids skill conflicts
- Easy to implement and test
- Can add composition later if validated by users

**Test coverage:**
- Activating collection B deactivates collection A
- Status always shows 0 or 1 active collection

### Local-Only Collections (MVP)

**Decision:** Collections are project-local, stored in `.contextkit/` directory.

**Rationale:**
- Simpler than global collections
- Aligns with project-specific skill needs
- Easier to version control and share
- Can add global collections post-MVP if needed

**Implementation:** No global state file, all operations scoped to current directory

### Sync as Additive

**Decision:** `contextkit sync` merges config into local state, doesn't delete local collections.

**Rationale:**
- Non-destructive (user keeps local experiments)
- Warns on conflicts (local skill not in config)
- Team config is source of truth for what to install, not what to remove

**Test cases:**
- Sync adds missing collections
- Sync warns on local-only collections
- Sync doesn't delete user's custom collections

## Test Strategy

### Test Pyramid

**Unit Tests (70%)**
- CollectionEngine business logic
- Adapter error handling
- Config validation
- State transitions

**Integration Tests (20%)**
- CLI commands with mocked adapters
- Full create → activate → deactivate flows
- Sync operation with real temp directories

**E2E Tests (10%)**
- Full CLI workflow in temp project
- GUI workflow with mocked external tools
- Multi-IDE symlink creation

### Test Seams (Agreed)

Per TDD skill, we test only at pre-agreed seams:

1. **CollectionEngine public methods** (primary seam)
   - Every business rule tested here
   - Adapters mocked as test doubles

2. **Adapter interfaces** (secondary seams)
   - Verify error handling and edge cases
   - Mock underlying libraries (fs, execa, axios)

3. **CLI command handlers** (integration seam)
   - End-to-end command flow
   - Output formatting
   - Error messages

**Not test seams:**
- Private CollectionEngine methods
- State file JSON structure (internal detail)
- Third-party library internals

### TDD Workflow

**Red → Green loop per feature:**

1. **Write failing test** at agreed seam
2. **Implement minimal code** to pass test
3. **Verify** test passes
4. **Move to next test**

**Vertical slicing example:**

Task 1: User can create a collection
- Test: `engine.create('frontend', [])` returns success
- Test: State file contains new collection
- Test: Duplicate name returns error

Task 2: User can activate a collection
- Test: `engine.activate('frontend')` returns success
- Test: Symlinks created in all IDE directories
- Test: Activating non-existent collection returns error

### Mocking Strategy

**Mock at adapter boundaries**, not inside implementations:

```typescript
// Good: Mock the adapter interface
const mockFS = {
  createSymlink: vi.fn(),
  removeSymlink: vi.fn(),
  detectIDEs: vi.fn(() => [{ name: 'cursor', path: '.agents' }]),
  readJSON: vi.fn(),
  writeJSON: vi.fn(),
}

const engine = new CollectionEngine(mockFS, mockConfig, mockSkills)

// Bad: Mock internal engine methods
vi.spyOn(engine, '_validateCollectionName')
```

See `skills/philosophy/tdd/mocking.md` for detailed mocking patterns.

## Architecture Diagram

See `architecture-diagram.html` for visual representation of modules, seams, and data flow.

## Implementation Notes

### Dependency Injection

All modules accept dependencies as constructor arguments:

```typescript
class CollectionEngine {
  constructor(
    private fs: FileSystemAdapter,
    private config: ConfigAdapter,
    private skills: SkillsAdapter
  ) {}
}
```

**Benefits:**
- Testable (inject mocks)
- Flexible (swap implementations)
- Clear dependencies (explicit in constructor)

### Error Handling

Use Result type for operations that can fail:

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: Error }
```

**Benefits:**
- Type-safe error handling
- Forces callers to handle errors
- No thrown exceptions in business logic (exceptions for truly exceptional cases only)

### State Management

State file is the single source of truth:
- Read at engine initialization
- Write after every mutation
- Atomic writes (write to temp, then rename)
- Schema versioning for future migrations

## Open Questions

**To validate during implementation:**

1. **IDE restart requirements:** Do Cursor/Claude Desktop/Windsurf need restart after symlink changes? Or do they watch directories?
2. **Symlink conflicts:** What if user manually created symlinks? Overwrite, skip, or error?
3. **Config merge strategy:** Should sync be fully additive, or offer a "destructive sync" mode that matches config exactly?
4. **Error recovery:** If symlink creation fails halfway through (e.g., permissions), should we rollback or leave partial state?

**Answer these through:**
- Prototype with real IDEs (Task 3)
- User feedback during MVP testing
- Error scenario testing (Task 8)

## Success Criteria

This architecture succeeds if:

1. **Adding a new IDE takes < 2 hours** (just add to IDE detection, symlink paths)
2. **Adding a new external tool takes < 4 hours** (just add adapter, no engine changes)
3. **CollectionEngine tests have zero file system dependencies** (fully mocked)
4. **CLI and GUI share 100% of business logic** (no duplicate code)
5. **Error messages are actionable** (tell user exactly what to fix)

## References

- Deep module design: `skills/design/codebase-design/SKILL.md`
- TDD principles: `skills/philosophy/tdd/SKILL.md`
- PRD: `docs/requirements/prd.md`
