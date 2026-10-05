# skil

CLI + desktop GUI that maps AI skills onto SDLC commands and toggles them on/off in `.agents` + `.claude` at once. No login. Work vs side project = two folders = two maps.

How it is built: `docs/design/architecture.md`. User loop: `README.md`.

## Problem

Developers accumulate AI skills as folders (`SKILL.md`) across `.cursor` / `.claude` / `.codex` / `.github` / `.agents`. Install (`npx skills add`) and discovery (skills.sh) exist. What they lack is a **map**: which skills are on in this project, which SDLC command they belong to (one `/build`, not one per tool), and a way to turn things on without a five-way dock picker. They also cannot see which filed skills get used, which fight, or which are fat.

## Product

- **Skills** = folders with `SKILL.md`. Disk owns the body. One catalog, many `paths`.
- **Live pair** = `.agents` + `.claude`. On when it lives in both. There is no "on for Cursor, off for Claude."
- **Parked** = off-but-yours, under `.skil/parked/…`. Toggle-on restores (or re-fetches a market skill whose parked copy is gone).
- **Leftover** = every other root we still scan. Leftover-only skills/commands copy into the live pair on scan; leftover-only rules upsert into `AGENTS.md`. Leftover path stays until cleanup. Parked leftovers stay off.
- **Deprecated** = leftover already retired. Recoverable, never re-scanned.
- **Commands** = named groups of skill ids, once per project. A live command is a human-only skill folder in both trees. Filing does not turn the filed skill on.
- **Rules** = shared law in `AGENTS.md` (togglable). Glob files (`.cursor/rules/*.mdc`, etc.) stay on disk, read-only.
- **Toggle** = the write. On → both live folders. Off → parked. No export step, no dest to pick.
- **Doctor** = findings per command. Math + regex free; conflict / vague-trigger with a BYOK key.
- **Suggest** = shortlist for this repo. Editorial without a key; LLM-rerank with one. Never auto-installs.
- **Usage** = Claude read counts. Not "used properly."

We are **not** SoT for file contents. We **are** SoT for: what exists here, on/off (a path, not a flag), and which skills sit on which command. One `.skil/state.json`.

We wrap skills.sh (OIDC backend) and `npx skills add`. We do not host a marketplace.

## Loop

1. Connect a repo (optional). Discover / Skills / Commands work without one. First toggle can pick a folder.
2. Scan unions live + leftover + parked. Leftover-only skills/commands copy into the live pair. Leftover-only rules upsert into AGENTS.md.
3. Create `/build`, file skills onto it. Filing does not move folders.
4. Toggle on → both live trees. Discover `+` is the same write. Toggle off → parked, row stays.
5. Sync leftover cleanup: drop ready duplicates, resolve drift. Parked is never touched.
6. Doctor on Commands. Suggest on Discover. Settings holds the BYOK key.

## GUI

Six tabs. Same engine as the CLI. No login.

- **Sync** — pick / change folder, recents (max 5), leftover cleanup.
- **Discover** — Top / Trending / Creators / role shelves / search, plus Suggested (editorial without a key; LLM-rerank with one). `+` installs to the live pair.
- **Skills** — the catalog. Market vs Project is a filter. Toggle per row. Preview, Delete, Update (unedited) / Reset (edited).
- **Commands** — one list. Create, file, remove, delete, toggle. Health strip per row. Filed skills show Claude read counts.
- **Rules** — shared sections toggle; glob rows are read-only. Preview. Does not create rules.
- **Settings** — BYOK keys on one row each (provider, mask, eye, on/off). Many keys, one on. Encrypted on disk. Renderer never sees the raw key until the eye is clicked. Save tests the key.

Header shows the bound path and Re-scan only after connect. There is no push control — a toggle (or Discover `+`) is the write.

## CLI

Same engine. README is the user CLI. Bin `skil`; `contextkit` alias.

```
skil search | suggest | install
skil scan | skills | skills enable|disable <id>
skil create | list | add | remove | enable|disable | delete
skil rules | rules enable|disable <id>
skil doctor [name] | usage
```

Top-level `enable`/`disable` are **commands**. Skills use `skil skills enable|disable`. Leftover cleanup stays in the app. No `show`. BYOK has no verb — set `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY`.

GUI keeps Discover browse, leftover cleanup, DiskWatch, recents, encrypted keys.

## Stories

- Connect a folder with no account; scan every skill root; see on/off from the path.
- One `/build` for the project, not one per tool. File without enabling. Toggle writes both trees.
- Turning `/build` on refuses clearly if a skill already owns that folder name.
- Discover `+` turns a market skill on immediately. Update when the market moved and we did not edit; Reset if we did.
- Discover Creators sits next to Top / Trending: 30 creators from a hand-edited list, each card with skill count, total installs ("installs, skills.sh") and an "Official on skills.sh" badge when skills.sh lists the owner. Never "verified". Click → that creator's skills grouped by repo, with topic chips and `+` (Landing: copy `npx skills add`).
- Shelves collapse a vendor suite to one row, "name, +N more" (click searches the suite), and cap one owner at 5 rows per shelf.
- Leftover cleanup adopts what's missing and deprecates the rest.
- Doctor flags idle-cost, fat-body, unused, hash-split, and secrets with no key. A local LLM key adds conflict / vague-trigger. Key stays on this machine, sent only to the provider.
- Suggested ranks market skills for this `package.json`. No folder → connect prompt. No key → editorial picks + Settings warning. `skil suggest` prints the same ids.
- A skil `SKILL.md` (live pair) teaches the README loop, including `skil skills`. `enable <command>` stays commands-only. Leftovers stay in the app. No `show`.

## Out of scope

Dock picker, five-way export, Inbox, scanning unstamped `commands/` as map input, cross-project import, skill authoring, our own registry, team `.yml` sync, last-folder as SoT (recents are a convenience, not the map), live 3-way merge, auto-sync of market skills, login / SSO / analytics, IDE extensions, global (`~/`) skill library, `skil run`, SQLite, "used properly" eval, usage parsers besides Claude, stamps on ordinary `SKILL.md`, modeling runtime overlap (Cursor also loading `.agents`).

## Open questions

- Confirm `skil` is free on npm before publish.
- One skill on many commands — the map allows it; the GUI files from Skills only.
- Parked is the last live snapshot at toggle-off. No merge if it goes stale while off.

## Success

**Month 1:** people connect a real repo, scan, and turn on at least one command.

**Month 3:** toggle used both ways; doctor glanced at; leftover cleanup used on a messy repo.

**Month 6:** signal whether Suggest + BYOK doctor are worth deepening, or whether the map alone is the product.
