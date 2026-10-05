# UI Skills

Design skills from `uipro` (`uipro init --ai cursor`) plus the official shadcn/ui package (`npx skills add shadcn/ui`). Not written for this project — see each `SKILL.md` for upstream details.

## Available Skills

### ui-ux-pro-max
UI/UX design intelligence for web, mobile, and desktop: components, design systems, accessibility, responsive layout, typography, color, charts, and stack-specific implementation guidance. Relevant to skil's Phase 9 GUI (Task 44).

### shadcn
Official shadcn/ui agent skill (`npx skills add shadcn/ui`). Project-aware CLI: add/search/docs/presets via `npx shadcn@latest`. Prefer this over guessing component APIs.

### ui-styling
Accessible UI implementation with shadcn/ui (Radix + Tailwind) and Tailwind CSS, plus canvas-based visual mockups. Relevant to skil's Phase 9 GUI (Task 44).

### migrate-radix-to-base
Comes with the same `shadcn/ui` package. Migrates Radix primitives to Base UI. Optional — currently in Inbox, not filed onto `/build`.

### design-system
Design token architecture (primitive → semantic → component), CSS variables, spacing/typography scales, component specs.

### banner-design
Marketing banners and hero images for social platforms and print, with AI-generated visual direction options. Not currently relevant to skil.

### brand
Brand voice, visual identity, messaging frameworks, style-guide consistency. Not currently relevant to skil.

### slides
HTML presentation decks with data visualization, copywriting formulas, pitch-deck structure. Not currently relevant to skil.

## Re-installing / Updating

```bash
# uipro skills (ui-ux-pro-max, ui-styling, design-system, …)
npm install -g ui-ux-pro-max-cli
uipro init --ai cursor

# official shadcn/ui skills (then move into this folder)
npx skills add shadcn/ui --agent cursor -y --copy
```

Restart Cursor afterward so it rescans the skills directory.
