import { Option } from 'commander';
import type { IDE } from '../types/index.js';

export const TARGET_IDES = ['cursor', 'claude', 'codex', 'copilot', 'agents', 'windsurf'] as const satisfies readonly IDE[];

export function toOption(
  flags = '--to <dock>',
  description = 'Dock: cursor, claude, codex, copilot, agents, or windsurf (default cursor)'
): Option {
  return new Option(flags, description).choices(TARGET_IDES).default('cursor' satisfies IDE);
}
