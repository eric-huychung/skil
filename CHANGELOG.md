# Changelog

All notable changes to ContextKit are documented here. Versions follow [Semantic Versioning](https://semver.org/) (0.x minors may include breaking CLI changes).

## [Unreleased]

### Added
- Engine `exportCommand` writes our stamped command file (`generated_by: skil`) into the target IDE dir. Unstamped existing files are left alone unless `replace: true`. Windsurf writes `.windsurf/workflows/`.
- Discover: click a skill name to open a details dialog (route, repo, GitHub, skills.sh page, installs) from skills.sh listing fields already on the browse/search payload
- `skil` CLI bin (keeps `contextkit` as an alias)

### Changed
- Engine state persists at `.skil/state.json`. Old `.contextkit/state.json` still loads; the next persist writes the new path.
- API origin override is `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.
- GUI window title and brand say skil.
- CLI `export <command> --to <ide> [--replace]` and GUI Export write our stamped command file via `exportCommand`. Not skillsmith convert. Unstamped files need `--replace` or a GUI Replace confirm. Export does not install skills.
- `install` takes a target IDE. The skills adapter runs `npx skills add` with `--agent` (cursor → `cursor`, claude → `claude-code`, windsurf → `windsurf`, agents → `universal`). The engine upserts catalog `deployedTo`; leftover `installedSkills` is not the catalog. CLI `--to` is required and rejects an unknown IDE before the engine.
- GUI Commands: pick an IDE and Install a known skill (Inbox or filed). Calls the engine; errors are a visible alert. Disabled until a folder is connected. Discover Add still does not download.
- GUI layout now follows the example desktop shell: topbar, rail tabs (Commands / Discover / Sync), command list + detail, and a help dialog.
- CLI, engine, and GUI product-loop copy say **command**, not collection. `fileToCollection` is now `file`. `create /build` stores the name `build`.

## [0.2.2] - 2026-08-21

### Fixed
- Vercel API endpoints crashing with `Invalid URL` error when `request.url` contains relative paths (e.g., `/api/skills/search?q=react`) — now handle both absolute and relative URLs
- GUI skill search staying stuck on "Searching..." when API errors occur — added proper error handling with try-catch-finally

## [0.2.1] - 2026-08-21

### Fixed
- Vercel function crash (FUNCTION_INVOCATION_FAILED) — functions now import compiled `dist/` instead of non-existent `src/*.js`
- Vercel build now runs `npm run build` before deployment (`buildCommand` in `vercel.json`)

### Changed
- Website API origin moved from hardcoded constant to `src/config/website.json` for easier updates
- Node engine requirement raised to `>=20` (required by `@vercel/oidc`)

## [0.2.0] - 2026-08-21

### Added
- `contextkit add` / `contextkit remove` to edit collections in place
- `contextkit export <collections...> --to <ide>` to convert a collection for Cursor, Claude, or Windsurf
- `contextkit run <collection>` for optional command templates
- `contextkit search` with no query lists the skills.sh all-time leaderboard (top 10); `--trending` lists trending
- GUI Search empty state: All time / Trending tabs with install counts
- Vercel OIDC proxy so search and browse never need a `SKILLS_API_KEY` (`GET /api/skills/search`, `GET /api/skills?view=`)

### Changed
- Collections are edited and exported on demand; there is no single “active” collection

### Removed
- `contextkit use` / `disable` / `status` and symlink-based activation

## [0.1.0] - 2026-08-20

### Added
- Initial CLI and Electron GUI for creating, listing, and installing skills into collections
