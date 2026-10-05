# skil

[![CI](https://github.com/eric-huychung/skil/actions/workflows/ci.yml/badge.svg)](https://github.com/eric-huychung/skil/actions/workflows/ci.yml)

Give your agent skills a home.

Find skills, file them onto workflows like `/build`, and see which ones still earn their spot.

Open source. macOS app + CLI. No login.

[Website](https://www.skil.website/) · [Source](https://github.com/eric-huychung/skil) · [LinkedIn](https://www.linkedin.com/in/huychung/)

## Install

**App** — `.dmg` from [skil.website](https://www.skil.website/) or [Releases](https://github.com/eric-huychung/skil/releases). Unsigned on purpose (no Apple tax). macOS will yell. My bad, I'm broke.

1. Drag Skil into Applications.
2. Double-click. If it blocks: **System Settings → Privacy & Security → Open Anyway** (password / Touch ID). Once is enough.

Or skip the scare. Curl doesn’t get the browser quarantine stamp:

```bash
curl -L -o ~/Downloads/skil.dmg \
  https://github.com/eric-huychung/skil/releases/latest/download/Skil-arm64.dmg
open ~/Downloads/skil.dmg
```

Drag it in, then:

```bash
xattr -cr /Applications/Skil.app
```

Intel Mac? Same URL with `x64` instead of `arm64`.

**CLI** — from this repo:

```bash
git clone https://github.com/eric-huychung/skil.git
cd skil && npm install && npm run build
npx skil --help
```

Run the CLI from your project folder.

---

## Find

```bash
skil search
skil search --trending
skil search react
skil suggest
skil install obra/react-patterns
```

- `search` — top 10 by installs
- `search --trending` — what’s hot
- `search react` — lookup by name
- `suggest` — picks for this repo (doesn’t install)
- `install …` — drop that skill into the project. Use the name in the left column from search.

---

## Organize

On = a copy in both `.agents/skills` and `.claude/skills` (the live pair). Off = parked under `.skil/parked`, not deleted. Leftovers (old folders like `.cursor/skills`) — clean those in the app.

### Skills

```bash
skil scan
skil skills
skil skills enable tdd
skil skills disable tdd
```

- `scan` — find `SKILL.md` folders. Copies leftover-only skills/commands/rules into canonical homes; leftover path stays.
- `skills` — what’s in the catalog (on / off)
- `skills enable` / `disable` — turn one skill on or off. Not `skil enable` — that one’s for commands.

### Commands

A command is a workflow (`build` → `/build`). Adding a skill to it doesn’t turn that skill on.

```bash
skil create build --skills tdd
skil list
skil add build design
skil remove build design
skil enable build
skil disable build
skil delete build
```

- `create` — make a command (starts off)
- `list` — what’s on the map
- `add` / `remove` — put a skill on a command, or take it off
- `enable` — turn the command on
- `disable` — park it
- `delete` — drop the command

### Rules

```bash
skil rules
skil rules enable pair-programming/behavior
skil rules disable pair-programming/behavior
```

- `rules` — list shared `AGENTS.md` sections and other rule files
- `enable` — turn a shared section on
- `disable` — turn it off

skil keeps its map in `.skil/state.json`.

---

## Eval

```bash
skil doctor
skil doctor build
skil usage
```

- `doctor` — checkup per command
- `doctor build` — that command’s findings
- `usage` — how often Claude actually read a skill

---

## App

```bash
npm run gui:dev
```

Same project, visual. Discover, Skills, Commands, Rules, Sync, Settings.

## License

MIT
