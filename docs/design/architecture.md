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
- Small interface: create, addSkill, removeSkill, getCommand, list, sync, install, search, browse, convert, export
- Rich implementation: state management, validation, config sync, skill install/convert coordination, bulk IDE export
- Seam: business logic boundary
- Leverage: CLI, GUI, and tests all use the same methods

**Supporting modules**: adapters that wrap complexity
- `SkillsAdapter`: wraps skills.sh API and npx commands
- `FileSystemAdapter`: wraps atomic state-file JSON I/O
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
  create(name: string, skillIds: string[], command?: string): Result<Collection>
  addSkill(name: string, skillId: string): Result<Collection>
  removeSkill(name: string, skillId: string): Result<Collection>
  getCommand(name: string): Result<string>
  list(): Collection[]
  sync(configPath: string): Result<SyncResult>
  install(skillId: string): Promise<Result<Skill>>
  search(query: string): Promise<Result<Skill[]>>
  browse(view: BrowseView): Promise<Result<Skill[]>>
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>
  export(collectionNames: string[], targetIDE: IDE): Promise<Result<ExportResult>>
}
```

**Implementation responsibilities:**
- Maintain collection metadata in `.contextkit/state.json`
- Validate operations (no duplicate names, collection exists before add/remove/export)
- Coordinate with SkillsAdapter for install/search/browse/convert and bulk export
- Detect and report conflicts during sync operations

**Why deep:**
- Callers only see a handful of methods with simple signatures
- Hides state management, validation logic, error handling, and per-skill export looping
- One implementation serves CLI, GUI, and all tests
- Changes to state format or validation rules don't affect callers

**Seam:** Business logic boundary
- Tests mock FileSystemAdapter and ConfigAdapter
- Tests verify state transitions without touching real files
- Integration tests use in-memory implementations

### 2. FileSystemAdapter (Adapter Module)

**Interface:**
```typescript
interface FileSystemAdapter {
  readJSON<T>(path: string): Result<T>
  writeJSON<T>(path: string, data: T): Result<void>
}
```

**Implementation:**
- Atomic JSON read/write (write to temp file, then rename)
- Error handling for permissions and missing/malformed files

_Previously also owned symlink creation/removal and IDE directory detection for
activate/deactivate; those methods were removed along with that feature — see
"Export Replaces Symlink Activation" in the Decision Log below._

**Why this is the right seam:**
- All state-file I/O goes through one interface
- Easy to mock with in-memory filesystem for tests
- Real filesystem concerns (permissions, atomic writes) isolated here
- Can swap implementations (real fs, memory fs, test doubles)

**Test strategy:**
- Unit tests use `memfs` to simulate file operations
- Mock this adapter when testing CollectionEngine
- Integration tests verify read/write with temp directories

### 3. ConfigAdapter (Adapter Module)

**Interface:**
```typescript
interface ConfigAdapter {
  read(path: string): Result<Config>
  validate(config: Config): Result<void>
}
```

**Implementation:**
- YAML parsing with `js-yaml`
- Schema validation
- Error reporting for malformed configs

_Not implemented: writing/exporting a config file (PRD story 11). No caller needs it yet — add `write()` back to the interface when `contextkit export` is built._

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
  browse(view: BrowseView): Promise<Result<Skill[]>>
  install(skillId: string): Promise<Result<void>>
  convert(skillId: string, targetIDE: IDE): Promise<Result<void>>
  getInstalled(): Skill[]
}
```

**Implementation:**
- `search` calls ContextKit's own Vercel-hosted backend (`GET /api/skills/search?q=`, see `src/backend/skills-proxy.ts`), not skills.sh directly — the backend mints a short-lived Vercel OIDC token server-side and forwards it to skills.sh, so no user ever needs a `SKILLS_API_KEY`. Base URL defaults to `https://contextkit.dev`, overridable via `CONTEXTKIT_API_URL`.
- `browse` calls `GET /api/skills?view=all-time|trending` on the same backend. That route always requests `per_page=20` from skills.sh so CLI (display 10) and GUI (display 20) share one CDN cache key per view. On 200 it sets `Cache-Control: public, s-maxage=86400, stale-while-revalidate=3600`. The search route does **not** send these headers — typed queries are not a shared leaderboard.
- Subprocess execution for `npx skills add` (`install`) and `skillsmith convert` (`convert`) — both run entirely locally; skills.sh has no HTTP endpoint for either, so there's nothing for the backend proxy to front for them.
- Error parsing and user-friendly messages

**Why this is the right seam:**
- Isolates external tool dependencies (HTTP backend, subprocess) from CollectionEngine
- Tests don't hit real APIs or run real commands
- Can add new external tools without changing interface
- Error handling for network/subprocess issues in one place
- The OIDC-authenticated backend proxy is an implementation detail behind `search` and `browse` — CollectionEngine and its tests never know it exists

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
- `contextkit search` with no query calls `engine.browse('all-time')` and prints the top 10 with install counts; `--trending` uses `browse('trending')`. A non-empty query is still typed `search` and ignores `--trending`.

**Why thin:**
- No business logic here
- All real work happens in CollectionEngine
- Easy to test command parsing separately from business logic

**Test strategy:**
- Integration tests with mocked adapters
- Verify command routing and output formatting
- Don't retest business logic already covered by CollectionEngine tests

### 6. GUI (Thin Interface)

**Status:** Scheduled as Phase 9 (Tasks 38-45 in `tasks/todo.md`), built after the CLI (Phases 1-8) is stable. See "Decision Log" below.

**Structure:**
- Electron app or Tauri app (decided in Task 38)
- React UI components
- Same CollectionEngine as CLI

**Implementation:**
- Visual components: collection list, skill checkboxes, search bar with All time / Trending leaderboard tabs
- Event handlers call CollectionEngine methods
- No GUI-specific business logic
- State management for UI only (selected items, search filters, in-session cache of the last all-time/trending fetch so tab switches don't refetch)
- Empty Search panel fetches all-time when `SkillSearch` mounts (a panel-local fetch, not a global App boot call) and exposes All time / Trending tabs; typed search and install stay as they are
- Design decisions (color, typography, layout, accessibility) sourced from the `.cursor/skills/build/ui/ui-ux-pro-max/` and `.cursor/skills/build/ui/ui-styling/` skills

**Why thin:**
- GUI is just a different presentation layer
- All logic lives in CollectionEngine
- Developed and tested CLI first, GUI second
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
  installedSkills: Skill[]
  version: string
}

interface Collection {
  name: string
  skills: string[] // skill IDs
  createdAt: string
  command?: string // optional shell template, run via `contextkit run <name>`
}

interface Skill {
  id: string // e.g., "obra/react-patterns"
  source: string // "skills.sh" | "github" | "local"
  installedAt: string
  installs?: number // leaderboard count from skills.sh; omitted on search hits and installed-skill records
}
```

Schema v2 (current): dropped `activeCollection` and `Collection.lastUsedAt` when symlink-based activation was replaced by IDE export — see "Export Replaces Symlink Activation" below. Older v1 state files still have both fields on disk; they're simply ignored on load.

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

### Export Replaces Symlink Activation

**Decision:** ContextKit originally activated a collection by symlinking its skills into IDE directories (`.agents/`, `.claude/`, `.windsurf/`), one collection active at a time. This was replaced by explicit export: `contextkit export <collections...> --to <ide>` converts every skill in the named collections to a target IDE's format via `skillsmith`, on demand, with no persistent "active" state.

**Rationale:**
- Collections are meant to be edited (`add`/`remove`), not just switched between — a single mutually-exclusive "active" slot fought that goal
- Symlinks require platform support (Windows dev mode) and sometimes an IDE restart; export sidesteps both by producing IDE-native files instead of links
- Multiple collections/IDEs can be exported independently — no artificial one-at-a-time constraint

**Trade-offs:**
- Export is a copy, not a live link: re-run `export` after editing a collection to pick up changes (symlinks updated automatically; exported files don't)
- No single command shows "what's currently loaded" the way `status` used to — the source of truth is now just `contextkit list` plus whatever you last exported

**Test seam:** `CollectionEngine.export()`, which loops `SkillsAdapter.convert()` per skill and never fails the whole call for one bad collection/skill (see `ICollectionEngine.export` doc comment)

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
- Full create → add → remove → export flows
- Sync operation with real temp directories

**E2E Tests (10%)**
- Full CLI workflow in temp project
- GUI workflow with mocked external tools, real `CollectionEngine`

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
   - Empty `search` / `--trending` browse display (cap 10)

4. **GUI `SkillSearch` via `ContextKitBridge.browseSkills`**
   - Empty-state all-time results, Trending tab, install counts
   - Loading and error states

**Not test seams:**
- Private CollectionEngine methods
- `CollectionEngine.browse` forwarding to the adapter (one-line pass-through)
- State file JSON structure (internal detail)
- Third-party library internals
- Real CDN HIT (`x-vercel-cache`) — needs a deployed Vercel project

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

Task 2: User can add a skill to a collection
- Test: `engine.addSkill('frontend', 'obra/react-patterns')` returns success
- Test: State file reflects the added skill
- Test: Adding to a non-existent collection returns error

### Mocking Strategy

**Mock at adapter boundaries**, not inside implementations:

```typescript
// Good: Mock the adapter interface
const mockFS = {
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

**To validate:**

1. **Re-export staleness:** Exported files don't update automatically when a collection changes (unlike the old symlinks). Should `export` warn if a collection was edited since its last export, or is "re-run it" an acceptable mental model?
2. **Config merge strategy:** Should sync be fully additive, or offer a "destructive sync" mode that matches config exactly?
3. **Command template safety:** `contextkit run` executes an arbitrary stored string in the user's shell — fine for local, single-user config; revisit if collections are ever shared/synced from an untrusted `.contextkit.yml`.

## Decision Log

- **Export replaces symlink activation (resolved):** See "Export Replaces Symlink Activation" above. Collections are no longer mutually-exclusive "active"/"inactive" — they're edited (`add`/`remove`) and exported on demand to one or more IDE formats. `activate()`, `deactivate()`, `status()`, and the `activeCollection`/`lastUsedAt` state fields were removed from `CollectionEngine`, `IFileSystemAdapter` (symlink/IDE-detection methods), and the GUI (which previously exposed Activate/Deactivate controls in `CollectionList`, wired through the Electron IPC bridge in `gui/src/main/index.ts`). The GUI's collection rows now expose add-skill/remove-skill controls and an IDE-select + Export button instead, over the same `addSkill`/`removeSkill`/`export` engine methods the CLI uses — no engine or business-logic duplication.
- **Skills search goes through an OIDC-authenticated backend (resolved):** `SkillsAdapter.search()` calls ContextKit's own Vercel Function (`api/skills/search.ts` → `src/backend/skills-proxy.ts`) instead of skills.sh directly, so the CLI/GUI never need a `SKILLS_API_KEY`. `install`/`convert` still shell out locally (`npx skills add`, `skillsmith`) since skills.sh has no HTTP endpoint for either — there's nothing for a backend route to proxy there.
- **Leaderboard browse is a proxy + CDN cache, not a ContextKit registry (resolved):** Empty CLI search and the GUI's All time / Trending tabs call `SkillsAdapter.browse(view)`, which hits `GET /api/skills?view=`. That Vercel Function forwards to skills.sh's leaderboard (`GET /api/v1/skills`) with the same OIDC token as search, always `per_page=20`, and sets CDN `Cache-Control` on 200 only. ContextKit does not store, rank, or host skills — no Redis, no local JSON/localStorage cache, no marketplace. Future Cron/Redis, if any, would sit behind this same route without changing CLI/GUI.
- **GUI timing (resolved):** Originally deferred indefinitely ("wait for CLI MVP"). Now explicitly scheduled as Phase 9, after Phases 1-8 are complete. No change to the thin-GUI design above — only the timing was in question.
- **GUI design system (resolved, Task 44):** Minimalist neutral-grayscale palette in the shadcn/Vercel/v0 style — oklch grayscale tokens (`--background`/`--foreground`/`--border`/`--muted`/`--destructive`, etc.) defined once in `gui/src/renderer/src/styles/globals.css` and consumed everywhere as Tailwind v4 theme tokens (`bg-background`, `text-muted-foreground`, `border-border`, …), never hardcoded hex values. Light/dark are the same token names swapped via a `.dark` class on `<html>`, toggled by `ThemeProvider`/`useTheme` and persisted to `localStorage`. Typography is Geist Sans (UI text) + Geist Mono (code/identifiers), both self-hosted via `@fontsource` — the same family Vercel/v0/Cursor use, which is why it reads as that family of product. Spacing follows Tailwind's default 4px scale, used at a small set of steps for a consistent rhythm: `gap-1`/`gap-2` (4-8px) inside a control, `gap-3` (12px) between a control and its label or between list rows, `gap-8`/`gap-10` (32-40px) between page sections. Radius is a single `rounded-md` (0.5rem) on every card/input/button — no mixed radii. Icons are Phosphor (`@phosphor-icons/react`), one weight (`regular`), used only for the theme toggle so far.
- **Focus visibility (Task 44):** Every interactive control (buttons, inputs) uses a shared `FOCUS_RING` class (`gui/src/renderer/src/lib/focus-ring.ts`) — a 2px ring in the `--ring` token with a background-colored offset — instead of relying on the browser default outline, so keyboard focus is unambiguous in both themes.

**Answer these through:**
- User feedback during MVP testing
- Error scenario testing

## Success Criteria

This architecture succeeds if:

1. **Adding a new IDE takes < 2 hours** (just add to the `IDE` union type and `skillsmith` target)
2. **Adding a new external tool takes < 4 hours** (just add adapter, no engine changes)
3. **CollectionEngine tests have zero file system dependencies** (fully mocked)
4. **CLI and GUI share 100% of business logic** (no duplicate code)
5. **Error messages are actionable** (tell user exactly what to fix)

## References

- Deep module design: `skills/design/codebase-design/SKILL.md`
- TDD principles: `skills/philosophy/tdd/SKILL.md`
- PRD: `docs/requirements/prd.md`
