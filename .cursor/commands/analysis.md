---
name: analysis
description: Generate PRD and functional requirements
---

# Analysis Phase

Transforms refined ideas into detailed product requirements.

## Process

When invoked with `/analysis`:

1. **Run to-prd skill** - generate PRD from conversation
   - Located at: `.cursor/skills/analysis/to-prd/SKILL.md`
   - Synthesizes conversation into structured PRD
   - Saves to `docs/requirements/<feature-name>.md`
   - Checkpoint: Review PRD document

<!-- 2. **Run red-team-prd skill** - stress-test assumptions
   - Checkpoint: Review critiques and revisions -->

<!-- 3. **Run user-stories skill** - break down into stories
   - Checkpoint: Review user stories -->

## Output

Produces PRD document at `docs/requirements/` with problem statement, solution, user stories, implementation decisions, and testing approach.
