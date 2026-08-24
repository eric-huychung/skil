# Changelog

All notable changes to ContextKit are documented here. Versions follow [Semantic Versioning](https://semver.org/) (0.x minors may include breaking CLI changes).

## [Unreleased]

### Added
- Schema v5: command membership is per IDE. Mutating CLI verbs take `--ide` (default `cursor`). Unknown IDE is rejected before the engine.
- `skil copy` / engine `copyTo` / `copyAll` share a command list to another IDE (dest membership + stamped file + missing skill folders).
- Write-through: file / unfile / create / delete rewrite that IDE's stamped command file only.
- Light DiskWatch in the GUI: debounce ~500ms, mute our writes ~1s, skip `.git`. Flush is scan + write-through.
- Engine `exportCommand` writes our stamped command file (`generated_by: skil`) into the target IDE dir. Unstamped existing files are left alone unless `replace: true`. Windsurf writes `.windsurf/workflows/`.
- Discover: click a skill name to open a details dialog (route, repo, GitHub, skills.sh page, installs) from skills.sh listing fields already on the browse/search payload
- `skil` CLI bin (keeps `contextkit` as an alias)

### Changed
- v4 `commands[].skills` loads as Cursor membership. Same name on another IDE adds that IDE's list; it is not "already exists".
- GUI Commands landing is IDE cards (counts, click into a workspace). Copy to is dest chips, not a Format dropdown.
- Stamped command pull: that IDE's disk wins (`commandPulls`); other IDEs are left alone.
- Export uses that IDE's membership. Sharing to another IDE is Copy, not Format + Save.
- `npx skills add` now sends `owner/repo@skill` for 3-part skills.sh ids (`anthropics/skills/frontend-design`) and `-y` so Electron installs are non-interactive.
- Commands detail drops per-skill Install (Inbox still has it). Sync rail shows a red/green folder-status dot.
- GUI: no connected repo still lets you install/export — dest folder picker, IDE stays selectable. Scan click explains it needs a connected project. Export is a labeled white button with the download icon. Included skills sit above From Inbox.
- `exportCommand` / `install` accept optional `dest` so a push can write somewhere other than the bound workspace.
- `exportCommand` also deploys filed skills to the target IDE: copy a local folder if that IDE is missing it, leave an existing dest folder alone, `install` Discover-only ids. Command-file stamp/replace rules are unchanged.
- GUI Export matches Inbox install: loading / success / failure is a modal (error details collapsed). Export sits as an icon under delete. Target IDE is above From Inbox. The Inbox picker filters as you type and pages at 10.
- GUI Inbox matches Discover: search, 25-per-page list, Scan as an icon. Install is a download icon that opens an IDE menu; progress and result are a modal (error details collapsed).
- GUI Inbox is its own rail tab above Commands. Scan and unfiled install live there. Commands keeps the list plus the From Inbox file picker.
- README documents the skil loop: scan → Inbox → file → install and/or export our stamped command file. `contextkit` is listed as a bin alias, not the product name.
- Engine state persists at `.skil/state.json` only. Leftover `.contextkit/state.json` is an error (move it); no silent fallback.
- API origin override is `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.
- GUI window title and brand say skil.
- CLI `export <command> --to <ide> [--replace]` and GUI Export write our stamped command file via `exportCommand` and deploy filed skills the target IDE is missing. Not skillsmith convert. Unstamped files need `--replace` or a GUI Replace confirm.
- `install` takes a target IDE. The skills adapter runs `npx skills add` with `--agent` (cursor → `cursor`, claude → `claude-code`, windsurf → `windsurf`, agents → `universal`). The engine upserts catalog `deployedTo`; leftover `installedSkills` is not the catalog. CLI `--to` is required and rejects an unknown IDE before the engine.
- GUI Commands: pick an IDE and Install a known skill (Inbox or filed). Calls the engine; errors are a visible alert. Disabled until a folder is connected. Discover Add still does not download.
- GUI layout now follows the example desktop shell: topbar, rail tabs (Commands / Discover / Sync), command list + detail, and a help dialog.
- CLI, engine, and GUI product-loop copy say **command**, not collection. `fileToCollection` is now `file`. `create /build` stores the name `build`.

### Fixed
- GUI Export with no connected folder asks for a destination every time. It no longer reuses the first pick. Replace still uses the dest from that same export.

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
