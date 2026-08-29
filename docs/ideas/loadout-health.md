# Loadout health (planned moat)

Future moat, not this week's loop. The map (scan → Inbox → file → export) still has to work first. Inbox provenance (market vs local vs forked) is a prerequisite — warnings on a confused catalog are noise.

## Problem Statement

How might we warn a developer that the skills on **this project's `/build`** will confuse the agent or burn context, without becoming a generic SKILL.md linter or a token dashboard?

File managers (skills-manager, ECC) move folders. They do not say "these two on the same command will fight" or "this loadout's descriptions already blow the idle budget." That is the gap. Token UI is a slice of the same warning, not a product.

## Planned moat (two layers)

**Now (product):** loadout health on the command map we already own. Overlap, conflicts, fat bodies, idle description cost. "Agent will get confused."

**Later (data, do not advertise):** which command *sets* stay slim and which skill pairs clash. Hard to copy. We have **zero** of this today. A public "set leaderboard" is a fantasy until real projects produce fingerprints. Do not build a collections marketplace to chase it.

## What this is not

A linter that walks `.cursor/skills` and competes with:

- [skillcheck](https://github.com/RiriXt1/skillcheck) — frontmatter, trigger collisions, secrets
- [skilldigest](https://github.com/JSLEEKR/skilldigest) — tokens, bloated, conflicting, dead, cyclic
- [skills-janitor](https://github.com/prateek/skills-janitor) — name collisions, overlap-before-install, token cost
- [SKILL.md Inspector](https://github.com/Krusty84/SKILL.md-Inspector) — VS Code Problems + token report

If we only scan a folder, they win. Our unique object is the **command** (`commands[].skills` in `.skil/state.json`): two skills can be fine on disk and lethal together on `/build`. Slash command body vs filed skill is a second conflict type they cannot see.

"AI native" does **not** mean an LLM judge. PRD already parks "used properly." Heuristics + usage counts we already collect.

## Recommended Direction

One feature, hung on the existing loop — not a new app, tab, or deep module.

```
scan / file / Discover+
        ↓
  health on the map
        ↓
  banner + badges
        ↓
  person trims / does not file
        ↓
  export (unchanged)
```

Reuse:

- **Engine** already has catalog hashes, `readSkillMd`, one command list, `usage()` (Claude reads).
- **Scan** already returns warns (`gone`, `commandPulls`) and the GUI already has an Inbox `role="status"` banner.
- **Commands** already show usage counts on filed skills.
- **Discover Add** already lands in Inbox — that is the moment for a precheck (janitor-style, but vs the command list, not vs the whole disk).

Do not add MCP, team YAML, or a token chart. A later `SKILL.md` that teaches agents to run `skil scan` / `file` / `export` is distribution, not this moat.

## How the MVP fits this project

Constraint: no second deep module. Health is a pure function over catalog + command lists + SKILL.md bytes the FS adapter already reads. Call it from scan (and optionally from `file` / `addToInbox`). Persist nothing new in v1. No schema bump.

**Seam:** `engine.health()` (or fold a `warnings[]` onto `ScanResult`). Tests hit that method with in-memory FS, same as scan. CLI prints it on `skil scan`. GUI maps it onto the existing banner + small badges on Commands / Inbox. Discover `+` can call the same overlap check against filed ids before add.

**Signals (heuristic, no LLM, no extra tokenizer in v1):**

| Signal | Why it fits | Cheap test |
|---|---|---|
| Overlapping descriptions among **filed** skills on one command | Unique to our map | Keyword overlap on YAML `description` |
| Vague / missing / too-long description | This is what actually fails to trigger; idle cost is descriptions, not bodies | Frontmatter length + filler openers |
| Fat body | Anthropic: body on trigger, keep under ~500 lines / ~5k tok | Line count + char count of body after frontmatter |
| Idle cost per dock | Claude Code ~15k char budget for **all** skill+command descriptions; overflow silently drops skills | Sum of descriptions the dock can see, plus per-command subset |
| Hash mismatch same id across docks | Catalog already hashes | `changed` / multi-path hash split |
| Usage = 0 | `engine.usage()` already exists | Badge next to the count |

Idle cost > fire cost for "too many skills." Fat body matters when that skill actually loads. Show both; do not ship a dashboard.

**Discover precheck** is the same overlap function at `+` time: "this listing overlaps ~70% with `tdd` already on `/build`." Highest leverage, still one feature.

**Fits the current user flow:** scan still pulls. Organize still files. Export still pushes. Health is a warn on pull and on file, not a new phase. We do not rewrite `SKILL.md`. We do not block export.

## Key Assumptions to Validate

- [ ] People with 10+ skills on one command feel confusion, not just clutter. Test: run health on this repo's own `/build` (and one friend's). If warnings look wrong or "so what," stop.
- [ ] Heuristic overlap is good enough to trim without an LLM. Test: 5 real loadouts; if >half the warns are nonsense, do not ship.
- [ ] They trust the map enough to act. Blocked on Inbox provenance (market vs copied vs forked). Do not ship health first.
- [ ] Description-budget / overlap > body-token charts. If users only ask "how many tokens is this file," they will use skilldigest; we should not bother.

## MVP Scope

Minimum that tests the core assumption ("warns on **this command** change what they file").

**In**

- Health over **filed** skills per command (not a raw folder walk as the product).
- Fat = index (description) vs body size.
- Overlap / vague description on that command.
- Idle description-cost number (chars or rough tokens) on the command, maybe dock inventory.
- Surface: scan banner + badges on Commands (and Inbox if cheap). CLI: extra lines on `skil scan` (no new `skil doctor` verb yet).
- Optional in the same slice: Discover `+` overlap vs already-filed ids.

**Out of this MVP**

- Tokenizer accuracy vs every model (char/line count is enough).
- LLM judge, "used properly," eval product (Opxskill's lane).
- CI / SARIF (skilldigest already does this).
- Set leaderboard, anonymous clash dataset, collections marketplace.
- MCP server, team `.yml` sync, token charts, new GUI tab.
- Auto-fix / rewrite skill bodies.
- Blocking export on warnings.

## Not Doing (and Why)

- **Folder linter as the product** — skillcheck / skilldigest / janitor already do it. We lose.
- **Token manager** — vitamin; IDEs show context. Numbers live on the health view.
- **MCP so we look AI-native** — skills.sh MCPs already exist; wrapping our CLI is a weekend skin. A skil `SKILL.md` is the cheap agent path, later.
- **Team sync / `.skil.yml`** — leftover. Repo + Import is the sync. Needs login to become real; kills no-login.
- **Data moat / set leaderboard** — zero data. Earn fingerprints after people use the map. Do not ship a ghost leaderboard.
- **Health before Inbox provenance** — warnings will lie about market vs fork vs local.

## Sequencing vs the rest of skil

1. Map is honest (Inbox: market vs project vs altered).
2. This MVP (loadout health on commands).
3. Skil `SKILL.md` for the CLI (distribution).
4. MCP only if (3) fails in real agent sessions.
5. Team sync only if three teams ask.
6. Data/leaderboard only after we have loadouts worth learning from.

PRD already parks "token / fat-skill linter" as a later wedge and sets month 6 as the signal. This doc is that wedge, sharpened: **command loadout**, not folder lint.

## Open Questions

- Fold warnings into `ScanResult` vs a separate `health()` the GUI calls after scan/file? Prefer separate so Discover precheck does not pretend to be a scan.
- Warn at file-time (block? confirm?) or badge-only? MVP: badge + banner, never block.
- Do we count **all installed skills the dock can see** for idle budget, or only filed ones? Idle budget is the whole dock; overlap is the command. Show both if cheap, command-first if not.
- Hash-split same id across docks: health or keep as scan `changed` only?

## Competitors (context)

File managers: ECC, skills-manager, Skillsmith. Eval: Opxskill. Folder linters: listed above. None of them own "this `/build` loadout." That is the only durable difference. Do not blur it.
