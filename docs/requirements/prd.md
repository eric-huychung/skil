# ContextKit: AI Context Orchestration Tool

## Problem Statement

Developers working with AI coding assistants accumulate many skills (context augmentations) but lack a way to organize them effectively. Current tooling solves installation (`npx skills add`) and discovery (`skills.sh`), but not workflow management: switching between different skill sets for different tasks, sharing team configurations, or managing 20+ installed skills without manual overhead.

## Solution

A thin orchestration layer (CLI + GUI) that manages AI skill collections. Developers can group skills into named collections (e.g., "frontend", "backend", "api-design"), activate/deactivate them with one command, and sync team configurations via a `.contextkit.yml` file. The tool manipulates symlinks in skill directories and wraps existing tools (Vercel skills CLI, skillsmith, skills.sh) rather than rebuilding infrastructure.

## User Stories

1. As a developer, I want to create named skill collections, so that I can organize my skills by project phase or domain
2. As a developer, I want to activate a specific collection, so that only relevant skills load into my AI assistant
3. As a developer, I want to disable the current collection, so that I can work without any skills when needed
4. As a developer, I want to see all my collections, so that I know what contexts I've configured
5. As a developer, I want to see which collection is currently active, so that I understand what context my AI has
6. As a developer, I want to search for skills, so that I can discover new skills without leaving my terminal
7. As a developer, I want to install skills via a consistent command, so that I don't need to remember external tool syntax
8. As a developer, I want to convert skills between IDE formats, so that I can use the same skill across Cursor, Claude, and Windsurf
9. As a team lead, I want to define collections in a config file, so that my team can use standardized skill sets
10. As a team member, I want to sync collections from a config file, so that I match my team's AI context setup
11. As a developer, I want to export my current setup to a config file, so that I can share my configuration with others
12. As a developer using multiple IDEs, I want ContextKit to work across all of them, so that I don't need different tools for different editors
13. As a power user, I want CLI commands for all operations, so that I can script and automate my workflow
14. As a visual-preference user, I want a GUI desktop app, so that I can manage collections with drag-and-drop
15. As a GUI user, I want to see all installed skills with checkboxes, so that I can easily build collections visually
16. As a GUI user, I want to search and install from skills.sh in-app, so that I don't need to switch to browser or terminal
17. As a developer, I want collections to work via symlinks, so that activation is instant and IDE-compatible
18. As a developer, I want to know if my skills conflict with team config during sync, so that I can resolve issues manually
19. As a developer, I want to update installed skills, so that I have the latest versions
20. As a team using different IDEs, I want the config format to be IDE-agnostic, so that one config works for everyone

## Implementation Decisions

### Core Architecture

- **Thin wrapper philosophy**: ContextKit does not rebuild installation, discovery, or conversion infrastructure. It calls `npx skills add`, skills.sh API, and `skillsmith` under the hood.
- **Symlink-based activation**: Collections work by creating/removing symlinks in IDE skill directories (`.agents/skills/`, `.claude/skills/`, `.windsurf/skills/`). Original skills remain in a ContextKit-managed directory.
- **Multi-IDE support**: Single source of truth for collections, but symlinks are created in all detected IDE directories.
- **Config-first team sync**: `.contextkit.yml` defines collections as code, enabling team standardization similar to `package.json`.

### Module Boundaries

1. **Collection Manager**
   - Create, use, disable, list, status operations
   - Maintains collection metadata (name, included skills)
   - Tracks active collection state
   - Validates collection operations (e.g., can't use non-existent collection)

2. **Symlink Manager**
   - Creates/removes symlinks in IDE directories
   - Detects which IDEs are present
   - Handles edge cases (symlink already exists, target missing, permissions)

3. **Config Parser**
   - Reads/writes `.contextkit.yml`
   - Validates YAML structure
   - Exports current local state to config format

4. **External Tool Adapters**
   - Search adapter: calls skills.sh API
   - Install adapter: wraps `npx skills add`
   - Convert adapter: wraps `skillsmith`
   - Each adapter handles error cases and provides friendly output

5. **CLI Interface**
   - Command parsing and routing
   - Output formatting (tables, colors, status messages)
   - Error handling and user feedback

6. **GUI Application** (Electron)
   - Uses same core engine as CLI
   - Visual components: skill list, collection builder, search interface
   - No GUI-specific business logic—just UI binding to core

### Data Model

**Collection Structure**:
```
{
  name: string,
  skills: string[] // skill identifiers, e.g., ["obra/react-patterns", "vercel-labs/security-review"]
}
```

**State File** (`.contextkit/state.json`):
```
{
  collections: Collection[],
  activeCollection: string | null,
  installedSkills: string[]
}
```

**Config File** (`.contextkit.yml`):
```yaml
collections:
  frontend:
    - obra/react-patterns
    - addyosmani/performance-review
  backend:
    - addyosmani/api-design
    - vercel-labs/security-review
```

### Key Technical Decisions

- **Mutual exclusivity**: Only one collection can be active at a time (not composable). Simplifies mental model and avoids skill conflicts.
- **Sync conflict resolution**: If `contextkit sync` encounters locally installed skills not in config, warn but don't delete. Let user decide.
- **IDE detection**: Scan for `.agents/`, `.claude/`, `.windsurf/` directories in project root to determine which IDEs to support.
- **Local-only collections**: All collections are local to the project. No global namespace for MVP.
- **No version pinning in MVP**: `.contextkit.yml` lists skill names but not versions. Use whatever version is installed locally.

### CLI Commands

- `contextkit create <name> --skills skill1,skill2,skill3`
- `contextkit use <name>`
- `contextkit disable`
- `contextkit list`
- `contextkit status`
- `contextkit search [query]`
- `contextkit install <skill>`
- `contextkit convert <skill> --to cursor|claude|windsurf`
- `contextkit sync`
- `contextkit export`

### GUI Features

- Sidebar with collections list
- Main panel showing installed skills (checkboxes)
- Drag-drop skills into collection builder
- In-app search (queries skills.sh)
- One-click install from search results
- Visual indicator of active collection
- Button to run team sync

## Testing Decisions

### What Makes a Good Test

- Test external behavior, not implementation details
- Mock external calls (skills.sh API, `npx skills add`, `skillsmith`)
- Use temporary directories for file system tests
- Verify symlink creation/removal without requiring real IDE setup

### Modules to Test

1. **Collection Manager**: Core business logic
   - Create/use/disable/list operations
   - State transitions (active → disabled, etc.)
   - Validation (collection name conflicts, non-existent collections)

2. **Symlink Manager**: File system operations
   - Symlink creation/removal
   - Multi-IDE directory handling
   - Error cases (permissions, missing targets)

3. **Config Parser**: YAML parsing and generation
   - Read valid `.contextkit.yml`
   - Handle malformed YAML gracefully
   - Export state to correct YAML structure

4. **External Tool Adapters**: Integration points
   - Mock HTTP calls for skills.sh API
   - Mock subprocess calls for `npx skills`, `skillsmith`
   - Error propagation from external tools

### Prior Art

This is a greenfield project, but testing approach should follow Node.js CLI conventions:
- Use Jest or Vitest for unit tests
- Use `memfs` or similar for mocking file system
- Use `nock` for mocking HTTP calls
- Use `execa` for subprocess calls, mock with `jest.mock()`

### Test Seams

The primary test seam is the **Collection Manager** — that's where core logic lives. File system and external tool calls should be injected/mocked at module boundaries, not tested end-to-end in unit tests.

Integration tests can verify the full flow (create → use → disable) with a real temporary directory, but without calling external APIs.

## Out of Scope

### Not in MVP

- **Phase auto-detection**: No automatic switching based on what the user is doing. User controls when to switch collections.
- **Token management UI**: No context window visualization or token estimation. IDEs already show this.
- **IDE extensions**: No VSCode/Cursor/JetBrains plugins. CLI + desktop app provides universal compatibility.
- **Skill authoring/editing**: Users edit skills at source (GitHub repos), not in ContextKit.
- **Custom skill hosting**: No marketplace. Point to skills.sh and GitHub.
- **Version pinning**: Config lists skill names but not versions.
- **Composable collections**: Only one collection active at a time.
- **Global collections**: All collections are project-local.
- **Approval workflows**: No team approval process for config changes.
- **Analytics/telemetry**: No tracking of which collections are popular.

### Deferred to Post-MVP

- Cross-platform GUI (start macOS-only)
- `contextkit update` command (point to `npx skills update` for now)
- SSO/audit logs for enterprise teams
- Collection templates/starter packs (e.g., "frontend-starter")
- Public collections registry separate from skills.sh

## Further Notes

### Open Questions (to validate during MVP)

**Technical:**
- IDE restart requirements: Some IDEs watch directories, others need restart after symlink changes. Test with Cursor, Claude Desktop, Windsurf.
- Conflict resolution: Should `contextkit sync` be destructive (replace local collections) or additive (merge with local)?
- Local vs. global collections: Is project-local always correct, or do users want global collections too?

**Product:**
- Terminology: Is "collection" the right word, or is "profile", "context", "bundle" clearer?
- GUI priority: Should GUI be built in parallel with CLI, or wait until CLI validates the concept?
- Team sync paywall: Free or paid feature?

**Validation Criteria (from assumptions):**
- Do 50%+ of CLI users create multiple collections, or do they just load everything?
- Do teams actually adopt `.contextkit.yml` like `package.json`, or is config-as-code overkill?
- Does GUI get >10% usage compared to CLI, or is it unnecessary?

### Success Metrics

**Month 1:**
- 100 CLI installs
- 50 developers create at least one collection
- 5 teams use `.contextkit.yml`

**Month 3:**
- 1,000 CLI installs
- 200 GUI downloads
- 20 teams with 5+ developers

**Month 6:**
- 5,000 users
- 100 active teams
- Clear signal on paid tier demand

### Distribution Strategy

- **npm package** for CLI: `npm install -g contextkit`
- **Electron app** downloadable from contextkit.dev (or GitHub releases)
- Both use same core engine (shared npm package)
- Launch on Hacker News, share in AI dev communities (Cursor Discord, Claude community)
