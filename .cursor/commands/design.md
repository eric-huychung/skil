---
name: design
description: Map PRD to system design, architecture, and implementation tasks
---

# Design Phase

Converts requirements into technical architecture, diagrams, and implementation tasks - designed with TDD principles baked in.

## Process

When invoked with `/design`:

1. **Read codebase-design skill** (`skills/design/codebase-design/SKILL.md`)
   - Apply deep module principles: interface depth, seams, adapters
   - Design for leverage (callers) and locality (maintainers)
   - Checkpoint: Confirm module boundaries and seam placement

2. **Read tdd skill** (`skills/philosophy/tdd/SKILL.md`)
   - Identify seams for testing
   - Design interfaces that enable test-driven development
   - Ensure architecture supports red-green-refactor workflow
   - Checkpoint: Confirm testability of proposed architecture

3. **Read diagram-maker skill** (`skills/productivity/diagram-maker/SKILL.md`)
   - Generate architecture diagrams (SVG or Excalidraw)
   - Visualize modules, seams, and data flow
   - Checkpoint: Review visual architecture

4. **Generate architecture document** → `docs/design/architecture.md`
   - Synthesize insights from codebase-design, TDD, and diagrams
   - Document module boundaries, interfaces, and seam locations
   - Include testability strategy and key testing seams
   - Explain design decisions using deep module vocabulary
   - Checkpoint: Review architecture doc

5. **Read to-tasks skill** (`skills/design/to-tasks/SKILL.md`)
   - Break architecture into ordered, implementable tasks
   - Ensure each task includes test-first acceptance criteria
   - Output to `tasks/plan.md` and `tasks/todo.md`
   - Checkpoint: Review task breakdown

## Output

- `docs/design/architecture.md` - system design with TDD principles
- Architecture diagrams (SVG/Excalidraw)
- `tasks/plan.md` - implementation plan
- `tasks/todo.md` - ordered task list with test-first criteria

## Principles

All architecture and tasks reflect:
- Deep module design (small interfaces, rich implementations)
- Test-driven development (design for testability at seams)
- Vertical slicing (deliver working features incrementally)
