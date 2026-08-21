---
name: deploy
description: Deploy to production environment
---

# Deploy Phase

Production deployment with validation and rollback readiness.

## Process

When invoked with `/deploy`:

1. **Read git-workflow skill** (`.cursor/skills/productivity/git-workflow/SKILL.md`)
   - Version bump matches the change (breaking → major, additive → minor, fix → patch)
   - Tag the release; changelog is curated for consumers, not a dumped commit log
   - Checkpoint: version, tag, and changelog agree

2. **Read git-guardrail skill** (`.cursor/skills/productivity/git-guardrail/SKILL.md`)
   - Do not run blocked git operations (push, force push, reset --hard, clean -f, branch -D)
   - Set up hooks if the user wants them; otherwise just follow the blocked list
   - Checkpoint: this deploy does not need a destructive git command

<!-- 3. **Run pre-deploy-checks skill** - validate readiness
   - Checkpoint: All checks passing? -->

<!-- 4. **Run deployment skill** - deploy to production
   - Checkpoint: Deployment successful? -->

<!-- 5. **Run smoke-tests skill** - validate production health
   - Checkpoint: Production stable? -->

## Output

Live production deployment with monitoring and rollback capability.
