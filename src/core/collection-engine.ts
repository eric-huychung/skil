import type { ICollectionEngine } from '../interfaces/engine.js';
import type { IFileSystemAdapter, IConfigAdapter, ISkillsAdapter } from '../interfaces/adapters.js';
import type { Collection, IDEInfo, State, Status } from '../types/index.js';
import { err, isOk, ok, type Result } from './result.js';

/** Path to the persisted engine state, relative to the project root. */
export const STATE_PATH = '.contextkit/state.json';

/** Directory where ContextKit stores each skill's original files, relative to the project root. */
export const SKILLS_DIR = '.contextkit/skills';

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
    private readonly skills: ISkillsAdapter,
    private readonly projectRoot: string = process.cwd()
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
    this.persist();

    return ok(collection);
  }

  list(): Collection[] {
    return [...this.state.collections];
  }

  activate(name: string): Result<void> {
    const collection = this.state.collections.find((c) => c.name === name);
    if (!collection) {
      return err(new Error(`Collection '${name}' does not exist`));
    }

    const ides = this.fs.detectIDEs(this.projectRoot);

    const previouslyActive = this.state.collections.find((c) => c.name === this.state.activeCollection);
    if (previouslyActive) {
      this.removeSymlinksFor(previouslyActive, ides);
    }

    this.createSymlinksFor(collection, ides);

    this.state.activeCollection = name;
    this.persist();

    return ok(undefined);
  }

  deactivate(): Result<void> {
    this.state.activeCollection = null;
    this.persist();

    return ok(undefined);
  }

  status(): Status {
    return { activeCollection: this.state.activeCollection, skills: [] };
  }

  private persist(): void {
    this.fs.writeJSON(STATE_PATH, this.state);
  }

  private createSymlinksFor(collection: Collection, ides: IDEInfo[]): void {
    for (const ide of ides) {
      for (const skillId of collection.skills) {
        this.fs.createSymlink(`${SKILLS_DIR}/${skillId}`, `${ide.path}/${skillId}`);
      }
    }
  }

  private removeSymlinksFor(collection: Collection, ides: IDEInfo[]): void {
    for (const ide of ides) {
      for (const skillId of collection.skills) {
        this.fs.removeSymlink(`${ide.path}/${skillId}`);
      }
    }
  }
}
