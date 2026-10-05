# skil architecture

A thin CLI and an Electron app sitting on one engine. Two live folders (`.agents` and `.claude`). On/off is where a folder sits, not a flag. No login, no dock picker, no export.

Other docs: product `docs/requirements/prd.md` · history `docs/design/decisions.md` · Discover backend `docs/design/market-index.md` · diagram `docs/design/system-modules.html` · manual QA `docs/product_test.md`.

## Words we use

| Term | Means | On disk |
|---|---|---|
| **Skill** | a folder with `SKILL.md` | one catalog row, many `paths` |
| **Live pair** | on | `.agents/skills/<id>` and `.claude/skills/<id>` |
| **Parked** | off but still yours | `.skil/parked/{skills,commands,rules}/<id>` |
| **Leftover** | other roots we still scan | `.cursor/skills`, `.codex/skills`, `.github/skills`, `.windsurf/skills`, stray rule files |
| **Deprecated** | leftover we retired | `.skil/deprecated/<original-path>`, never scanned |
| **Command** | one skill list per project (`/build`) | a human-only skill folder in both live trees |
| **Rule** | shared law or path-scoped glob | `AGENTS.md` sections (toggle), `.cursor/rules/*.mdc` etc. (read-only) |

Disk owns the bodies. We own the catalog, the command list, and where each id lives. All of it is in one `.skil/state.json`.

- **Scan** unions live + leftover + parked. Leftover-only skills and commands get copied into the live pair, leftover-only rules get upserted into `AGENTS.md`. The leftover path stays. Parked leftovers stay off.
- **Toggle** on = live pair, off = parked. Discover `+` writes the live pair directly.
- **Filing** a skill onto a command just edits the command's `## Skills` list. It never turns the skill on.
- `CLAUDE.md` is `@AGENTS.md` plus Claude-only notes.

The class is still called `CollectionEngine` (`ICollectionEngine`). Say "command" in product language. Rename the class when it's worth it, don't split the module.

## Stack

Node 20+, TypeScript (strict), Vitest. CLI is Commander, GUI is Electron + React, website is a static Next.js export. HTTP is axios, subprocess is execa, YAML is js-yaml.

## One deep module

Callers only learn `ICollectionEngine` (`src/interfaces/engine.ts`). Inside it hides catalog merge, hashing, all the path rules, the command list, doctor and suggest.

Don't split it into Scanner + Map + Deployer, and don't add HealthEngine / SuggestEngine. Deletion test: delete the engine and the same mess shows up in both the CLI and the GUI.

Adapters (two implementations each, so they're real seams): `IFileSystemAdapter`, `ISkillsAdapter`, `IUsageCollector`. `LlmChat` is optional.

**Writes:** `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled` · `create` / `delete` / `addSkill` / `removeSkill` · `install` / `updateFromMarket` · `adoptLeftovers` / `importToCanonical` / `removeLeftovers` / `resolveDrift` · `deleteSkill` (live + parked only).

**Reads:** `scan` / `skills` / `list` / `rules` / `leftovers` / `auditSync` / `previewSync` · `readSkillMd` / `readRule` · `usage` / `originChecks` / `health` / `suggest` · `search` / `browse`.

`lastWrittenPaths()` is the mute list for DiskWatch.

### Doctor (`health()`)

Read-only, runs over `commands[].skills`, never persisted. No key needed for the math and regex checks:

- **idle-cost**: description over 500 chars
- **fat-body**: `SKILL.md` over 500 lines or 20,000 chars
- **unused**: Claude reads only. Fires once the project has usage and a 14-day grace has passed
- **hash-split**: copies of the same id disagree
- **secret**: looks like a vendor key

With an `LlmChat` it makes one batched call for **conflict** and **vague-trigger**. The prompt is id + description only, secrets are redacted first, answers are cached by prompt hash, and a failed call quietly falls back (`usedLlm: false`). Scoring lives in `src/core/health-checks.ts`.

### Suggest (`suggest(shelves, { role })`)

Read-only, never installs. No key: editorial picks for the role from `data/market-picks.yaml`. With a key: fingerprint `package.json`, then LLM rerank. If the LLM fails you get fingerprint order, not an error.

### BYOK (`LlmChat`)

The user's own key, straight to the provider. Never through our backend. One OpenAI-style chat client with three presets: `anthropic` (`claude-haiku-4-5`), `openai` (`gpt-4.1-nano`), `openrouter` (`openai/gpt-4.1-nano`).

- CLI: `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY`.
- GUI: encrypted vault in Electron `userData`. Many keys, one active. The renderer only sees the raw key when you click the eye. Saving pings the provider, then rebinds the engine.

(Our own AI Gateway key is separate. It's only used by the weekly Discover labeling, see `market-index.md`.)

## Rules of the road

- On/off is a path. Both live paths = on, only parked = off. `enabled` is never stored.
- Scan never invents a command from an unstamped skill folder and never writes into a leftover or deprecated root.
- Same hash at a new path = rename (keep the id). Every path gone = drop the id.
- One catalog, one command list. Market vs Project is just a filter (`source`).
- Command names store without the `/`. A name clash on enable is an error, no auto-prefix.
- Filing never enables. A parked command isn't rewritten until it's toggled back on.
- Glob rule files stay on disk until cleanup. Shared `AGENTS.md` sections toggle, glob files don't.

## Adapters

- **FileSystem**: JSON state plus walk/read/write/copy/remove. The real one jails every path inside the connected folder.
- **Skills**: `search` / `browse` go through our OIDC backend (no user API key). `install` runs `npx skills add --agent universal --copy -y` into `.agents`, then the engine copies it into `.claude`. API origin is `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `src/config/website.json`.
- **Usage**: reads Claude JSONL logs. Missing logs = empty.

## CLI and GUI

Both thin, same engine. Bin is `skil` (`contextkit` still works as an alias).

```
skil search | suggest | install
skil scan | skills | skills enable|disable <id>
skil create | list | add | remove | enable|disable | delete
skil rules | rules enable|disable <id>
skil doctor [name] | usage
```

Top-level `enable`/`disable` are for **commands**. Skills use `skil skills enable|disable`. There's no `copy`, `export`, `show` or `--to`.

GUI tabs: Sync, Discover, Skills, Commands, Rules, Settings (`window.skil`). GUI-only stuff: leftover cleanup, Discover (shelves, creators, preview), Update/Reset, DiskWatch, recent folders (max 5), encrypted keys. Discover, Skills, Commands and Rules work without a folder, scan needs one.

DiskWatch (GUI main) watches the live pair, leftover roots, parked, glob rule dirs and root `AGENTS.md` / `CLAUDE.md`. Debounce ~500ms, mutes our own writes for ~1s, skips `.git` and `.skil/deprecated`. A flush is just `scan()`, not a merge.

## Website and API

`web/` is a static Next.js export (pages: home, about, app, cli, faq, leaderboard, legal, blog). `vercel.json` has `cleanUrls` on so `/cli` works. Server code is Vercel Functions in `api/`, thin wrappers over the compiled `dist/`:

- `api/skills/{index,search}.ts`: skills.sh proxy (Top / Trending / search) using our Vercel OIDC token.
- `api/market/{shelves,search,preview,suggested,creators}.ts`: the Discover read API.

Search `q` is capped at 200 chars and search answers are cached at the edge for 60s. Details in `market-index.md`.

## Data model

Schema **v6**, file `.skil/state.json`. Missing file = empty. A lone `.contextkit/state.json` is an error (move it).

```typescript
interface State {
  version: string              // "6.0"
  commands: CommandRecord[]    // { name, skills[], createdAt }
  skills: SkillRecord[]        // we are the source of truth
  installedSkills: Skill[]     // old leftover, ignored
}

interface SkillRecord {
  id: string                   // path relative to the skills root
  hash: string                 // sha256 of SKILL.md
  paths: string[]              // live + leftover + parked
  source: 'local' | 'skills.sh'
  originHash?: string          // market hash at copy time; scan never overwrites
}

interface RuleRecord {         // walked from disk, never stored
  id: string
  kind: 'shared' | 'glob'
  path: string
  enabled?: boolean            // shared only
}
```

Loading is forgiving: v6 as-is, v5 `membership` unioned, v4 `skills[]`, v3 `collections` renamed. The old `inbox` field is dropped on save. Nothing gets rewritten on read.

A live command is `skills/<name>/SKILL.md` + `agents/openai.yaml` (`disable-model-invocation: true`) in both trees. Off moves it to `.skil/parked/commands/<name>/`. `generated_by: skil` is how enable recognises our own folder during the clash check.

## Secrets

Service role key, AI Gateway key and Vercel OIDC live in server env or a gitignored `.env`. Never `NEXT_PUBLIC_` on the service role, never in `gui/` or the web bundle. CI greps tracked files for key-shaped strings. BYOK keys stay on the user's machine.

## Tests

- **Unit**: engine with adapter fakes (scan, toggle, filing, leftovers, doctor, suggest, `LlmChat`), plus the backend (sync, labeling, shelves, read API).
- **Integration**: CLI on an in-memory engine, temp-dir FS, DiskWatch with a fake clock.
- **E2E**: GUI with the real engine and fake adapters (connect, scan, toggle, cleanup).
- `function-imports.test.ts` builds the project and loads every `api/` function under plain Node ESM, so a bad import fails in CI instead of in prod.

Test through the engine methods, adapter interfaces, CLI handlers, GUI bridge and DiskWatch timing. Don't test persist helpers or `createEngine` wiring directly.

## Not building (yet)

Dock picker, five-way export, Inbox, team YAML, login, SQLite, usage parsers besides Claude, auto-install, stamps on ordinary `SKILL.md`, modeling runtime overlap, live 3-way merge.
