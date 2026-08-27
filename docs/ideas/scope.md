# skil: AI Context Orchestration Tool

## Problem Statement

How might we help developers organize and switch between AI skills efficiently, so they can use the right context for each task without manual management overhead?

## Recommended Direction

Build a **context orchestration layer** (CLI + GUI) that sits on top of the existing ecosystem (Vercel's skills CLI, skills.sh registry, skillsmith converter). Instead of competing with installation/discovery infrastructure, we solve the workflow problem: organizing skills into collections, switching context with one command, and syncing team configurations.

The key insight: Vercel solved "how do I install skills" (npx skills add) and "how do I find skills" (skills.sh). Nobody solved "how do I manage 20+ installed skills" or "how does my team standardize context setup." That's our wedge.

**Architecture:** Thin orchestration layer that manipulates symlinks in skill directories and wraps existing tools with convenient commands. Not rebuilding infrastructure—just adding workflow automation on top.

**Distribution:** npm package (CLI) + Electron app (GUI). CLI for power users, GUI for visual preference. Both use the same core engine.

## Key Assumptions to Validate

- [ ] **Developers want organization over "enable all"** — test by building CLI MVP and seeing if 10 developers actually create collections or just load everything. Validate in 2 weeks.
- [ ] **Collections solve a real workflow problem** — interview 5 developers about current context management pain. Ask: "Do you use different skills for different tasks, or same skills always?" Validate before building GUI.
- [ ] **Team sync is valuable** — talk to 3 engineering teams (5+ devs) about AI context standardization. Would they use `.skil.yml` like they use `package.json`? Validate before investing in team features.
- [ ] **CLI + GUI covers different user types** — track which gets more usage after launch. If GUI is <10% usage, don't maintain it. Validate in month 2.
- [ ] **Thin wrappers add value** — users might just prefer `npx skills add` directly. Test if convenience wrappers (`skil install`) get used or ignored. Validate in month 1.



## MVP Scope

**What's In:**

### CLI Core (2 weeks)

- `skil create <name> --skills skill1,skill2,skill3` — create skill collection
- `skil use <name>` — enable collection (symlinks skills to active directory)
- `skil disable` — disable current collection (remove symlinks)
- `skil list` — show all collections
- `skil status` — show what's currently active
- Works by manipulating `.agents/skills/`, `.claude/skills/`, `.windsurf/skills/` directories



### Thin Wrappers (1 week)

- `skil search [query]` → calls `skills.sh/api/search`
- `skil install <skill>` → calls `npx skills add` under hood
- `skil convert <skill> --to cursor|claude|windsurf` → calls `skillsmith`
- Convenience layer, not rebuilding existing tools



### Team Sync (1 week)

- `.skil.yml` config file format:
  ```yaml
  collections:
    frontend:
      - obra/react-patterns
      - addyosmani/performance-review
    backend:
      - addyosmani/api-design
      - vercel-labs/security-review
  ```
- `skil sync` — install collections from config file
- `skil export` — generate config from current local setup



### GUI Desktop App (3-4 weeks)

- Electron app with sidebar
- Visual list of installed skills with checkboxes
- Drag-drop to create collections
- Search and install from skills.sh in-app
- Button to run team sync
- Same engine as CLI, just visual interface

**Total Timeline: 7-9 weeks**

## Not Doing (and Why)

- **Installation infrastructure** — Vercel's `npx skills add` works perfectly. Don't rebuild it. We just wrap it with `skil install` for consistency.
- **Registry/hosting** — skills.sh already provides discovery, leaderboard, search API. We consume their API, don't compete.
- **Format conversion logic** — skillsmith already handles SKILL.md ↔ Cursor .mdc ↔ Windsurf conversion. We just provide a thin wrapper (`skil convert`) for convenience.
- **Token management** — IDEs already show context window usage. Token estimation is nice-to-have but not core value. Maybe add simple `skil status` output later, but no UI for it.
- **IDE extensions** — Building VSCode/Cursor/JetBrains extensions means rebuilding for each platform. CLI + desktop app gives universal compatibility without platform lock-in.
- **Phase detection** — Don't try to auto-detect what phase the user is in (design? testing? deployment?). Let users decide when to switch collections. Automation here would be brittle and annoying.
- **Skill authoring/editing** — Don't build a skill editor. Skills are markdown files—developers already have editors. Changing installed skills should be done at source (GitHub repos), not in our tool.
- **Custom skill hosting** — Don't become a skill marketplace. We point to skills.sh and GitHub. Distribution is solved.



## Open Questions

**Technical:**

- How do we handle IDE-specific skill loading (some IDEs watch directories, others need restart)?
- Should collections be mutually exclusive (only one active) or composable (stack multiple)?
- What happens when `skil sync` conflicts with manually installed skills?
- Do we support local-only collections vs. global collections, or just one namespace?

**Product:**

- Is `.skil.yml` enough for team sync, or do teams need more (version pinning, approval workflow)?
- Should GUI app be cross-platform from day 1, or start with macOS only?
- Do we need `skil update` to update skills, or just point to `npx skills update`?
- Is "collection" the right term, or is "profile", "context", "bundle" clearer?

**Business:**

- When do we introduce paid tier (month 3? month 6? wait for enterprise demand)?
- Is team sync a paid feature or free (affects adoption)?
- Do we build analytics (track which collections are most popular) to inform roadmap?
- Should we partner with Vercel or build independently?

**Go-to-Market:**

- Do we launch on Product Hunt / Hacker News, or quietly build user base first?
- Should we create sample collections (e.g., "frontend-starter", "api-design") to seed usage?
- Do we need docs site from day 1, or just good README?
- Is there a community (Discord, Slack) or just GitHub issues for support?



## Next Steps

1. **Build CLI MVP (Week 1-2):** Core commands (create, use, list, status). Test with 5 developers.
2. **Validate collections usage (Week 3):** Do people create collections or just load all skills? If <50% create collections, pivot.
3. **Add wrappers + sync (Week 4):** Thin wrappers and team config if collections are validated.
4. **Build GUI (Week 5-8):** If CLI validates, build Electron app. Start with macOS.
5. **Launch (Week 9):** Announce on HN, share in AI dev communities, get first 100 users.



## Success Metrics

**Month 1:**

- 100 developers install CLI
- 50 create at least one collection
- 5 teams use `.skil.yml` for sync

**Month 3:**

- 1,000 CLI installs
- 200 GUI downloads
- 20 teams with 5+ developers using team sync

**Month 6:**

- 5,000 users
- 100 active teams
- Clear signal on paid tier demand (enterprises asking for SSO, audit logs, approval workflows)

