# skil

A CLI and desktop GUI for mapping AI skills onto SDLC commands (`/build`, `/tdd`), then pushing a skill or a generated command file. No login.

- **Skills** = folders with `SKILL.md`. Disk owns the body. We hash it; we do not edit it. One catalog, many paths.
- **Commands** = named groups of skill ids **once per project**. `/build` is the same list whether you later export to Cursor or Claude.
- **Inbox** = one staging pool (scanned locals + Discover adds). Filing onto a command does not remove the id.
- **Docks** = folders we scan and install/export into (Claude, Cursor, Codex, Copilot, agents). Windsurf is still scanned.
- **Pull** = `scan` (skill dirs). Stamped command files do not fork the map.
- **Push** = `install` a skill into a dock, **Copy** the same list to a dock, and/or `export` **our** stamped command file (when that dock has one) plus missing skill folders.
- **Usage** = how often catalog skills were read (Claude logs first). Counts only — not “used properly.”

Bin is `skil`. `contextkit` is an alias of the same entry.

## Loop

1. Connect a repo (CLI = current directory; GUI = folder picker on Sync).
2. `skil scan` — find `SKILL.md` under dock skill dirs. The command map stays.
3. Ids sit in Inbox (staging). Create `/build` once, then file a skill onto it. Inbox keeps the id. Folders stay put.
4. `skil copy build --to claude` writes Claude’s stamped file (if that dock has one) and copies missing skill folders. Same list as the map.
5. `skil install <skillId> --to cursor` writes the skill into that dock’s skills dir (Cursor → `.cursor/skills`, not vercel’s `.agents` dump).
6. `skil export --to cursor` writes **our** command files where that dock has command markdown (`skills:` + Goal/Sequence/Rules comments + `## Skills` + `generated_by: skil`) and copies filed local skills if they are not already there. Copilot gets a VS Code prompt file (`.github/prompts/<name>.prompt.md`); Codex gets skill folders only. Discover-only ids are installed. An existing unstamped command file is left alone unless you pass `--replace`. `--replace` on a stamped file resets Goal/Sequence/Rules; otherwise those stay yours.
7. Re-scan refreshes the catalog. Stamp ≠ map is a warn. Gone folders are dropped and reported.
8. `skil usage` prints read counts from Claude session logs.
9. Sync **Import** copies another project’s skills (one dock) into the connected folder. Conflicts warn, then replace overwrites. The connected folder does not change. Market inbox is not copied.

Discover Add puts an id in Inbox. It does not download. Install is a later, explicit step.

## Commands

```bash
skil scan                                              # pull: SKILL.md folders in this repo
skil inbox                                             # list staging skill ids
skil inbox add <skillId>                               # hold an id in Inbox (no download)
skil inbox file <skillId> <command>                    # file onto a command; Inbox keeps the id
skil create <name> [--skills id-a,id-b]                # /build stores build; inbox is reserved
skil delete <name>                                     # drop the command
skil list                                              # the project map
skil add <command> <skillId>                           # add a skill (Inbox unchanged)
skil remove <command> <skillId>                        # remove a skill (Inbox unchanged)
skil copy <command> --to claude [--replace]            # dest stamped file + missing skills
skil copy --all --to claude [--replace]
skil install <skillId> --to <dock>                     # push a skill (cursor|claude|codex|copilot|agents)
skil export --to <dock> [--replace]                    # write command files (if any) and deploy filed skills
skil usage                                             # print Claude read counts
skil search [query] [--trending]                       # typed search, or all-time / trending
```

State lives in `.skil/state.json`. Missing file starts empty. If you still have `.contextkit/state.json` and no `.skil/` file, skil errors — move that file to `.skil/state.json`. Project-local. The CLI uses the current working directory. The GUI connects a folder from the Sync tab — it does not `chdir`.

`skil search` with no query lists the skills.sh all-time leaderboard (top 10, with install counts). `skil search --trending` lists trending. A typed query (`skil search react`) still searches and ignores `--trending`.

Search and browse go through skil's backend, which authenticates to skills.sh with a Vercel OIDC token — no `SKILLS_API_KEY`. Typed search hits `GET /api/skills/search`; the leaderboard hits `GET /api/skills?view=` and is cached on Vercel's CDN. Default origin is `src/config/website.json` (`https://www.skil.website`). Override with `SKIL_API_URL`, then `CONTEXTKIT_API_URL`.

## Desktop GUI

An Electron app (`gui/`) shares the same engine as the CLI. Window and brand say skil.

- **Inbox** — staging pool, search, 25 per page, delete. File onto a command from the Commands tab. Gone ids from the last scan show as a status banner. Re-scan is the header icon after a folder is bound.
- **Commands** — one list (the project map). Create, file from Inbox, remove a skill, delete a command, **Export** (push everything to a dock). No IDE workspace cards, no separate Install/Copy controls — Export already deploys every filed skill to the dock. Filed skills can show Claude read counts.
- **Discover** — market index when shelves have data, otherwise All time / Trending + typed search. Add → Inbox. Works with no folder. Add does not install.
- **Sync** — pick or change the project folder, plus Import from another project (one dock). Not a live merge. No per-dock state file. Light watcher after write-through (debounce, mute our writes, skip `.git`).

Pick a folder and skil scans once. Re-scan is the header icon next to the path. Scan needs a connected folder. Export can pick a dest folder without binding the project.

Export (Commands): push the project map — write our stamped command files where the dock has one, and deploy filed skills that dock is missing (copy local folders; install Discover-only ids internally). Existing dest skill folders are left alone. Result is a modal. If a target command file exists and is not stamped by us, you can confirm Replace.

The CLI's `install` and `copy` verbs (below) are not exposed as separate GUI buttons — Export already covers organize-then-push for the GUI.

Run it with `npm run gui:dev`.

## Troubleshooting

**`Command '<name>' already exists`**
That name is already on this project map.

**`Command '<name>' not found`**
Run `skil list` to see available commands.

**`'inbox' is not a command`**
Inbox is the staging pool. Create a named command (`skil create build`) and add skills onto it.

**`Command file exists and was not generated by skil`**
Export writes our template. Re-run with `--replace` (CLI) or confirm Replace (GUI) if you want to overwrite their file.

**Scan reports no skills**
Scan looks for `SKILL.md` under `.cursor/skills`, `.claude/skills`, `.codex/skills`, `.github/skills`, `.agents/skills`, and leftover `.windsurf/skills`. It does not read **unstamped** `commands/` or Windsurf `workflows/`. Stamped files that disagree with the map are a warn.
