import type { ICollectionEngine } from '../interfaces/engine.js';
import type { IFileSystemAdapter, IConfigAdapter, ISkillsAdapter } from '../interfaces/adapters.js';
import type { ActivateResult, Collection, IDEInfo, Skill, State, Status, SyncResult } from '../types/index.js';
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
    this.mergeExternallyInstalledSkills();
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

  activate(name: string): Result<ActivateResult> {
    const collection = this.state.collections.find((c) => c.name === name);
    if (!collection) {
      return err(new Error(`Collection '${name}' does not exist`));
    }

    const ides = this.fs.detectIDEs(this.projectRoot);
    const { availableSkills, warnings } = this.partitionBySourceAvailability(collection);

    const previouslyActive = this.state.collections.find((c) => c.name === this.state.activeCollection);
    if (previouslyActive) {
      this.removeSymlinksFor(previouslyActive, ides);
    }

    const symlinkResult = this.createSymlinksFor(name, availableSkills, ides);
    if (!isOk(symlinkResult)) {
      if (previouslyActive) {
        this.createSymlinksFor(previouslyActive.name, previouslyActive.skills, ides);
      }
      return err(symlinkResult.error);
    }

    this.state.activeCollection = name;
    this.persist();

    return ok({ warnings });
  }

  deactivate(): Result<void> {
    const active = this.state.collections.find((c) => c.name === this.state.activeCollection);
    if (active) {
      const ides = this.fs.detectIDEs(this.projectRoot);
      this.removeSymlinksFor(active, ides);
    }

    this.state.activeCollection = null;
    this.persist();

    return ok(undefined);
  }

  status(): Status {
    return { activeCollection: this.state.activeCollection, skills: [] };
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
          lastUsedAt: null,
        });
      }
      synced.push(name);
    }
    this.persist();

    return ok({ synced, warnings });
  }

  async install(skillId: string): Promise<Result<Skill>> {
    const result = await this.skills.install(skillId);
    if (!isOk(result)) {
      return err(result.error);
    }

    const skill: Skill = { id: skillId, source: 'skills.sh', installedAt: new Date().toISOString() };
    const existingIndex = this.state.installedSkills.findIndex((s) => s.id === skillId);
    if (existingIndex >= 0) {
      this.state.installedSkills[existingIndex] = skill;
    } else {
      this.state.installedSkills.push(skill);
    }
    this.persist();

    return ok(skill);
  }

  search(query: string): Promise<Result<Skill[]>> {
    return this.skills.search(query);
  }

  private persist(): void {
    this.fs.writeJSON(STATE_PATH, this.state);
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

  /**
   * Splits a collection's skills into those whose source directory exists
   * (safe to symlink) and those that don't (skipped, with a warning).
   */
  private partitionBySourceAvailability(collection: Collection): { availableSkills: string[]; warnings: string[] } {
    const availableSkills: string[] = [];
    const warnings: string[] = [];
    for (const skillId of collection.skills) {
      if (this.fs.exists(`${SKILLS_DIR}/${skillId}`)) {
        availableSkills.push(skillId);
      } else {
        warnings.push(`Skill '${skillId}' not found in '${SKILLS_DIR}/${skillId}'. Run 'contextkit install ${skillId}' or remove it from the collection.`);
      }
    }
    return { availableSkills, warnings };
  }

  /**
   * Creates a symlink for every (ide, skill) pair. If any creation fails
   * partway through, removes every symlink it created in this call before
   * returning the error, so a failed activation never leaves the new
   * collection half-linked.
   */
  private createSymlinksFor(collectionName: string, skillIds: string[], ides: IDEInfo[]): Result<void> {
    const created: string[] = [];
    for (const ide of ides) {
      for (const skillId of skillIds) {
        const target = `${ide.path}/${skillId}`;
        const result = this.fs.createSymlink(`${SKILLS_DIR}/${skillId}`, target);
        if (!isOk(result)) {
          for (const rollbackTarget of created) {
            this.fs.removeSymlink(rollbackTarget);
          }
          return err(new Error(`Failed to activate '${collectionName}': ${result.error.message}. Remove the conflicting file and try again.`));
        }
        created.push(target);
      }
    }
    return ok(undefined);
  }

  private removeSymlinksFor(collection: Collection, ides: IDEInfo[]): void {
    for (const ide of ides) {
      for (const skillId of collection.skills) {
        this.fs.removeSymlink(`${ide.path}/${skillId}`);
      }
    }
  }
}
