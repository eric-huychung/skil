import { Option } from 'commander';
import type { IDE } from '../types/index.js';

export const TARGET_IDES = ['cursor', 'claude', 'windsurf', 'agents'] as const satisfies readonly IDE[];

export function ideOption(
  flags = '--ide <ide>',
  description = 'IDE: cursor, claude, windsurf, or agents (default cursor)'
): Option {
  return new Option(flags, description).choices(TARGET_IDES).default('cursor' satisfies IDE);
}
