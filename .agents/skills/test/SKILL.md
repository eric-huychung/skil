---
name: /test
skills: []
disable-model-invocation: true
generated_by: skil
generated_at: 2026-09-24T22:17:07.522Z
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
When they apply, read and follow. None filed yet.
