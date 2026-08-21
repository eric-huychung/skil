import type { ICollectionEngine } from '../interfaces/engine.js';
import type { IFileSystemAdapter, IConfigAdapter, ISkillsAdapter } from '../interfaces/adapters.js';
import type { BrowseView, Collection, ExportResult, IDE, Skill, State, SyncResult } from '../types/index.js';
import { err, isOk, ok, type Result } from './result.js';

/** Path to the persisted engine state, relative to the project root. */
export const STATE_PATH = '.contextkit/state.json';

/** Current state schema version. See `State`'s doc comment for the v1 -> v2 migration note. */
const STATE_VERSION = '2.0';

function emptyState(): State {
  return { collections: [], installedSkills: [], version: STATE_VERSION };
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
    this.mergeExternallyInstalledSkills();
  }

  create(name: string, skillIds: string[], command?: string): Result<Collection> {
    if (this.state.collections.some((c) => c.name === name)) {
      return err(new Error(`Collection '${name}' already exists. Choose a different name or run 'contextkit list' to see existing collections.`));
    }

    const collection: Collection = {
      name,
      skills: skillIds,
      createdAt: new Date().toISOString(),
      ...(command !== undefined ? { command } : {}),
    };
    this.state.collections.push(collection);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.collections.pop();
      return err(new Error(`Failed to save collection '${name}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  addSkill(name: string, skillId: string): Result<Collection> {
    const collection = this.state.collections.find((c) => c.name === name);
    if (!collection) {
      return err(new Error(`Collection '${name}' not found. Run 'contextkit list' to see available collections.`));
    }
    if (collection.skills.includes(skillId)) {
      return ok(collection);
    }

    collection.skills.push(skillId);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      collection.skills.pop();
      return err(new Error(`Failed to save collection '${name}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  removeSkill(name: string, skillId: string): Result<Collection> {
    const collection = this.state.collections.find((c) => c.name === name);
    if (!collection) {
      return err(new Error(`Collection '${name}' not found. Run 'contextkit list' to see available collections.`));
    }

    const index = collection.skills.indexOf(skillId);
    if (index === -1) {
      return ok(collection);
    }

    collection.skills.splice(index, 1);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      collection.skills.splice(index, 0, skillId);
      return err(new Error(`Failed to save collection '${name}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  getCommand(name: string): Result<string> {
    const collection = this.state.collections.find((c) => c.name === name);
    if (!collection) {
      return err(new Error(`Collection '${name}' not found. Run 'contextkit list' to see available collections.`));
    }
    if (!collection.command) {
      return err(new Error(`Collection '${name}' has no command defined. Create it with 'contextkit create ${name} --command "<cmd>"'.`));
    }
    return ok(collection.command);
  }

  list(): Collection[] {
    return [...this.state.collections];
  }

  sync(configPath: string): Result<SyncResult> {
    const configResult = this.config.read(configPath);
    if (!isOk(configResult)) {
      return err(configResult.error);
    }

    const validation = this.config.validate(configResult.value);
    if (!isOk(validation)) {
      return err(validation.error);
    }

    const configNames = new Set(Object.keys(configResult.value.collections));
    const warnings = this.state.collections
      .filter((c) => !configNames.has(c.name))
      .map((c) => `Local collection '${c.name}' is not in the config file. Add it to '${configPath}' or remove it locally.`);

    const snapshot = this.state.collections.map((c) => ({ ...c }));
    const synced: string[] = [];
    for (const [name, skillIds] of Object.entries(configResult.value.collections)) {
      const existing = this.state.collections.find((c) => c.name === name);
      if (existing) {
        existing.skills = skillIds;
      } else {
        this.state.collections.push({
          name,
          skills: skillIds,
          createdAt: new Date().toISOString(),
        });
      }
      synced.push(name);
    }

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.collections = snapshot;
      return err(new Error(`Failed to save synced collections: ${persistResult.error.message}`));
    }

    return ok({ synced, warnings });
  }

  async install(skillId: string): Promise<Result<Skill>> {
    const result = await this.skills.install(skillId);
    if (!isOk(result)) {
      return err(result.error);
    }

    const skill: Skill = { id: skillId, source: 'skills.sh', installedAt: new Date().toISOString() };
    const existingIndex = this.state.installedSkills.findIndex((s) => s.id === skillId);
    const previous = existingIndex >= 0 ? this.state.installedSkills[existingIndex] : undefined;
    if (existingIndex >= 0) {
      this.state.installedSkills[existingIndex] = skill;
    } else {
      this.state.installedSkills.push(skill);
    }

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      if (previous) {
        this.state.installedSkills[existingIndex] = previous;
      } else {
        this.state.installedSkills.pop();
      }
      return err(new Error(`Failed to save installed skill '${skillId}': ${persistResult.error.message}`));
    }

    return ok(skill);
  }

  search(query: string): Promise<Result<Skill[]>> {
    return this.skills.search(query);
  }

  browse(view: BrowseView): Promise<Result<Skill[]>> {
    return this.skills.browse(view);
  }

  convert(skillId: string, targetIDE: IDE): Promise<Result<void>> {
    return this.skills.convert(skillId, targetIDE);
  }

  async export(collectionNames: string[], targetIDE: IDE): Promise<Result<ExportResult>> {
    const succeeded: string[] = [];
    const failures: string[] = [];

    for (const name of collectionNames) {
      const collection = this.state.collections.find((c) => c.name === name);
      if (!collection) {
        failures.push(`Collection '${name}' not found. Run 'contextkit list' to see available collections.`);
        continue;
      }

      for (const skillId of collection.skills) {
        const result = await this.skills.convert(skillId, targetIDE);
        if (isOk(result)) {
          succeeded.push(`${name}:${skillId}`);
        } else {
          failures.push(`'${name}:${skillId}': ${result.error.message}`);
        }
      }
    }

    return ok({ succeeded, failures });
  }

  /** Writes state to disk. Returns an error Result if the write fails; callers must check it rather than assume the mutation was saved. */
  private persist(): Result<void> {
    return this.fs.writeJSON(STATE_PATH, this.state);
  }

  /**
   * Picks up skills already installed by external tooling (e.g. a bare
   * `npx skills add` run outside ContextKit) so state stays in sync.
   * In-memory only: persisted on the next mutation, not on construction.
   */
  private mergeExternallyInstalledSkills(): void {
    const known = new Set(this.state.installedSkills.map((s) => s.id));
    for (const skill of this.skills.getInstalled()) {
      if (!known.has(skill.id)) {
        this.state.installedSkills.push(skill);
        known.add(skill.id);
      }
    }
  }
}
