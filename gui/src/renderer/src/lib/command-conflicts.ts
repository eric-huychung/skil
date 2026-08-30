import type { EngineErrorCode } from '../../../../../src/core/result.js';

/** True when a `setCommandEnabled(name, true)` was refused because a live path already holds a non-command skill. */
export function isCommandNameCollision(result: { code?: EngineErrorCode }): boolean {
  return result.code === 'COMMAND_NAME_COLLISION';
}

export function conflictLabels(result: { labels?: string[] }): string[] {
  return result.labels ?? [];
}
