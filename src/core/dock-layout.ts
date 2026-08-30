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

/**
 * The two live trees, as a constant pair — not a per-user picker. A
 * skill/command/rule is "on" when it lives in both. See
 * `docs/design/architecture.md` "Live trees: on/off is a path, not a
 * dock picker".
 */
export const LIVE_IDES = ['agents', 'claude'] as const satisfies readonly IDE[];

export const LIVE_SKILL_ROOTS: readonly string[] = LIVE_IDES.map((ide) => SKILL_ROOT_BY_IDE[ide]);

/** Off-but-yours. Toggling back on restores from here (or re-fetches a market skill). */
export const PARKED_ROOT = '.skil/parked';
export const PARKED_SKILLS_ROOT = `${PARKED_ROOT}/skills`;
export const PARKED_COMMANDS_ROOT = `${PARKED_ROOT}/commands`;
export const PARKED_RULES_ROOT = `${PARKED_ROOT}/rules`;

/** A leftover tree we already retired via the adopt-and-deprecate cleanup. Never scanned. */
export const DEPRECATED_ROOT = '.skil/deprecated';

function underPrefix(prefix: string, id: string): string {
  return `${prefix}/${id}`;
}

/** The two paths a live skill/command occupies, in `LIVE_IDES` order. */
export function liveSkillPaths(id: string): string[] {
  return LIVE_SKILL_ROOTS.map((root) => underPrefix(root, id));
}

export function parkedSkillPath(id: string): string {
  return underPrefix(PARKED_SKILLS_ROOT, id);
}

export function parkedCommandPath(name: string): string {
  return underPrefix(PARKED_COMMANDS_ROOT, name);
}

export function parkedRulePath(id: string): string {
  return underPrefix(PARKED_RULES_ROOT, id);
}

/** Keeps the original relative path — recoverable, just a moved folder. */
export function deprecatedPathFor(originalPath: string): string {
  return underPrefix(DEPRECATED_ROOT, normalizeDockPath(originalPath));
}

function normalizeDockPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isUnderRoot(path: string, root: string): boolean {
  const normalized = normalizeDockPath(path);
  return normalized === root || normalized.startsWith(`${root}/`);
}

/** True only for `.agents/skills/…` or `.claude/skills/…` — never a leftover or parked path. */
export function isLiveSkillPath(path: string): boolean {
  return LIVE_SKILL_ROOTS.some((root) => isUnderRoot(path, root));
}

export function isParkedPath(path: string): boolean {
  return isUnderRoot(path, PARKED_ROOT);
}

export function isDeprecatedPath(path: string): boolean {
  return isUnderRoot(path, DEPRECATED_ROOT);
}

/**
 * On/off/leftover for one catalog id, computed from its `paths` — never
 * a stored flag. "on" needs every live root present (a partial live
 * copy is a disagreement to surface, not a clean on).
 */
export function skillPathState(paths: string[]): 'on' | 'off' | 'leftover' | 'none' {
  if (paths.length === 0) {
    return 'none';
  }
  const isOn = LIVE_SKILL_ROOTS.every((root) => paths.some((path) => isUnderRoot(path, root)));
  if (isOn) {
    return 'on';
  }
  if (paths.some(isParkedPath)) {
    return 'off';
  }
  return 'leftover';
}

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

/**
 * Scan roots for skills = every leftover root (which already includes
 * the live pair, `.agents/skills` + `.claude/skills`) plus the parked
 * skill root. `.skil/deprecated/` is never scanned.
 */
export const SCAN_SKILL_ROOTS: readonly string[] = [...SKILL_ROOTS, PARKED_SKILLS_ROOT];

/** Skill + command dirs the watcher must cover. Pass rule dirs from `project-rules`. */
export function watchRoots(ruleDirs: readonly string[] = []): string[] {
  return [...SCAN_SKILL_ROOTS, ...Object.values(COMMAND_DIR_BY_IDE), ...ruleDirs];
}
