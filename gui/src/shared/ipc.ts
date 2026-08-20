import type { Result } from '../../../src/core/result.js';
import type { ActivateResult, Collection, Skill, Status } from '../../../src/types/index.js';

export type { ActivateResult, Collection, Result, Skill, Status };

/**
 * IPC channel names shared between the main process (handler registration)
 * and the preload script (invoke calls). Renderer code never sees channel
 * names directly — it only sees the typed `window.contextkit` bridge.
 */
export const IPC_CHANNELS = {
  listCollections: 'contextkit:list-collections',
  getStatus: 'contextkit:get-status',
  activateCollection: 'contextkit:activate-collection',
  deactivateCollection: 'contextkit:deactivate-collection',
  createCollection: 'contextkit:create-collection',
  searchSkills: 'contextkit:search-skills',
  installSkill: 'contextkit:install-skill',
} as const;

/**
 * Shape of the bridge exposed to the renderer via `contextBridge`. Mirrors
 * `ICollectionEngine` 1:1 — each method forwards to the matching engine
 * method over IPC and returns the same `Result<T>` the engine returns, so
 * components handle bridge errors with the same `isOk`/`isErr` vocabulary
 * used everywhere else in the codebase.
 */
export interface ContextKitBridge {
  listCollections(): Promise<Collection[]>;
  getStatus(): Promise<Status>;
  activateCollection(name: string): Promise<Result<ActivateResult>>;
  deactivateCollection(): Promise<Result<void>>;
  createCollection(name: string, skillIds: string[]): Promise<Result<Collection>>;
  searchSkills(query: string): Promise<Result<Skill[]>>;
  installSkill(skillId: string): Promise<Result<Skill>>;
}
