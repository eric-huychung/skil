# skil

A CLI and desktop GUI for mapping AI skills onto SDLC commands (`/build`, `/tdd`), then pushing a skill or a generated command file. No login.

- **Skills** = folders with `SKILL.md`. Disk owns the body. We hash it; we do not edit it.
- **Commands** = named groups of skill ids in the app. Folders do not move when you file.
- **Inbox** = unfiled inventory (scanned locals + Discover adds).
- **Pull** = `scan` (skills dirs only — not `commands/`).
- **Push** = `install` a skill into an IDE skills dir, and/or `export` **our** stamped command file plus the filed skills that IDE is missing.

Bin is `skil`. `contextkit` is an alias of the same entry.

## Loop

1. Connect a repo (CLI = current directory; GUI = folder picker on Sync).
2. `skil scan` — find `SKILL.md` under `.cursor/skills`, `.claude/skills`, `.windsurf/skills`, `.agents/skills`.
3. Unfiled ids sit in Inbox. Create `/build`, then `inbox file` a skill onto it. The map saves; folders stay put.
4. `skil install <skillId> --to cursor` writes the skill into that IDE's skills dir.
5. `skil export build --to cursor` writes **our** command file (`skills:` + short steps + `generated_by: skil`) and copies filed local skills into that IDE if they are not already there. Discover-only ids are installed. An existing unstamped `/build.md` is left alone unless you pass `--replace`.
6. Re-scan refreshes the catalog. The map stays. Gone folders are dropped and reported.

Discover Add puts an id in Inbox. It does not download. Install is a later, explicit step.

## Commands

```bash
skil scan                                              # pull: SKILL.md folders in this repo
skil inbox                                             # list unfiled skill ids
skil inbox add <skillId>                               # hold an id in Inbox (no download)
skil inbox file <skillId> <command>                    # file an Inbox id onto a command
skil create <name> [--skills id-a,id-b]                # /build stores build; inbox is reserved
skil delete <name>                                     # drop a command; skills on disk stay
skil list                                              # list commands
skil add <command> <skillId>                           # add a skill to a command
skil remove <command> <skillId>                        # remove a skill from a command
skil install <skillId> --to <ide>                      # push a skill (cursor|claude|windsurf|agents)
skil export <command> --to <ide> [--replace]           # write our command file and deploy filed skills
skil search [query] [--trending]                       # typed search, or all-time / trending
```

State lives in `.skil/state.json`. If that file is missing, we still load `.contextkit/state.json`; the next save writes `.skil/`. Project-local. The CLI uses the current working directory. The GUI connects a folder from the Sync tab — it does not `chdir`.

`skil search` with no query lists the skills.sh all-time leaderboard (top 10, with install counts). `skil search --trending` lists trending. A typed query (`skil search react`) still searches and ignores `--trending`.

Search and browse go through skil's backend, which authenticates to skills.sh with a Vercel OIDC token — no `SKILLS_API_KEY`. Typed search hits `GET /api/skills/search`; the leaderboard hits `GET /api/skills?view=` and is cached on Vercel's CDN. Default origin is `src/config/website.json` (`https://www.skil.website`). Override with `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.

## Desktop GUI

An Electron app (`gui/`) shares the same engine as the CLI. Window and brand say skil.

- **Inbox** — unfiled skills, search, 25 per page, Scan / re-scan, install from Inbox (download icon, then pick an IDE). Install result is a modal. Gone ids from the last scan show as a status banner.
- **Commands** — create `/build`, file from Inbox, delete, install filed, export.
- **Discover** — All time / Trending, typed search, skill details from listing fields, Add → Inbox. Works with no folder. Add does not install.
- **Sync** — pick or change the project folder. Not a live merge.

Pick a folder and skil scans once. The Scan button on Inbox is re-scan. Scan needs a connected folder. Install and export can pick a dest folder without binding the project.

Install: pick an IDE on Inbox (unfiled) or Commands (filed). Errors show as a visible alert.

Export (Commands only): pick an IDE, write our stamped command file, and deploy filed skills that IDE is missing (copy local folders; install Discover-only ids). Existing dest skill folders are left alone. Result is a modal. If the target command file exists and is not stamped by us, you can confirm Replace.

Run it with `npm run gui:dev`.

## Troubleshooting

**`Command '<name>' already exists`**
Choose a different name, or run `skil list`.

**`Command '<name>' not found`**
Run `skil list` to see available commands.

**`'inbox' is not a command`**
Inbox is the unfiled list. Create a named command (`skil create build`) and file onto it.

**`Command file exists and was not generated by skil`**
Export writes our template. Re-run with `--replace` (CLI) or confirm Replace (GUI) if you want to overwrite their file.

**Scan reports no skills**
Scan looks for `SKILL.md` under the four IDE skills dirs. It does not read `commands/` or Windsurf `workflows/`.
