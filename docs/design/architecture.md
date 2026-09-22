# skil Architecture

Thin CLI + Electron GUI over a connected project folder. Two live trees: `.agents` and `.claude`. On/off is a path, not a flag. No dock picker, no export, no login.

Product: `docs/requirements/prd.md`. History: `docs/design/decisions.md`. Discover backend: `docs/design/market-index.md`. Diagram: `docs/design/system-modules.html`.

## Vocabulary

| Term | Means | On disk |
|---|---|---|
| **Skill** | folder with `SKILL.md` | one catalog row, many `paths` |
| **Live pair** | on | `.agents/skills/<id>` **and** `.claude/skills/<id>` |
| **Parked** | off-but-yours | `.skil/parked/{skills,commands,rules}/<id>` |
| **Leftover** | other roots we still scan | `.cursor/skills`, `.codex/skills`, `.github/skills`, `.windsurf/skills`, stray always-on rule files |
| **Deprecated** | leftover already retired | `.skil/deprecated/<original-path>` — never scanned |
| **Command** | one skill list per project (`/build`) | live = human-only skill folder in both trees |
| **Rule** | shared law vs path-scoped glob | `AGENTS.md` sections (togglable); `.cursor/rules/*.mdc` etc. (read-only) |

Disk owns skill/rule bodies. We own: the catalog, the one command list, and where each id currently lives. One `.skil/state.json`.

**Scan** unions live + leftover + parked and writes nothing. **Toggle** is the write: on → live pair, off → parked. Market `+` writes the live pair directly.

Filing edits a command's `## Skills` list. It does not install or enable the filed skill. `CLAUDE.md` is `@AGENTS.md` plus Claude-only notes.

The class is still `CollectionEngine` (`ICollectionEngine`). Call it **Command** in product language. Rename the class when it stops lying; do not split the module.

## Stack

Node 20+, TypeScript (strict), Vitest. CLI: Commander. GUI: Electron + React. HTTP: axios. Subprocess: execa. YAML: js-yaml.

## One deep module

Callers learn `ICollectionEngine` (`src/interfaces/engine.ts`). The implementation hides catalog merge, hashing, live/parked/leftover/deprecated paths, the one command list, doctor, and suggest.

Do **not** split into Scanner + Map + Deployer. Do **not** add HealthEngine / SuggestEngine. **Deletion test:** delete the engine and that complexity reappears in both CLI and GUI.

Supporting adapters (two implementations each = a real seam): `IFileSystemAdapter`, `ISkillsAdapter`, `IUsageCollector`. Optional `LlmChat` (same pattern as usage — default none).

### Writes

- Toggle: `setSkillEnabled` / `setCommandEnabled` / `setSharedRuleEnabled`
- File: `create` / `delete` / `addSkill` / `removeSkill`
- Market: `install` / `updateFromMarket`
- Leftovers: `adoptLeftovers` / `importToCanonical` / `removeLeftovers` / `resolveDrift`
- Hard delete: `deleteSkill` (live + parked only)

### Reads

- Catalog: `scan` / `skills` / `list` / `rules` / `leftovers` / `auditSync` / `previewSync`
- Bodies: `readSkillMd` / `readRule`
- Reports: `usage` / `originChecks` / `health` / `suggest`
- Market pass-through: `search` / `browse`

`lastWrittenPaths()` is the DiskWatch mute list.

### Doctor (`health()`)

Read-only over `commands[].skills` — never a folder walk, never persisted. Math + regex always, no key:

- **idle-cost** — description > 500 chars
- **fat-body** — `SKILL.md` > 500 lines or 20,000 chars
- **unused** — Claude reads only; fires after the project has usage **and** a 14-day grace. 0 reads with no logs is not a warning
- **hash-split** — copies of the same id disagree on disk
- **secret** — vendor-key-shaped regex hit

With an `LlmChat`: **one batched call** for every command that has filed skills → **conflict** + **vague-trigger**, fanned per command. Prompt is **id + description only** (bodies stay on-machine for math checks). Cached by prompt hash. Failed call degrades silently (`usedLlm: false`). Secrets are redacted before the prompt leaves the machine. A bad key surfaces when you save it, not on every doctor run.

Scoring lives in `src/core/health-checks.ts`. `skil doctor` and the Commands health strip both call `health()`.

### Suggest (`suggest(shelves, { role })`)

Read-only, never persisted, never installs. No key → editorial picks for `options.role` (default `swe`) from `data/market-picks.yaml` (`usedLlm: false`). With a key → fingerprint `package.json`, LLM-rerank. LLM fail → fingerprint order, not an error.

### BYOK (`LlmChat`)

User-owned key, direct to the provider. Never through skil's backend or AI Gateway. (`LlmSkillClassifier` is our key, weekly shelf classify only.)

One OpenAI-chat-completions client. Presets: `anthropic` (`claude-haiku-4-5`), `openai` (`gpt-4.1-nano`), `openrouter` (`openai/gpt-4.1-nano`). Method: `complete({ system, user })`.

- CLI: `SKIL_LLM_PROVIDER` + `SKIL_LLM_API_KEY` (`src/llm/env-llm-settings.ts`)
- GUI: encrypted vault under Electron `userData` (`llm-settings.json`). Many keys, one `activeId`. Renderer never sees the raw key until the eye is clicked. Settings is a workspace tab: one row per key (provider, mask, eye, on/off). Saving pings then rebinds the session engine (`rebindLlmChat`).

### Invariants

- **On/off is a path.** Both live paths → on. Only parked → off. Leftover-only → neither. `enabled` is never persisted.
- Scan never writes. Never invents a command from a skill folder. Never touches leftover or deprecated except through leftover cleanup.
- Same hash at a new path is a rename (keep the id). Every path gone → drop the id.
- One catalog, one command list. Market vs Project is a display filter (`source`), not two states.
- Command names store without `/` (`create('/build')` → `build`). Name collision on enable is an error — no auto-prefix.
- Filing never enables. A parked command is not rewritten until toggled back on.
- Glob rules stay on disk, never folded into `AGENTS.md`, never toggled.

## Adapters

**FileSystemAdapter** — JSON state plus walk/read/write/copy/remove. The real adapter jails every path under the connected project folder. Ids, hashes, and reconcile stay in the engine.

**SkillsAdapter** — `search` / `browse` via skil's OIDC backend (no user API key). `install` runs `npx skills add --agent universal --copy -y` into `.agents`; the engine `copyDir`s into `.claude`. `skillHash` is the live market SKILL.md hash for Update. Origin: `SKIL_API_URL`, then `CONTEXTKIT_API_URL`, then `website.json`.

**UsageCollector** — Claude JSONL in prod, in-memory in tests. Missing logs → `[]`.

## CLI / GUI

Both thin. Same engine. Bin is `skil`; `contextkit` is an alias.

**CLI = README verbs** (cwd). The live-pair `SKILL.md` teaches that same loop, including `skil skills`. **GUI = browse + leftovers + preview.** Not feature parity. Catch-up: `tasks/plan.md`.

```
skil search | suggest | install
skil scan | skills | skills enable|disable <id>
skil create | list | add | remove | enable|disable | delete
skil rules | rules enable|disable <id>
skil doctor [name] | usage
```

No `--to`, `--from`, `copy`, `export`, or `show`. Top-level `enable`/`disable` are **commands**. Skills use `skil skills enable|disable`.

**GUI-only:** leftover cleanup, Discover shelves/preview, Update/Reset, DiskWatch, recents, encrypted BYOK. Not a CLI daemon.

GUI tabs: Sync, Discover, Skills, Commands, Rules, Settings (`window.skil`). Recents: `recent-folders.json`, max 5. Discover / Skills / Commands / Rules work with no folder; scan needs one.

DiskWatch (GUI main): live pair, leftover roots, parked, glob rule dirs, root `AGENTS.md` / `CLAUDE.md`. Debounce ~500ms, mute our writes ~1s, skip `.git` and `.skil/deprecated`. Flush = `scan()`. Not a 3-way merge.

## Market index

Curated Supabase copy of skills.sh. Feeds Discover only. Not the engine catalog. See `docs/design/market-index.md`.

## Data model

Schema **v6**. Path: `.skil/state.json`. Missing file → empty. Lone `.contextkit/state.json` is an error (move it).

```typescript
interface State {
  version: string              // "6.0"
  commands: CommandRecord[]    // { name, skills[], createdAt }
  skills: SkillRecord[]        // we are SoT
  installedSkills: Skill[]     // leftover, ignored
}

interface SkillRecord {
  id: string                   // path relative to the skills root
  hash: string                 // sha256 of SKILL.md
  paths: string[]              // live + leftover + parked
  source: 'local' | 'skills.sh'
  originHash?: string          // market copy-time hash; scan never overwrites
}

interface RuleRecord {         // walked from disk, never persisted
  id: string
  kind: 'shared' | 'glob'
  path: string
  enabled?: boolean            // shared only
}
```

Load: v6 as-is → v5 `membership` unioned → v4 `skills[]` → v3 `collections` renamed. Old `inbox` field dropped on persist. `installedSkills` and `deployedTo` still load/write so old files don't break — ignored as the catalog. No rewrite on read.

Id = path relative to the skills root (`build/tdd`). Hash = `SKILL.md` only.

Live command skill: both trees get `skills/<name>/SKILL.md` + `agents/openai.yaml` (`disable-model-invocation: true`). Off moves both to `.skil/parked/commands/<name>/`. `generated_by: skil` is how enable recognizes our folder during the collision check. `addSkill` / `removeSkill` rewrite frontmatter `skills:` and `## Skills` on the live pair only.

## Secrets & runners

Service role, AI Gateway, and Vercel OIDC live in server env / `.env` (gitignored). Never `NEXT_PUBLIC_` on the service role. Never in `gui/` or the Next client bundle. Market HTTP handlers are thin adapters over `dist/`. Weekly shelf refresh is GitHub Actions `--classify-only` (Supabase + AI Gateway secrets). BYOK keys stay on the user's machine (`safeStorage` / `SKIL_LLM_API_KEY`).

## Tests

**Unit** — engine with adapter fakes: scan, toggle, file, leftovers, doctor (math + batched LLM + silent degrade), suggest (editorial / fingerprint / fallback), `LlmChat` presets.

**Integration** — CLI against in-memory engine; temp-dir FS; DiskWatch fake clock.

**E2E** — GUI with real engine + fake adapters: connect → scan → toggle on/off → leftover cleanup.

Seams: engine public methods, adapter interfaces, CLI handlers, GUI bridge, DiskWatch debounce/mute. Not seams: persist helpers, `createEngine` wiring.

## Not this phase

Dock picker, five-way export, Inbox, team YAML, login, SQLite, usage parsers besides Claude, auto-install, stamps on ordinary `SKILL.md`, modeling runtime overlap, live 3-way merge.

## References

`docs/design/decisions.md` · `docs/design/market-index.md` · `docs/design/system-modules.html` · `docs/requirements/prd.md` · `README.md`
