---
name: /deploy
skills:
  - productivity/git-guardrail
  - productivity/git-workflow
generated_by: skil
generated_at: 2026-08-27T03:49:43.705Z
---

## Goal
Cut a shippable release. Keep main deployable.

## Sequence
1. Confirm tests and build are green. No secrets in the diff.
2. Version: breaking → major, additive → minor, fix → patch.
3. Write a human changelog (Added / Fixed / …). Tag the release.
4. Stop. Don't push unless they say so.

## Rules
- Never force-push, reset --hard, or git clean.
- Changelog is for consumers, not a git log dump.
- Don't mix formatting with the release.

## Skills
When they apply, read and follow:
- `productivity/git-guardrail`
- `productivity/git-workflow`
