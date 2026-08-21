# Changelog

All notable changes to ContextKit are documented here. Versions follow [Semantic Versioning](https://semver.org/) (0.x minors may include breaking CLI changes).

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
