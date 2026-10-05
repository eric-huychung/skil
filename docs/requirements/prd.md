# skil

A CLI and desktop app that maps AI skills onto SDLC commands and flips them on/off in `.agents` + `.claude` at once. No login. Work project vs side project = two folders = two maps.

How it's built: `docs/design/architecture.md`. The user loop: `README.md`.

## The problem

You pile up skills (`SKILL.md` folders) across `.cursor`, `.claude`, `.codex`, `.github` and `.agents`. Installing (`npx skills add`) and finding (skills.sh) already exist. What's missing is a **map**: which skills are on in this project, which command they belong to (one `/build`, not one per tool), and a way to turn them on without a dock picker. You also can't see which skills actually get used, which clash, or which are bloated.

## What it is

- **Skills**: folders with `SKILL.md`. Disk owns the body. One catalog, many paths.
- **Live pair**: `.agents` + `.claude`. On means it lives in both. No "on for Cursor, off for Claude".
- **Parked**: off but yours, under `.skil/parked/…`. Toggle on restores it (or re-fetches a market skill whose parked copy is gone).
- **Leftover**: every other root we still scan. Leftover-only skills and commands get copied into the live pair on scan, leftover-only rules get upserted into `AGENTS.md`. The leftover path stays until cleanup.
- **Deprecated**: a retired leftover. Recoverable, never scanned again.
- **Commands**: named groups of skill ids, once per project. Live = a human-only skill folder in both trees. Filing a skill doesn't turn it on.
- **Rules**: shared law in `AGENTS.md` (toggle). Glob files (`.cursor/rules/*.mdc` etc.) stay on disk, read-only.
- **Toggle** is the write. On → both live folders, off → parked. No export step.
- **Doctor**: findings per command. Math and regex are free, conflict / vague-trigger need a BYOK key.
- **Suggest**: a shortlist for this repo. Editorial picks without a key, LLM rerank with one. Never auto-installs.
- **Usage**: how often Claude read a skill. Not "was it used well".

We're the source of truth for what exists here, on/off (a path, not a flag) and which skills sit on which command. We are **not** the source of truth for file contents. We wrap skills.sh (through our OIDC backend) and `npx skills add`, and we don't host a marketplace.

## The loop

1. Connect a repo (optional). Discover, Skills and Commands work without one. The first toggle can ask for a folder.
2. Scan unions live + leftover + parked and copies leftover-only stuff into the live pair.
3. Create `/build` and file skills onto it. Filing doesn't move folders.
4. Toggle on → both live trees. Discover `+` is the same write. Toggle off → parked, the row stays.
5. Clean up leftovers in Sync: drop duplicates, resolve drift. Parked is never touched.
6. Doctor on Commands, Suggest on Discover, BYOK key in Settings.

## The app

Six tabs, same engine as the CLI.

- **Sync**: pick or change the folder, recents (max 5), leftover cleanup.
- **Discover**: Top, Trending, **Creators**, role → topic shelves, search, and Suggested. `+` installs into the live pair. Preview shows the live SKILL.md and audit.
- **Skills**: the catalog. Market vs Project is a filter. Toggle, preview, delete, Update (if unedited) or Reset (if edited).
- **Commands**: one list. Create, file, remove, delete, toggle, with a health strip per row and Claude read counts on filed skills.
- **Rules**: shared sections toggle, glob rows are read-only. It never creates rules.
- **Settings**: BYOK keys, one row each (provider, mask, eye, on/off). Many keys, one on. Encrypted on disk, and saving tests the key.

The header shows the bound path and Re-scan once a folder is connected. There's no push button, the toggle is the write.

## The CLI

```
skil search | suggest | install
skil scan | skills | skills enable|disable <id>
skil create | list | add | remove | enable|disable | delete
skil rules | rules enable|disable <id>
skil doctor [name] | usage
```

Top-level `enable`/`disable` are for commands, skills use `skil skills enable|disable`. Leftover cleanup is app-only. BYOK has no verb, set `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY`.

## The website

skil.website is a static site: landing with a Discover browser, plus about, app (download), cli, faq, leaderboard, legal and blog pages. It calls the same market API as the app.

## Stories

- Connect a folder with no account, scan every skill root, see on/off from the path.
- One `/build` for the project, not one per tool. File without enabling. Toggle writes both trees.
- Turning `/build` on refuses clearly if a skill already owns that folder name.
- Discover `+` turns a market skill on right away. Update when the market moved and you didn't edit, Reset if you did.
- Creators sits next to Top / Trending: 30 creators from a hand-edited list, each with skill count, total installs and an "Official on skills.sh" badge when skills.sh lists them (never "verified"). Click one to see their skills grouped by repo, with topic chips.
- A vendor suite shows up as one row, "name, +N more", and one owner can fill at most 5 rows of a shelf.
- Leftover cleanup adopts what's missing and deprecates the rest.
- Doctor flags idle-cost, fat-body, unused, hash-split and secrets with no key. A local LLM key adds conflict / vague-trigger. The key stays on this machine and only goes to the provider.
- Suggested ranks market skills for this `package.json`. No folder: connect prompt. No key: editorial picks plus a Settings nudge. `skil suggest` prints the same ids.
- A skil `SKILL.md` in the live pair teaches agents the README loop.

## Out of scope

Dock picker, five-way export, Inbox, reading unstamped `commands/` as map input, cross-project import, skill authoring, our own registry, team YAML sync, last-folder as source of truth, live 3-way merge, auto-sync of market skills, login/SSO/analytics, IDE extensions, a global (`~/`) library, `skil run`, SQLite, "used properly" eval, usage parsers besides Claude, stamps on ordinary `SKILL.md`, modeling runtime overlap.

## Open questions

- Is `skil` free on npm before we publish?
- One skill on many commands works in the map, but the GUI only files from Skills.
- Parked is the last live snapshot at toggle-off. If it goes stale while off, there's no merge.

## Success

- **Month 1:** people connect a real repo, scan, and turn on at least one command.
- **Month 3:** toggling gets used both ways, doctor gets looked at, cleanup gets used on a messy repo.
- **Month 6:** we can tell whether Suggest + BYOK doctor are worth deepening, or the map alone is the product.
