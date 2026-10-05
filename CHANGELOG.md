# Changelog

All notable changes to skil are documented here. Versions follow [Semantic Versioning](https://semver.org/) (0.x minors may include breaking CLI changes).

## [Unreleased]

### Changed
- Scan copies leftover-only skills, commands, and rules into canonical homes. Parked leftovers stay off.
- Search results are cached at the edge for a minute, and search queries are capped at 200 characters.

### Fixed
- Website pages (`/cli`, `/faq`, `/legal`, `/leaderboard`, `/app`, `/about`, `/blog`) returned 404. They now load at clean URLs.

### Security
- Update Next.js, Electron, axios and other dependencies to patched versions.

## [0.8.0] - 2026-10-05

Smarter Discover shelves and a new Creators tab.

### Added
- Discover has a **Creators** tab in the app and on the website: top skill authors, their skills grouped by repo, with a preview.
- Six new topic shelves: Mobile, Languages, Game dev, Docs, AI / ML, and Agent tooling (27 shelves in all).
- Search also matches a skill's owner and its topics.

### Changed
- Every skill in the index is sorted onto shelves (not just the top 1,000), using its SKILL.md text as well as its name and description. A skill can sit on more than one shelf, and no single author can crowd a shelf.
- Shelves refresh weekly in one all-or-nothing update, so Discover never shows a half-built set.
- Scan copies leftover-only skills and commands into the live pair. Leftover glob rules stay path-scoped. Parked leftovers stay off.

## [0.7.2] - 2026-09-11

### Fixed
- Pin Electron 43.4.1 and set `electronVersion` so the tag job can package inside the npm workspace.

## [0.7.1] - 2026-09-11

### Fixed
- Unsigned `.dmg` packaging: `electron` lives in GUI `devDependencies`, and the tag job passes `--publish never` so electron-builder does not try to publish on its own.

## [0.7.0] - 2026-09-11

CLI skills, unsigned macOS dmgs, and the open-source repo loop. Main stays deployable.

### Added
- `skil skills` lists the catalog (on / off). `skil skills enable|disable <id>` parks or restores a skill. `skil enable` stays commands-only.
- Help `?` sheet: FAQs / Instructions / About, GitHub update check, and Venmo donate (`@echung03`). Footer pings when an update is out.
- GitHub Actions CI on pull requests and `main`: typecheck, tests, CLI / website / GUI build, plus a tracked-file secret scan. Tag `v*` packages unsigned `Skil-arm64.dmg` / `Skil-x64.dmg`.
- Contributor Covenant, plus Bug / Feature issue forms. Vulns stay on the private advisory path.
- Dependabot for npm and GitHub Actions.
- Marketing `/about`, `/blog`, `/faq`. README has the unsigned-dmg install path.

### Changed
- Live-pair `SKILL.md` now teaches the README loop, including `skil skills`. Leftovers stay in the app. No `show`.
- `package.json` is `private` and only packs `dist` — the repo skill library is not an npm artifact.
- Suggest can use editorial ids from `/api/market/suggested` so the app does not need `data/market-picks.yaml` bundled. LLM suggest shares the same call cache as doctor.
- CLI uncaught errors print the message and exit 1.

### Removed
- `skil rules show` — preview stays in the app.

### Security
- File-system writes stay inside the connected project folder. Skill/command ids that contain `..` are rejected.
- skills.sh proxy 502s return a fixed message. Cron bearer compare is timing-safe. Doctor also redacts JWT / Supabase / Vercel-gateway shaped strings.
- Next.js 16.3.5 (RCE advisories on 16.3.0–16.3.2). js-yaml 4.3.2.

## [0.6.0] - 2026-09-10

Settings key vault and cheaper, cached doctor LLM. Main stays deployable.

### Added
- Settings can save more than one BYOK key, switch which one is active, reveal, and remove. Old single-key files migrate in place.
- Doctor LLM findings are cached on the engine (content hash + single-flight + failure cooldown) so Skills, Commands, and Rules share one call.

### Changed
- BYOK cheap models: Anthropic `claude-haiku-4-5`, OpenAI / OpenRouter `gpt-4.1-nano` (retired Haiku 3.5 snapshot and gpt-4o-mini).
- Doctor's LLM pass sends skill id + description only; bodies stay on-machine for math checks.
- `skil list` no longer prints a Command column.
- README is the short user loop (find / organize / eval), not the architecture dump.

### Fixed
- BYOK requests time out after 15s and 429s fail closed without retrying, so a dead or rate-limited key cannot hammer the provider on every tab/scan.

### Security
- Reveal is an explicit user action. Raw keys still never sit in the renderer status payload.

## [0.5.0] - 2026-09-10

Doctor, Suggest, and BYOK ship. Main stays deployable.

### Added
- `skil doctor` / GUI health strip: idle-cost, fat-body, unused, hash-split, and secret findings with no API key. Unused stays quiet until the project has usage and a 14-day grace has passed.
- BYOK for Anthropic, OpenAI, or OpenRouter. GUI Settings tab encrypts the key on this machine (`safeStorage`). CLI reads `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY`. Direct to the provider — never through skil's servers.
- With a key, doctor also flags skill-description conflicts and vague triggers.
- `skil suggest --role` and Discover **Suggested**: editorial picks with no key (`data/market-picks.yaml`); LLM rerank against `package.json` when a key is set. Never installs.
- `GET /api/market/suggested` hydrates those editorial ids from the market index.
- Sync leftover cleanup: import missing ids, remove duplicate leftovers, resolve drift (keep-live vs import).
- skil's own `SKILL.md` in the live pair, teaching the scan / file / enable / doctor / suggest / install loop.
- Marketing site split into `/`, `/leaderboard`, `/cli`, `/app`.

### Changed
- Settings is a workspace tab, not a header gear.
- Suggested no longer requires a key — no-key is editorial picks plus a note, not an error.

### Fixed
- Doctor unused warnings no longer fire on first download. Size caps match the documented 500-line / 20k-char fat-body rule.

### Security
- Doctor's LLM prompt redacts secret-shaped strings in skill descriptions and body excerpts before they leave the machine.
- Public `/api/market/suggested` parse failures return a generic message (no yaml/path text).
- Raw API keys never come back over IPC. `llm-settings.json` stays in Electron userData, not the repo.

## [0.4.0] - 2026-08-29

Product is **live trees**. On/off is a path (park / restore), not “export to a dock.” skil writes only the `.agents` + `.claude` live pair.

### Added
- Live pair: market install and command enable write both `.agents/skills/<id>` and `.claude/skills/<id>` in one step. No dock picker.
- Park / restore: toggle off moves a skill or command under `.skil/parked/…`; toggle on copies it back. Create starts commands off (no folder until enable).
- Leftovers: scan catalogs paths outside the live pair and parked root. Adopt folds them into the live pair and moves the old path to `.skil/deprecated/` (recoverable, never scanned again).
- `skil enable` / `skil disable` for commands. Shared-law `skil rules enable` / `disable` upsert or remove an `AGENTS.md` section (glob `.mdc` rules stay read-only).
- Discover **Add** installs straight into the live pair — no staging step.
- GUI Skills tab is the full catalog (Market / Project by origin) with per-row On/Off; Commands file from “From Skills,” not Inbox.

### Changed
- GUI rail is Sync / Skills / Discover / Commands / Rules. Commands are one list with On/Off; no Export, no dock chips.
- `skil install <skillId>` has no `--to`. Scan unions live + parked + leftovers and never writes on its own.
- `CLAUDE.md` is expected to `@AGENTS.md`; shared law is toggled in `AGENTS.md` only.

### Removed
- Inbox staging (`skil inbox`, market inbox, Add → Inbox).
- `skil copy` / `skil export`, GUI Export / Import-from-dock, and engine `copyTo` / `exportCommand` / `exportAll` / `importFrom` paths.

### Security
- Status-copy still hides raw `Error.message` from GUI/CLI failures. Env files (`.env`, `.env.local`) stay gitignored; no secrets in this release.

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
