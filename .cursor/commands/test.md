---
name: /test
skills:
  - testing/debug
  - productivity/git-workflow
  - productivity/git-guardrail
  - philosophy/tdd
  - testing/refactor
  - improve-codebase-architecture
  - vercel-labs/skills/find-skills
  - mattpocock/skills/grill-me
generated_by: skil
generated_at: 2026-08-27T22:04:04.697Z
---

## Goal
Prove behavior through public seams. Fix what's broken. Deepen only what they pick.

## Sequence
1. Agree the seam. Test behavior through the public interface, not internals.
2. Broken? Build a tight pass/fail loop first. Then fix. Leave a regression test.
3. Code hurts? Scan for shallow modules. Propose. Only change what they pick.
4. Commit one logical thing.

## Rules
- Tests at seams, not internals. Red before green.
- No hypothesis without a red loop.
- Don't mix refactor with a feature or a fix.
- Don't run destructive git (force-push, reset --hard, clean -f).

## Skills
When they apply, read and follow:
- `testing/debug`
- `productivity/git-workflow`
- `productivity/git-guardrail`
- `philosophy/tdd`
- `testing/refactor`
- `improve-codebase-architecture`
- `vercel-labs/skills/find-skills`
- `mattpocock/skills/grill-me`
