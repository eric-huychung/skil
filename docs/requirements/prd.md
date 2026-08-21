# ContextKit: AI Context Orchestration Tool

## Problem Statement

Developers working with AI coding assistants accumulate many skills (context augmentations) but lack a way to organize them effectively. Current tooling solves installation (`npx skills add`) and discovery (`skills.sh`), but not workflow management: switching between different skill sets for different tasks, sharing team configurations, or managing 20+ installed skills without manual overhead.

## Solution

A thin orchestration layer (CLI + GUI) that manages AI skill collections. Developers can group skills into named collections (e.g., "frontend", "backend", "api-design"), edit them freely (add/remove skills), tie an optional command template to each one, and sync team configurations via a `.contextkit.yml` file. When a collection is ready for an IDE, `contextkit export` converts every skill in it to that IDE's format. The tool wraps existing tools (Vercel skills CLI, skillsmith, skills.sh) rather than rebuilding infrastructure — skills.sh search itself is proxied through ContextKit's own Vercel-hosted backend so users never need their own API key.

## User Stories

1. As a developer, I want to create named skill collections, so that I can organize my skills by project phase or domain
2. As a developer, I want to add or remove skills from an existing collection, so that I can keep it up to date without recreating it
3. As a developer, I want to see all my collections, so that I know what contexts I've configured
4. As a developer, I want to search for skills, so that I can discover new skills without leaving my terminal
5. As a developer, I want to install skills via a consistent command, so that I don't need to remember external tool syntax
6. As a developer, I want to convert skills between IDE formats, so that I can use the same skill across Cursor, Claude, and Windsurf
7. As a developer, I want to export a whole collection (or several) to a target IDE in one command, so that I don't have to convert each skill individually
8. As a developer, I want to attach a command template to a collection, so that I can re-run the workflow that collection is for with one command
9. As a team lead, I want to define collections in a config file, so that my team can use standardized skill sets
10. As a team member, I want to sync collections from a config file, so that I match my team's AI context setup
11. As a developer, I want to export my current setup to a config file, so that I can share my configuration with others
12. As a developer using multiple IDEs, I want ContextKit to work across all of them, so that I don't need different tools for different editors
13. As a power user, I want CLI commands for all operations, so that I can script and automate my workflow
14. As a visual-preference user, I want a GUI desktop app, so that I can manage collections with drag-and-drop
15. As a GUI user, I want to see all installed skills with checkboxes, so that I can easily build collections visually
16. As a GUI user, I want to search and install from skills.sh in-app, so that I don't need to switch to browser or terminal
17. As a developer, I want to search and install skills without needing my own skills.sh API key, so that I can start using the tool immediately
18. As a developer, I want to know if my skills conflict with team config during sync, so that I can resolve issues manually
19. As a developer, I want to update installed skills, so that I have the latest versions
20. As a team using different IDEs, I want the config format to be IDE-agnostic, so that one config works for everyone
21. As a developer, I want an empty search to show the skills.sh all-time and trending leaderboards, so that I can browse popular skills without inventing a query
22. As a GUI user, I want to connect a project folder from Sync, so that collections and installs can land in my repo — and I can still browse skills and sketch collections before I connect

## Implementation Decisions

### Core Architecture

- **Thin wrapper philosophy**: ContextKit does not rebuild installation, discovery, or conversion infrastructure. It calls `npx skills add`, skills.sh API (via ContextKit's own OIDC-authenticated backend proxy, so users never need their own API key), and `skillsmith` under the hood. The skills.sh all-time/trending leaderboard is proxied the same way and cached on Vercel's CDN — ContextKit does not host a marketplace or its own skill registry.
- **Editable collections, export on demand**: Collections are named groups of skills you add to and remove from freely. There's no "active" collection — when a collection is ready for an IDE, `contextkit export` converts every skill in it (via `skillsmith`) to that IDE's format.
- **Command templates**: A collection can optionally carry a shell command template (`contextkit create --command "..."`), run later with `contextkit run <name>`.
- **Config-first team sync**: `.contextkit.yml` defines collections as code, enabling team standardization similar to `package.json`.

### Module Boundaries

1. **Collection Manager**
   - Create, add-skill, remove-skill, list, sync operations
   - Maintains collection metadata (name, included skills, optional command template)
   - Validates collection operations (e.g., can't add a skill to a non-existent collection)

2. **Config Parser**
   - Reads `.contextkit.yml`
   - Validates YAML structure

3. **External Tool Adapters**
   - Search adapter: calls ContextKit's Vercel backend, which proxies to skills.sh with a server-side OIDC token
   - Browse adapter: same backend, `GET /api/skills?view=all-time|trending`, CDN-cached; not a ContextKit-hosted registry
   - Install adapter: wraps `npx skills add`
   - Convert adapter: wraps `skillsmith` (used by both `contextkit convert` for a single skill and `contextkit export` for a whole collection)
   - Each adapter handles error cases and provides friendly output

4. **CLI Interface**
   - Command parsing and routing
   - Output formatting (tables, colors, status messages)
   - Error handling and user feedback

5. **GUI Application** (Electron)
   - Uses same core engine as CLI
  - Visual components: collection list with per-collection add/remove skill controls and IDE export, create-collection form, search/install panel, Sync-tab folder picker
  - Discover always shows the skills.sh leaderboard; Collections shows its empty UI before a folder is connected
  - No GUI-specific business logic—just UI binding to core

### Data Model

**Collection Structure**:
```
{
  name: string,
  skills: string[], // skill identifiers, e.g., ["obra/react-patterns", "vercel-labs/security-review"]
  command?: string // optional shell template, run via `contextkit run <name>`
}
```

**State File** (`.contextkit/state.json`):
```
{
  collections: Collection[],
  installedSkills: Skill[]
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

- **No "active" collection**: Collections aren't mutually exclusive or switched between — they're edited in place and exported to one or more IDEs independently, whenever needed.
- **Sync conflict resolution**: If `contextkit sync` encounters locally installed skills not in config, warn but don't delete. Let user decide.
- **Local-only collections**: All collections are local to the project. No global namespace for MVP. The CLI uses the current working directory. The GUI connects a folder from Sync (`createEngine(projectRoot)`) and does not `chdir`. Until then, Collections can still be used (scratch workspace). Last-folder persistence is out of this slice.
- **No version pinning in MVP**: `.contextkit.yml` lists skill names but not versions. Use whatever version is installed locally.

### CLI Commands

- `contextkit create <name> --skills skill1,skill2,skill3 [--command "<cmd>"]`
- `contextkit add <name> <skillId>`
- `contextkit remove <name> <skillId>`
- `contextkit run <name>`
- `contextkit list`
- `contextkit search [query] [--trending]` — with a query, typed search; with no query, all-time leaderboard (top 10); `--trending` is trending (top 10) and is ignored when a query is given
- `contextkit install <skill>`
- `contextkit convert <skill> --to cursor|claude|windsurf`
- `contextkit export <collections...> --to cursor|claude|windsurf`
- `contextkit sync`

### GUI Features

- Sidebar with collections list
- Main panel showing installed skills (checkboxes)
- Drag-drop skills into collection builder
- In-app search (queries skills.sh)
- Empty-state All time / Trending leaderboard tabs with install counts (fetched on first visit to Search; no folder required)
- Click a Discover skill name to see route, repo, GitHub link, skills.sh page, and installs (listing fields only — no description, no GitHub stars)
- Sync-tab Pick / Change folder control; Collections stays usable before a folder is connected
- One-click install from search results
- Per-collection export to a target IDE
- Button to run team sync

## Testing Decisions

### What Makes a Good Test

- Test external behavior, not implementation details
- Mock external calls (skills.sh backend, `npx skills add`, `skillsmith`)
- Use temporary directories for file system tests
- Verify export conversion calls without requiring real IDE setup

### Modules to Test

1. **Collection Manager**: Core business logic
   - Create/add-skill/remove-skill/list operations
   - Validation (collection name conflicts, non-existent collections)

2. **Config Parser**: YAML parsing
   - Read valid `.contextkit.yml`
   - Handle malformed YAML gracefully

3. **External Tool Adapters**: Integration points
   - Mock HTTP calls for the skills.sh backend proxy
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

Integration tests can verify the full flow (create → add → remove → export) with a real temporary directory, but without calling external APIs.

## Out of Scope

### Not in MVP

- **Phase auto-detection**: No automatic switching based on what the user is doing. Collections are edited and exported explicitly.
- **Token management UI**: No context window visualization or token estimation. IDEs already show this.
- **IDE extensions**: No VSCode/Cursor/JetBrains plugins. CLI + desktop app provides universal compatibility.
- **Skill authoring/editing**: Users edit skills at source (GitHub repos), not in ContextKit.
- **Custom skill hosting**: No marketplace. Point to skills.sh and GitHub.
- **Version pinning**: Config lists skill names but not versions.
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
- Export staleness: Exported files don't auto-update when a collection changes. Should `export` warn if a collection was edited since its last export?
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
