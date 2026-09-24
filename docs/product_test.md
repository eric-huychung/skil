# Product test

Manual pass for the macOS app + CLI. Same engine, two skins.

Use a throwaway clone of a real messy repo (skills in `.claude`, leftovers in `.cursor`, maybe an `AGENTS.md`). Peek at disk after each write:

- **on** = copy in both `.agents/skills` and `.claude/skills`
- **off** = parked under `.skil/parked`, not deleted
- **filing a skill onto a command does not turn that skill on**

Tick as you go. Note the weird stuff.

---

## macOS app

### Install / open

- [ ] Drag `.dmg` into Applications, open it
- [ ] Gatekeeper yell → Open Anyway (or `xattr -cr`). Once is enough
- [ ] App boots. No login wall
- [ ] Help (?) opens How it works / FAQs / About
- [ ] Light / dark toggle doesn’t eat the layout

### Sync

- [ ] Pick a folder. Path shows up. Re-scan works
- [ ] Recents: last folders show, click to switch, drop one
- [ ] Disconnect. Discover still works. First toggle asks for a folder
- [ ] Leftover warning if `.cursor` / old roots exist. Cleanup: leftover-only skills/commands already live after scan (path is safe to remove). Import leftover glob rules. Drop dupes. Conflicts stay a picker. Parked stays off
- [ ] Switch folder → other project’s map, not a mashup

### Discover

- [ ] Top, Trending, search, role shelves all load
- [ ] Preview a skill
- [ ] `+` installs into the live pair (both trees). Row shows up in Skills as on
- [ ] Suggested: no folder → connect prompt. no key → editorial picks + Settings nudge. with key → ranked for this repo
- [ ] Leaderboard down → error, not a blank forever-spinner

### Skills

- [ ] Catalog lists live + parked. Market vs Project filter
- [ ] Toggle on → both live trees. Toggle off → parked, row stays
- [ ] Preview, search, paging
- [ ] Delete is gone-gone (confirm first)
- [ ] Market skill: Update if you didn’t edit, Reset if you did
- [ ] Leftover-only skills copy into the live pair on scan. Leftover path stays until you remove it. Parked leftover extras stay off
- [ ] Empty parent folders don’t linger after the last skill is parked

### Commands

- [ ] Create `/build`. Starts off. `list` in the app matches disk map
- [ ] File a skill onto it. Skill stays off until you toggle the skill
- [ ] Remove a skill from the command. Skill still in catalog
- [ ] Toggle command on → human-only skill folder in both live trees
- [ ] Toggle off → parked, not still sitting live in the repo
- [ ] Name clash (skill already owns that folder) → clear refuse, no half-write
- [ ] Delete the command
- [ ] Health strip / doctor findings open. Ignore a finding if that’s wired

### Rules

- [ ] Shared `AGENTS.md` sections toggle on/off
- [ ] Glob rows (`.cursor/rules/*.mdc` etc.) are read-only
- [ ] Preview works. App does not invent new rules

### Settings

- [ ] Add a BYOK key. Save tests it
- [ ] Many keys, only one on
- [ ] Eye reveals, mask by default. Key stays on this machine
- [ ] Bad key → fail, not a silent save

### Cross-cut

- [ ] Re-scan after CLI writes. App catches up
- [ ] Two folders = two maps. Work vs side project don’t leak
- [ ] Toggle doesn’t feel stuck/glitchy. Loading state is honest

---

## CLI

Run from the **project folder**. `skil --help` is source of truth.

### Smoke

- [ ] `skil --help` and `skil --version`
- [ ] `contextkit --help` (alias, same thing)
- [ ] Wrong cwd / no `.skil` yet → doesn’t explode, just empty-ish

### Find

- [ ] `skil search` — top 10
- [ ] `skil search --trending`
- [ ] `skil search react` — lookup by name
- [ ] `skil suggest` — picks, does **not** install. no key = editorial, with `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY` = rerank
- [ ] `skil install <id>` — lands in the live pair. id from the left column of search

### Skills

- [ ] `skil scan` — leftover-only skills/commands copy into the live pair. Leftover glob rules stay path-scoped. Leftover path stays
- [ ] `skil skills` — on / off
- [ ] `skil skills enable tdd` → both live trees
- [ ] `skil skills disable tdd` → parked, still in catalog
- [ ] `skil enable tdd` is **wrong** (that’s commands). should say so, not silently no-op

### Commands

- [ ] `skil create build --skills tdd` — exists, starts off, tdd filed but not auto-on
- [ ] `skil list`
- [ ] `skil add build design` / `skil remove build design`
- [ ] `skil enable build` / `skil disable build`
- [ ] `skil delete build`
- [ ] enable a name that already exists as a skill folder → clear error

### Rules + eval

- [ ] `skil rules` / `skil rules enable …` / `skil rules disable …`
- [ ] `skil doctor` and `skil doctor build`
- [ ] `skil usage` — Claude read counts, or empty without being a crash

### Don’t expect in CLI

- leftover cleanup (app only)
- Discover browse UI
- encrypted Settings keys (use env vars)

---

## App ↔ CLI

- [ ] Install in app, see it in `skil skills`
- [ ] Park in CLI, see it off in the app after re-scan
- [ ] Create `/build` in CLI, it shows in Commands
- [ ] One `.skil/state.json`. Don’t get two sources of truth

---

## Ship bar

Good enough to ship if:

1. Connect → scan → turn on one skill and one command, both trees match
2. Off parks, doesn’t delete
3. Discover `+` and `skil install` do the same write
4. Nothing half-writes on a name clash
5. Unsigned Mac open path is survivable

Write bugs as: **where / what you did / what you saw / what you expected**.
