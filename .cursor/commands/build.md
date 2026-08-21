---
name: build
description: Implement features following design specs using TDD, incremental delivery, and deep module design
---

# Build Phase

Implement features test-first, in small increments, following deep module principles.

## Philosophy

Build follows **test-driven development** (TDD): red → green → refactor loop.

See `.cursor/skills/philosophy/tdd/SKILL.md` for the full discipline.

## Process

When invoked with `/build`, apply these disciplines:

### 1. Test-Driven Development (Always)

Follow the red-green loop from `.cursor/skills/philosophy/tdd/`:

- Write failing test first (red)
- Implement minimal code to pass (green)
- Tests verify behavior through public interfaces
- Before writing tests, agree on which seams to test

**Reference**: `.cursor/skills/philosophy/tdd/SKILL.md`

### 2. Incremental Implementation (Always)

Deliver in thin vertical slices from `.cursor/skills/build/increment/`:

- Implement → Test → Verify → Commit
- Each increment leaves system in working state
- Vertical slices (end-to-end functionality) preferred
- Keep it compilable, one thing at a time

**Reference**: `.cursor/skills/build/increment/SKILL.md`

### 3. Codebase Design (Reference as needed)

Design deep modules following `.cursor/skills/design/codebase-design/`:

- Small interface + lots of implementation
- Seams at clean boundaries
- Testable through interface
- Leverage for callers, locality for maintainers

**Reference**: `.cursor/skills/design/codebase-design/SKILL.md`

### 4. Debug (Optional - use when diagnosing issues)

When something is broken/failing/slow, use `.cursor/skills/testing/debug/`:

- Build tight feedback loop
- Reproduce + minimize
- Generate ranked hypotheses
- Instrument and fix
- Add regression test

**Reference**: `.cursor/skills/testing/debug/SKILL.md`

### 5. UI/UX Design (Optional - use when designing or implementing interfaces)

When the task involves designing, building, reviewing, or fixing any UI (pages, components, layout, styling, accessibility), start from `.cursor/skills/build/ui/ui-ux-pro-max/`:

- Generate a design system before new pages (`--design-system`)
- Targeted domain searches for style, color, typography, charts, UX, icons
- Stack-specific implementation guidance (React, Next.js, shadcn, etc.)

**Reference**: `.cursor/skills/build/ui/ui-ux-pro-max/SKILL.md`

Pair with, as needed:
- `.cursor/skills/build/ui/ui-styling/SKILL.md` - shadcn/Tailwind component implementation
- `.cursor/skills/build/ui/design-system/SKILL.md` - design token architecture (primitive → semantic → component)

### 6. Git Workflow (Always)

Follow commit and branching discipline from `.cursor/skills/productivity/git-workflow/`:

- Commit each successful increment (save point)
- Atomic commits, descriptive messages, separate concerns
- Short-lived branches; `main` stays deployable

**Reference**: `.cursor/skills/productivity/git-workflow/SKILL.md`

### 7. Git Guardrail (Optional - use when blocking dangerous git ops)

When the user wants to prevent destructive git commands (push, reset --hard, clean, branch -D), use `.cursor/skills/productivity/git-guardrail/`.

**Reference**: `.cursor/skills/productivity/git-guardrail/SKILL.md`

## Execution Pattern

For each task:

1. **Identify seams** - which interfaces will we test?
2. **Write failing test** (red)
3. **Implement minimal code** (green)
4. **Verify** - test passes, build succeeds
5. **Commit** - save the increment
6. **Repeat** - next slice

When designing interfaces, reference codebase-design for depth, seams, and leverage.

When bugs appear, switch to debug skill for systematic diagnosis.

## Output

Working code with tests, following design specifications. Each increment is:

- Tested through agreed seams
- Committed atomically
- Buildable and runnable
- One step toward complete feature

## Skills Quick Reference

- **TDD**: `.cursor/skills/philosophy/tdd/SKILL.md`
- **Increment**: `.cursor/skills/build/increment/SKILL.md`
- **Codebase Design**: `.cursor/skills/design/codebase-design/SKILL.md`
- **Debug**: `.cursor/skills/testing/debug/SKILL.md`
- **UI/UX**: `.cursor/skills/build/ui/ui-ux-pro-max/SKILL.md`
- **Git Workflow**: `.cursor/skills/productivity/git-workflow/SKILL.md`
- **Git Guardrail**: `.cursor/skills/productivity/git-guardrail/SKILL.md`
