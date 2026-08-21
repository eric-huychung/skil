# ContextKit

A CLI (and desktop GUI) for managing collections of AI skills, and exporting them to Cursor, Claude, or Windsurf format. Group skills into named collections, edit them freely, tie a command template to each one, then export to whichever IDE format you need.

## Commands

```bash
contextkit create <name> --skills skill-a,skill-b [--command "<cmd>"]  # define a collection, optionally with a command template
contextkit add <collection> <skillId>                 # add a skill to an existing collection
contextkit remove <collection> <skillId>               # remove a skill from an existing collection
contextkit run <collection>                            # run the collection's command template
contextkit list                                        # list all collections
contextkit search [query] [--trending]                 # typed search, or all-time/trending leaderboard when query is omitted
contextkit install <skillId>                           # install a skill via npx skills add
contextkit convert <skillId> --to <ide>                # convert a single skill to cursor/claude/windsurf format via skillsmith
contextkit export <collections...> --to <ide>          # convert every skill in one or more collections to an IDE format
contextkit sync [--config <path>]                      # sync collections from .contextkit.yml
```

State lives in `.contextkit/state.json`; skill sources live in `.contextkit/skills/`. Both are project-local.

`contextkit search` with no query lists the skills.sh all-time leaderboard (top 10, with install counts). `contextkit search --trending` lists trending. A typed query (`contextkit search react`) still searches and ignores `--trending`.

`contextkit search` and `contextkit install` go through ContextKit's own backend, which authenticates to skills.sh with a Vercel OIDC token — no `SKILLS_API_KEY` needed. Typed search hits `GET /api/skills/search`; the leaderboard hits `GET /api/skills?view=` and is cached on Vercel's CDN. Point the CLI at a different backend with `CONTEXTKIT_API_URL` (defaults to `https://contextkit.dev`).

## Desktop GUI

An Electron app (`gui/`) shares the same `CollectionEngine` as the CLI: create collections, add/remove skills, search and install from skills.sh (empty Search shows All time / Trending leaderboards), and export a collection to an IDE — all as thin UI over the same business logic. Run it with `npm run gui:dev`.

## Troubleshooting

**`Collection '<name>' already exists`**
Choose a different name, or run `contextkit list` to see existing collections.

**`Collection '<name>' not found`**
Run `contextkit list` to see available collections.

**`Collection '<name>' has no command defined`**
Set one with `contextkit create <name> --command "<cmd>"`, or edit `.contextkit/state.json` directly.

**`skillsmith is not installed`**
`contextkit convert`/`contextkit export` shell out to `skillsmith`. Run `npm install -g skillsmith` and try again.

**Config errors from `contextkit sync`**
`.contextkit.yml` must have a top-level `collections` object mapping collection names to arrays of skill IDs:

```yaml
version: "1.0"
collections:
  frontend:
    - owner/skill-name
```
