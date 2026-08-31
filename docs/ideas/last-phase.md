# Last phase

Pick, keep, and drop skills for **this project**. One doctor + one shortlist. GUI, CLI, and a skil `SKILL.md` all call the same engine. No second marketplace. No MCP-as-the-product.

**Who:** a dev with 15+ skills who cannot tell what belongs on this `/build`.

## What we ship

### 1. Doctor (`health()`)  - EVAL

Checkup on skills, commands, and rules — Claude `/doctor` vibe: report, don’t rewrite until they say yes. Unique object is **this command**, not Claude’s install. Same pass for Cursor/Codex because we read disk (`.agents` + `.claude` + `AGENTS.md`).


| Signal                                                                         | How                                                             |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Tokens, fat body, usage=0, hash mismatch                                       | Math. Always. No key.                                           |
| Secrets / PII                                                                  | Regex. Not an LLM.                                              |
| Skills on the same `/build` fight (conflict); description too vague to trigger | LLM when a key is set. Else skip (don’t fake it with keywords). |


Usage counts = Claude logs (already). Other agents get the same overlap/fat/vague warns; their usage later.

### 2. Shortlist (`suggest()`) - Discovery

Sniff the repo (deps, stack, what’s already on) → ~15 - 20 from **our shelves**, not the raw skills.sh leaderboard. Suggestion Tab in Discovery Leaderboard. Never auto-install.

LLM when a key is set. No key → Tab said no LLM key found warning - a button route to setting to set one up and save

### 3. BYOK settings

Local key field (Anthropic / OpenAI, optional `OPENAI_BASE_URL` for Ollama). Not an account. Doctor + shortlist use it when set. Scan/toggle/file never need it. Don’t bundle a model.

### 4. skil `SKILL.md`

Teach the agent: `scan`, `file`, `enable`/`disable`, health, suggest, install.

## Order

1. Provenance honest (market vs local vs edited).
2. Doctor: math + regex first; LLM conflicts or vauge when key exists.
3. Suggestion on Discover (LLM or warning).
4. Settings for the key.
5. `SKILL.md`.



## Not doing

- Auto-install from the leaderboard
- A public “templates API” on top of skills.sh (we already have `GET /api/market/shelves|search|preview`; Landing already copies `npx skills add` — that doesn’t make skil users)
- Folder linter as the product (skilldigest / skillcheck / janitor)
- Live Skill Lift / “used properly” (author eval, not us)
- Bundled Ollama, repo-wide RAG, team YAML, login



## Kill shots

Doctor that requires a key to show token counts. Shortlist that is just Top installs. Shipping MCP before the `SKILL.md`. Health on a lying catalog.