import type { EngineErrorCode } from '../../../../../src/core/result.js';

export function isUnstampedConflict(result: { code?: EngineErrorCode }): boolean {
  return result.code === 'UNSTAMPED_COMMAND';
}

export function isImportConflict(result: { code?: EngineErrorCode }): boolean {
  return result.code === 'IMPORT_CONFLICT';
}

export function isRuleExportConflict(result: { code?: EngineErrorCode }): boolean {
  return result.code === 'RULE_EXPORT_CONFLICT';
}

export function conflictLabels(result: { labels?: string[] }): string[] {
  return result.labels ?? [];
}

export function matchingCommandNames(
  source: Array<{ name: string }>,
  dest: Array<{ name: string }>
): string[] {
  const destNames = new Set(dest.map((command) => command.name));
  return source.map((command) => command.name).filter((name) => destNames.has(name));
}
