# skil

A CLI and desktop GUI for mapping AI skills onto SDLC commands (`/build`, `/tdd`), then pushing a skill or a generated command file. No login.

- **Skills** = folders with `SKILL.md`. Disk owns the body. We hash it; we do not edit it. One catalog, many paths.
- **Commands** = named groups of skill ids **per IDE**. `/build` on Cursor can differ from `/build` on Claude. Folders do not move when you file.
- **Inbox** = one global staging pool (scanned locals + Discover adds). Filing onto a command does not remove the id.
- **Pull** = `scan` (skills dirs + stamped command files — not unstamped `commands/`).
- **Push** = `install` a skill, **Copy** a command to another IDE, and/or `export` **our** stamped command file plus the filed skills that IDE is missing.

Bin is `skil`. `contextkit` is an alias of the same entry.

## Loop

1. Connect a repo (CLI = current directory; GUI = folder picker on Sync).
2. `skil scan` — find `SKILL.md` under the four IDE skills dirs, and pull stamped command files (that IDE's list wins).
3. Ids sit in Inbox (staging). Create `/build` on an IDE (`--ide cursor`, default), then add a skill onto it. Inbox keeps the id. Folders stay put. Other IDEs are unchanged.
4. `skil copy build --from cursor --to claude` copies that command's list, writes Claude's stamped file, and copies missing skill folders.
5. `skil install <skillId> --to cursor` writes the skill into that IDE's skills dir.
6. `skil export --to cursor` writes **our** command files for that IDE (`skills:` + short steps + `generated_by: skil`) and copies filed local skills into that IDE if they are not already there. Discover-only ids are installed. An existing unstamped command file is left alone unless you pass `--replace`.
7. Re-scan refreshes the catalog and stamped lists. Each IDE's stamped file wins that IDE only. Gone folders are dropped and reported.

Discover Add puts an id in Inbox. It does not download. Install is a later, explicit step.

## Commands

```bash
skil scan                                              # pull: SKILL.md folders in this repo
skil inbox                                             # list staging skill ids
skil inbox add <skillId>                               # hold an id in Inbox (no download)
skil inbox file <skillId> <command> [--ide cursor]     # file onto that IDE (Inbox should stay; CLI still drops until aligned)
skil create <name> [--ide cursor] [--skills id-a,id-b] # /build stores build on that IDE; inbox is reserved
skil delete <name> [--ide cursor]                      # drop that IDE's command; other IDEs stay
skil list [--ide cursor]                               # list commands for one IDE (or all)
skil add <command> <skillId> [--ide cursor]            # add a skill on that IDE (Inbox unchanged)
skil remove <command> <skillId> [--ide cursor]         # remove a skill on that IDE (Inbox unchanged)
skil copy <command> --from cursor --to claude          # dest list + stamped file + missing skills
skil copy --all --from cursor --to claude [--replace]
skil install <skillId> --to <ide>                      # push a skill (cursor|claude|windsurf|agents)
skil export --to <ide> [--replace]                     # write that IDE's command files and deploy filed skills
skil search [query] [--trending]                       # typed search, or all-time / trending
```

State lives in `.skil/state.json`. Missing file starts empty. If you still have `.contextkit/state.json` and no `.skil/` file, skil errors — move that file to `.skil/state.json`. Project-local. The CLI uses the current working directory. The GUI connects a folder from the Sync tab — it does not `chdir`.

`skil search` with no query lists the skills.sh all-time leaderboard (top 10, with install counts). `skil search --trending` lists trending. A typed query (`skil search react`) still searches and ignores `--trending`.

Search and browse go through skil's backend, which authenticates to skills.sh with a Vercel OIDC token — no `SKILLS_API_KEY`. Typed search hits `GET /api/skills/search`; the leaderboard hits `GET /api/skills?view=` and is cached on Vercel's CDN. Default origin is `src/config/website.json` (`https://www.skil.website`). Override with `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.

## Desktop GUI

An Electron app (`gui/`) shares the same engine as the CLI. Window and brand say skil.

- **Inbox** — staging pool, search, 25 per page, Scan / re-scan, install from Inbox (download icon, then pick an IDE). Filing does not remove ids. Install result is a modal. Gone ids from the last scan show as a status banner.
- **Commands** — Format switches IDE (not four tabs). List/detail = that IDE. Create, file from Inbox, delete, install filed, export, Copy to another IDE (one command or all).
- **Discover** — All time / Trending, typed search, skill details from listing fields, Add → Inbox. Works with no folder. Add does not install.
- **Sync** — pick or change the project folder. Not a live merge. No per-IDE state file. Light watcher after write-through (debounce, mute our writes, skip `.git`).

Pick a folder and skil scans once. The Scan button on Inbox is re-scan. Scan needs a connected folder. Install and export can pick a dest folder without binding the project.

Install: pick an IDE on Inbox (unfiled) or Commands (filed). Errors show as a visible alert.

Copy (Commands): from the current Format IDE, copy one command or all to another IDE. Writes that dest stamped file and missing skill folders. Cursor files stay put.

Export (Commands): push the current Format IDE — write our stamped command files and deploy filed skills that IDE is missing (copy local folders; install Discover-only ids). Existing dest skill folders are left alone. Result is a modal. If a target command file exists and is not stamped by us, you can confirm Replace.

Run it with `npm run gui:dev`.

## Troubleshooting

**`Command '<name>' already exists`**
That name is already on this IDE. Same name on another IDE is fine — use `--ide` or Copy.

**`Command '<name>' not found`**
Run `skil list` to see available commands.

**`'inbox' is not a command`**
Inbox is the staging pool. Create a named command (`skil create build`) and add skills onto it.

**`Command file exists and was not generated by skil`**
Export writes our template. Re-run with `--replace` (CLI) or confirm Replace (GUI) if you want to overwrite their file.

**Scan reports no skills**
Scan looks for `SKILL.md` under the four IDE skills dirs. It does not read **unstamped** `commands/` or Windsurf `workflows/`. Stamped files update that IDE's command list.
