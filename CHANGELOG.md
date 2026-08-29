# Changelog

All notable changes to skil are documented here. Versions follow [Semantic Versioning](https://semver.org/) (0.x minors may include breaking CLI changes).

## [Unreleased]

## [0.3.0] - 2026-08-29

Product is **v6 + Rules**. One command list per project. Docks are export/install targets, not five maps. Rules are a live disk listing, not a skil-owned map.

### Added
- Schema v6: `commands[].skills` is the project map. v5 `membership` loads as a union (cursor first, then other docks, unique). No rewrite until the next mutation. Mutate verbs have no `--ide`.
- Rules: walk `.cursor/rules`, `.claude/rules`, `.github/instructions`, `.windsurf/rules`, plus root `CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md`. GUI Rules tab + `skil rules` (list / show / always-apply / export). Same name across docks is one card. Root always-on files cannot be toggled. Not persisted. Not Inbox.
- `skil copy` / `copyTo` / `copyAll` write the same command list to a dest dock (stamped file + missing skill folders).
- `exportCommand` / GUI Export write our stamped command file (`generated_by: skil`) and deploy filed skills the dest is missing. Unstamped dest files need `--replace`.
- Import a dock from another project (skills + rules). Usage counts from Claude session logs.
- Market index Discover: shelves, typed search, preview (`/api/market/*`). Click a skill for details. Add → Inbox (no download).
- Light DiskWatch in the GUI: debounce ~500ms, mute our writes ~1s, skip `.git`. Watches skill / command / rule dirs and root rule files.
- `skil` CLI bin (`contextkit` stays an alias)

### Changed
- One map. Copy/export write that list to a dock. Scan does not adopt stamps into the map. Stamp ≠ map is a warn.
- Stamped command files ship Goal / Sequence / Rules comments plus a managed `## Skills` list. Re-export refreshes membership only; `--replace` resets the comments.
- Engine state is `.skil/state.json` only. Leftover `.contextkit/state.json` is an error (move it). API origin is `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.
- GUI rail is Inbox / Commands / Rules / Discover / Sync. Commands is one list + dest chips, not IDE workspace cards. Re-scan sits next to the header path.
- `skil search` typed queries hit the market index (same Discover seam as the GUI). Empty / `--trending` still list the live leaderboard.
- CLI `convert` / `sync` / `run` no longer ship.
- Engine leftover methods (`sync`, `convert`, `getCommand`, skillsmith `export`) are gone. Team YAML `ConfigAdapter` and leftover `SkillsAdapter.convert` are gone.
- Export / import / rule-export conflicts return a `code` and `labels`. GUI Replace dialogs read those, not `Error.message`.

### Fixed
- `readRule` only opens listed rule files. Absolute paths, `..`, and other project files (e.g. `/etc/passwd`, `.env`) are not found.
- Public market 500s return a generic message. They no longer echo store or filesystem text.

### Security
- GUI and CLI failures use fixed status-copy. They do not echo `Error.message` (paths, hostnames, stack fragments).

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
