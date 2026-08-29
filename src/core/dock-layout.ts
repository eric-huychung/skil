import type { IDE } from '../types/index.js';

/** Skill trees we pull from. We never walk `commands/`. */
export const SKILL_ROOTS = [
  '.cursor/skills',
  '.claude/skills',
  '.codex/skills',
  '.github/skills',
  '.agents/skills',
  '.windsurf/skills',
] as const;

export const SKILL_ROOT_BY_IDE: Record<IDE, string> = {
  cursor: '.cursor/skills',
  claude: '.claude/skills',
  codex: '.codex/skills',
  copilot: '.github/skills',
  agents: '.agents/skills',
  windsurf: '.windsurf/skills',
};

/**
 * Project dirs used by `npx skills add --agent`. Cursor, Codex, and Copilot
 * write `.agents/skills`, not their dock folders. Folder name is the last id
 * segment.
 */
export const NPX_PROJECT_SKILL_ROOT: Record<IDE, string> = {
  cursor: '.agents/skills',
  claude: '.claude/skills',
  codex: '.agents/skills',
  copilot: '.agents/skills',
  agents: '.agents/skills',
  windsurf: '.windsurf/skills',
};

/**
 * Where we write our command file. Codex has no project-file mechanism for
 * commands. Copilot writes a VS Code prompt file.
 */
export const COMMAND_DIR_BY_IDE: Partial<Record<IDE, string>> = {
  cursor: '.cursor/commands',
  claude: '.claude/commands',
  agents: '.agents/commands',
  windsurf: '.windsurf/workflows',
  copilot: '.github/prompts',
};

/** VS Code only recognizes `.prompt.md` for Copilot; every other dock uses `.md`. */
export const COMMAND_EXTENSION_BY_IDE: Partial<Record<IDE, string>> = {
  copilot: '.prompt.md',
};

export const SKILL_SOURCES = ['.cursor', '.claude', '.codex', '.github', '.agents', '.windsurf'] as const;

export type SkillSourceFolder = (typeof SKILL_SOURCES)[number];

/** Top-level dock folder used for Sync counts (`.cursor` from `.cursor/skills`). */
export const SKILL_SOURCE_BY_IDE: Record<IDE, SkillSourceFolder> = {
  cursor: '.cursor',
  claude: '.claude',
  codex: '.codex',
  copilot: '.github',
  windsurf: '.windsurf',
  agents: '.agents',
};

/** Skill + command dirs the watcher must cover. Pass rule dirs from `project-rules`. */
export function watchRoots(ruleDirs: readonly string[] = []): string[] {
  return [...SKILL_ROOTS, ...Object.values(COMMAND_DIR_BY_IDE), ...ruleDirs];
}
