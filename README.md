# skil

A CLI and desktop GUI for mapping AI skills onto SDLC commands (`/build`, `/tdd`), toggling skills/commands/rules on and off, and pushing to `.agents` + `.claude` at once. No login.

- **Skills** = folders with `SKILL.md`. Disk owns the body. We hash it; we do not edit it. One catalog, many paths.
- **Commands** = named groups of skill ids, once per project. `/build` is the same list everywhere.
- **Live pair** = `.agents/skills` + `.claude/skills`. The only two folders skil writes a skill or a human-only command skill into. No dock picker.
- **On/off is a path, not a flag.** Toggling a skill or command off moves its live pair copy to `.skil/parked/skills/<id>` (or `.skil/parked/commands/<name>`). Toggling on copies it back. There is nothing else to confirm.
- **Rules** = shared law lives in `AGENTS.md` (togglable sections; `CLAUDE.md` should `@AGENTS.md` instead of duplicating). Path-scoped glob rules (`.cursor/rules/*.mdc`) stay on disk as-is — read-only, never toggled.
- **Leftovers** = skill/command/rule paths outside the live pair and not parked (e.g. a skill still sitting under `.cursor/skills`). Not on, not off — just an old home we found. `adoptLeftovers` copies it into the live pair and moves the old path to `.skil/deprecated/<original-path>` (recoverable, never scanned again).
- **Scan** = pull. Unions the live pair, every leftover root, and the parked root into one catalog. Hashes `SKILL.md`, reconciles gone/changed/new. Never writes on its own — only `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` / `adoptLeftovers` write.
- **Install** = pulls a market skill straight into the live pair (`.agents/skills/<id>` + `.claude/skills/<id>`). No staging step.
- **Usage** = how often catalog skills were read (Claude logs first). Counts only — not "used properly."

Bin is `skil`. `contextkit` is an alias of the same entry.

## Loop

1. Connect a repo (CLI = current directory; GUI = folder picker on Sync).
2. `skil scan` — rebuild the catalog from `.agents/skills`, `.claude/skills`, `.skil/parked/skills`, and any leftover skill/command/rule paths. The command map stays; this is pull, not team sync.
3. `skil create build --skills tdd,ui` makes the command. It starts off — no folder anywhere — until you enable it.
4. `skil add build design` / `skil remove build design` files or unfiles a skill id on the command. Filing does not touch the catalog or install anything.
5. `skil enable build` writes `/build` as a human-only skill (`disable-model-invocation: true`) into `.agents/skills/build` + `.claude/skills/build`. `skil disable build` parks it under `.skil/parked/commands/build`.
6. `skil install <skillId>` fetches a market skill straight into the live pair. Toggling an already-installed or already-scanned skill between live and parked (`setSkillEnabled`) is GUI-only today — the CLI's `enable`/`disable` verbs only take a command name.
7. If scan finds paths outside the live pair and parked root, those are leftovers. Adopt them (GUI: Sync tab) to fold them into the live pair and retire the old path — nothing is silently deleted.
8. `skil rules` lists `AGENTS.md` shared sections and glob rule files. `skil rules enable <id>` / `skil rules disable <id>` toggles a shared section; glob rules refuse toggling.
9. `skil usage` prints read counts from Claude session logs.

## Commands

```bash
skil scan                                   # pull: rebuild the catalog from the live pair, parked, and leftovers
skil create <name> [--skills id-a,id-b]     # make a command (starts off)
skil delete <name>                          # drop the command from the map (and its live/parked folder)
skil list                                   # the project map
skil add <command> <skillId>                # file a skill onto a command
skil remove <command> <skillId>              # unfile a skill from a command
skil enable <command>                       # turn a command on: writes it into .agents/skills + .claude/skills
skil disable <command>                      # turn a command off: parks it under .skil/parked/commands/<name>
skil install <skillId>                      # install a market skill straight into the live pair
skil rules                                  # list AGENTS.md shared sections + glob rule files
skil rules show <id>                        # print a rule body
skil rules enable <id>                      # turn on a shared-law rule (upserts its AGENTS.md section)
skil rules disable <id>                     # turn off a shared-law rule (removes the section, parks the body)
skil usage                                  # print Claude read counts
skil search [query] [--trending]            # typed search, or all-time / trending leaderboard
```

State lives in `.skil/state.json`. Missing file starts empty. If you still have `.contextkit/state.json` and no `.skil/` file, skil errors — move that file to `.skil/state.json`. Project-local. The CLI uses the current working directory. The GUI connects a folder from the Sync tab — it does not `chdir`.

`skil search react` searches the market index (`GET /api/market/search`) — same index the GUI Discover uses. No query lists the live skills.sh all-time leaderboard (top 10). `--trending` lists trending. A typed query ignores `--trending`.

Live browse still goes through skil's backend with a Vercel OIDC token — no `SKILLS_API_KEY`. Default origin is `src/config/website.json` (`https://www.skil.website`). Override with `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.

## Desktop GUI

An Electron app (`gui/`) shares the same engine as the CLI. Window and brand say skil. Five tabs:

- **Sync** — pick or change the project folder, re-scan, see skills-by-source, and adopt Leftovers ("Use ours and remove leftovers"). Recent folders let you switch without losing state.
- **Skills** — the full catalog (Market = added from Discover, Project = already on disk), searchable, 25 per page, On/Off toggle per row. Click a row for a details preview with Delete and (for market skills) Update. Toggling is the write; filing onto a command does not remove a skill from here.
- **Discover** — market index when shelves have data, otherwise All time / Trending + typed search. Add installs straight into the live pair — no staging step.
- **Commands** — one list, grouped by SDLC stage. Create, file skills from a "From Skills" picker, remove a skill, delete a command, and an On/Off toggle that writes/parks the command's human-only skill in the live pair. No IDE workspace cards, no dock picker.
- **Rules** — shared `AGENTS.md` sections with an On/Off toggle (parks/restores the section body), plus read-only path-scoped glob rules. Click a rule for a preview.

Pick a folder and skil scans once. Re-scan is the header icon next to the path. Scan needs a connected folder.

Run it with `npm run gui:dev`.

## Troubleshooting

`Command '<name>' already exists`
That name is already on this project map.

`Command '<name>' not found`
Run `skil list` to see available commands.

`Can't turn on '<name>': ... already exists and isn't ours to manage`
A live path already holds a skill that isn't this command's own folder. Rename the command or clear that path first — skil never auto-prefixes.

**Scan reports no skills**
Scan looks for `SKILL.md` under `.agents/skills`, `.claude/skills`, `.skil/parked/skills`, and any leftover skill folders elsewhere (`.cursor/skills`, `.codex/skills`, `.github/skills`, `.windsurf/skills`, etc). It does not read unstamped `commands/` folders.
