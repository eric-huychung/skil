import type { Result } from '../core/result.js';
import type { Collection, Status } from '../types/index.js';

/**
 * CollectionEngine is ContextKit's deep module: a small interface backed by
 * all business logic (state management, validation, activation, multi-IDE
 * symlink coordination). CLI and GUI layers only ever call these 5 methods.
 */
export interface ICollectionEngine {
  /**
   * Creates a new collection with the given skill IDs.
   * Returns an error Result if a collection with `name` already exists.
   */
  create(name: string, skillIds: string[]): Result<Collection>;

  /**
   * Activates the named collection: deactivates any currently active
   * collection, then creates symlinks for this collection's skills in every
   * detected IDE directory.
   * Returns an error Result if the collection doesn't exist.
   */
  activate(name: string): Result<void>;

  /**
   * Deactivates the currently active collection, removing its symlinks.
   * Idempotent: succeeds even if no collection is currently active.
   */
  deactivate(): Result<void>;

  /** Returns all known collections. */
  list(): Collection[];

  /** Returns the current activation status. */
  status(): Status;
}
