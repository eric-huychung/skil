import type { ICollectionEngine } from '../interfaces/engine.js';
import type { IFileSystemAdapter, IConfigAdapter, ISkillsAdapter } from '../interfaces/adapters.js';
import type { Collection, State, Status } from '../types/index.js';
import { err, isOk, ok, type Result } from './result.js';

/** Path to the persisted engine state, relative to the project root. */
export const STATE_PATH = '.contextkit/state.json';

function emptyState(): State {
  return { collections: [], activeCollection: null, installedSkills: [], version: '1.0' };
}

/**
 * CollectionEngine is ContextKit's deep module: see ICollectionEngine for the
 * public contract. This class owns state management, validation, and
 * coordination with the injected adapters.
 */
export class CollectionEngine implements ICollectionEngine {
  private state: State;

  constructor(
    private readonly fs: IFileSystemAdapter,
    private readonly config: IConfigAdapter,
    private readonly skills: ISkillsAdapter
  ) {
    const loaded = this.fs.readJSON<State>(STATE_PATH);
    this.state = isOk(loaded) ? loaded.value : emptyState();
  }

  create(name: string, skillIds: string[]): Result<Collection> {
    if (this.state.collections.some((c) => c.name === name)) {
      return err(new Error(`Collection '${name}' already exists`));
    }

    const collection: Collection = {
      name,
      skills: skillIds,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    this.state.collections.push(collection);

    return ok(collection);
  }

  list(): Collection[] {
    return [...this.state.collections];
  }

  activate(_name: string): Result<void> {
    return err(new Error('Not implemented yet'));
  }

  deactivate(): Result<void> {
    return err(new Error('Not implemented yet'));
  }

  status(): Status {
    return { activeCollection: this.state.activeCollection, skills: [] };
  }
}
