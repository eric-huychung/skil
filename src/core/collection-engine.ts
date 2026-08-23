import { createHash } from 'node:crypto';
import type { ICollectionEngine } from '../interfaces/engine.js';
import type { IFileSystemAdapter, IConfigAdapter, ISkillsAdapter } from '../interfaces/adapters.js';
import type {
  BrowseView,
  Collection,
  Command,
  ExportResult,
  IDE,
  ScanResult,
  Skill,
  SkillRecord,
  State,
  SyncResult,
} from '../types/index.js';
import { err, isOk, ok, type Result } from './result.js';

/** Path to the persisted engine state, relative to the project root. */
export const STATE_PATH = '.contextkit/state.json';

/** Current state schema version. See `State`'s doc comment for the v3 → v4 notes. */
const STATE_VERSION = '4.0';

/** Command name reserved for the Inbox holding list on `State`. */
const INBOX_NAME = 'inbox';

/** Store `/build` as `build`. UI may still display the slash. */
function normalizeCommandName(name: string): string {
  return name.startsWith('/') ? name.slice(1) : name;
}

function commandNotFound(name: string): Error {
  return new Error(`Command '${name}' not found. Run 'contextkit list' to see available commands.`);
}

/** Skill trees we pull from. We never walk `commands/`. */
const SKILL_ROOTS = ['.cursor/skills', '.claude/skills', '.windsurf/skills', '.agents/skills'] as const;

const SKILL_ROOT_BY_IDE: Record<IDE, string> = {
  cursor: '.cursor/skills',
  claude: '.claude/skills',
  windsurf: '.windsurf/skills',
  agents: '.agents/skills',
};

/** On-disk shape that may still use v3 `collections`. */
interface PersistedState {
  version?: string;
  commands?: Command[];
  collections?: Command[];
  skills?: SkillRecord[];
  inbox?: string[];
  installedSkills?: Skill[];
}

function emptyState(): State {
  return { commands: [], skills: [], installedSkills: [], inbox: [], version: STATE_VERSION };
}

function normalizeState(raw: PersistedState): State {
  return {
    commands: raw.commands ?? raw.collections ?? [],
    skills: raw.skills ?? [],
    installedSkills: raw.installedSkills ?? [],
    inbox: raw.inbox ?? [],
    version: raw.version ?? STATE_VERSION,
  };
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
    private readonly skillsAdapter: ISkillsAdapter
  ) {
    const loaded = this.fs.readJSON<PersistedState>(STATE_PATH);
    this.state = isOk(loaded) ? normalizeState(loaded.value) : emptyState();
    this.mergeExternallyInstalledSkills();
  }

  create(name: string, skillIds: string[], command?: string): Result<Collection> {
    name = normalizeCommandName(name);
    if (name === INBOX_NAME) {
      return err(new Error(`'inbox' is not a command. Inbox is a holding list of skill IDs — add with 'contextkit inbox add' and file them onto a named command.`));
    }
    if (this.state.commands.some((c) => c.name === name)) {
      return err(new Error(`Command '${name}' already exists. Choose a different name or run 'contextkit list' to see existing commands.`));
    }

    const collection: Collection = {
      name,
      skills: skillIds,
      createdAt: new Date().toISOString(),
      ...(command !== undefined ? { command } : {}),
    };
    this.state.commands.push(collection);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.commands.pop();
      return err(new Error(`Failed to save command '${name}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  addSkill(name: string, skillId: string): Result<Collection> {
    name = normalizeCommandName(name);
    const collection = this.state.commands.find((c) => c.name === name);
    if (!collection) {
      return err(commandNotFound(name));
    }
    if (collection.skills.includes(skillId)) {
      return ok(collection);
    }

    collection.skills.push(skillId);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      collection.skills.pop();
      return err(new Error(`Failed to save command '${name}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  removeSkill(name: string, skillId: string): Result<Collection> {
    name = normalizeCommandName(name);
    const collection = this.state.commands.find((c) => c.name === name);
    if (!collection) {
      return err(commandNotFound(name));
    }

    const index = collection.skills.indexOf(skillId);
    if (index === -1) {
      return ok(collection);
    }

    collection.skills.splice(index, 1);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      collection.skills.splice(index, 0, skillId);
      return err(new Error(`Failed to save command '${name}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  getCommand(name: string): Result<string> {
    const collection = this.state.commands.find((c) => c.name === name);
    if (!collection) {
      return err(new Error(`Collection '${name}' not found. Run 'contextkit list' to see available collections.`));
    }
    if (!collection.command) {
      return err(new Error(`Collection '${name}' has no command defined. Create it with 'contextkit create ${name} --command "<cmd>"'.`));
    }
    return ok(collection.command);
  }

  list(): Collection[] {
    return [...this.state.commands];
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
    const warnings = this.state.commands
      .filter((c) => !configNames.has(c.name))
      .map((c) => `Local collection '${c.name}' is not in the config file. Add it to '${configPath}' or remove it locally.`);

    const snapshot = this.state.commands.map((c) => ({ ...c }));
    const synced: string[] = [];
    for (const [name, skillIds] of Object.entries(configResult.value.collections)) {
      const existing = this.state.commands.find((c) => c.name === name);
      if (existing) {
        existing.skills = skillIds;
      } else {
        this.state.commands.push({
          name,
          skills: skillIds,
          createdAt: new Date().toISOString(),
        });
      }
      synced.push(name);
    }

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.commands = snapshot;
      return err(new Error(`Failed to save synced collections: ${persistResult.error.message}`));
    }

    return ok({ synced, warnings });
  }

  async install(skillId: string, targetIDE: IDE): Promise<Result<SkillRecord>> {
    const result = await this.skillsAdapter.install(skillId, targetIDE);
    if (!isOk(result)) {
      return err(result.error);
    }

    const deployPath = `${SKILL_ROOT_BY_IDE[targetIDE]}/${skillId}`;
    const installedAt = new Date().toISOString();
    const existingIndex = this.state.skills.findIndex((s) => s.id === skillId);
    const previous = existingIndex >= 0 ? cloneSkillRecord(this.state.skills[existingIndex]) : undefined;
    const hash = hashSkillAt(this.fs, deployPath) ?? previous?.hash ?? '';

    const record: SkillRecord = previous
      ? {
          ...previous,
          hash,
          paths: previous.paths.includes(deployPath) ? previous.paths : [...previous.paths, deployPath],
          deployedTo: upsertDeploy(previous.deployedTo, { ide: targetIDE, path: deployPath, installedAt }),
        }
      : {
          id: skillId,
          hash,
          paths: [deployPath],
          deployedTo: [{ ide: targetIDE, path: deployPath, installedAt }],
          source: 'skills.sh',
        };

    if (existingIndex >= 0) {
      this.state.skills[existingIndex] = record;
    } else {
      this.state.skills.push(record);
    }

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      if (previous && existingIndex >= 0) {
        this.state.skills[existingIndex] = previous;
      } else {
        this.state.skills.pop();
      }
      return err(new Error(`Failed to save installed skill '${skillId}': ${persistResult.error.message}`));
    }

    return ok(record);
  }

  search(query: string): Promise<Result<Skill[]>> {
    return this.skillsAdapter.search(query);
  }

  browse(view: BrowseView): Promise<Result<Skill[]>> {
    return this.skillsAdapter.browse(view);
  }

  convert(skillId: string, targetIDE: IDE): Promise<Result<void>> {
    return this.skillsAdapter.convert(skillId, targetIDE);
  }

  async export(collectionNames: string[], targetIDE: IDE): Promise<Result<ExportResult>> {
    const succeeded: string[] = [];
    const failures: string[] = [];

    for (const name of collectionNames) {
      const collection = this.state.commands.find((c) => c.name === name);
      if (!collection) {
        failures.push(`Collection '${name}' not found. Run 'contextkit list' to see available collections.`);
        continue;
      }

      for (const skillId of collection.skills) {
        const result = await this.skillsAdapter.convert(skillId, targetIDE);
        if (isOk(result)) {
          succeeded.push(`${name}:${skillId}`);
        } else {
          failures.push(`'${name}:${skillId}': ${result.error.message}`);
        }
      }
    }

    return ok({ succeeded, failures });
  }

  inbox(): string[] {
    return [...this.state.inbox];
  }

  addToInbox(skillId: string): Result<string[]> {
    if (this.state.inbox.includes(skillId)) {
      return ok(this.inbox());
    }

    this.state.inbox.push(skillId);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.inbox.pop();
      return err(new Error(`Failed to save inbox: ${persistResult.error.message}`));
    }

    return ok(this.inbox());
  }

  removeFromInbox(skillId: string): Result<string[]> {
    const index = this.state.inbox.indexOf(skillId);
    if (index === -1) {
      return ok(this.inbox());
    }

    this.state.inbox.splice(index, 1);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.inbox.splice(index, 0, skillId);
      return err(new Error(`Failed to save inbox: ${persistResult.error.message}`));
    }

    return ok(this.inbox());
  }

  file(skillId: string, commandName: string): Result<Collection> {
    commandName = normalizeCommandName(commandName);
    const collection = this.state.commands.find((c) => c.name === commandName);
    if (!collection) {
      return err(commandNotFound(commandName));
    }

    const inboxIndex = this.state.inbox.indexOf(skillId);
    if (inboxIndex === -1) {
      return err(new Error(`'${skillId}' is not in Inbox. Add it first, then file it onto a command.`));
    }

    const inboxSnapshot = [...this.state.inbox];
    const skillsSnapshot = [...collection.skills];

    this.state.inbox.splice(inboxIndex, 1);
    if (!collection.skills.includes(skillId)) {
      collection.skills.push(skillId);
    }

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.inbox = inboxSnapshot;
      collection.skills = skillsSnapshot;
      return err(new Error(`Failed to save command '${commandName}': ${persistResult.error.message}`));
    }

    return ok(collection);
  }

  delete(name: string): Result<void> {
    name = normalizeCommandName(name);
    const index = this.state.commands.findIndex((c) => c.name === name);
    if (index === -1) {
      return err(commandNotFound(name));
    }

    const removed = this.state.commands[index];
    if (removed === undefined) {
      return err(commandNotFound(name));
    }
    this.state.commands.splice(index, 1);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.commands.splice(index, 0, removed);
      return err(new Error(`Failed to save after deleting '${name}': ${persistResult.error.message}`));
    }

    return ok(undefined);
  }

  scan(): Result<ScanResult> {
    const found = new Map<string, { hash: string; paths: string[] }>();

    for (const root of SKILL_ROOTS) {
      const folders = this.fs.findSkillFolders(root);
      if (!isOk(folders)) {
        return err(folders.error);
      }

      for (const folder of folders.value) {
        const id = catalogId(folder, root);
        if (id === '') {
          continue;
        }

        const contents = this.fs.readFile(`${folder}/SKILL.md`);
        if (!isOk(contents)) {
          return err(contents.error);
        }

        const hash = createHash('sha256').update(contents.value, 'utf8').digest('hex');
        const existing = found.get(id);
        if (existing) {
          existing.paths.push(folder);
        } else {
          found.set(id, { hash, paths: [folder] });
        }
      }
    }

    const snapshot = {
      skills: this.state.skills.map((record) => ({ ...record, paths: [...record.paths], deployedTo: [...record.deployedTo] })),
      inbox: [...this.state.inbox],
      commands: this.state.commands.map((command) => ({ ...command, skills: [...command.skills] })),
    };

    const previous = new Map(this.state.skills.map((record) => [record.id, record]));
    const filed = new Set(this.state.commands.flatMap((command) => command.skills));
    const added: string[] = [];
    const changed: string[] = [];
    const nextSkills: SkillRecord[] = [];

    for (const [id, seen] of found) {
      const prev = previous.get(id);
      if (!prev) {
        added.push(id);
        nextSkills.push({
          id,
          hash: seen.hash,
          paths: seen.paths,
          deployedTo: [],
          source: 'local',
        });
        if (!filed.has(id) && !this.state.inbox.includes(id)) {
          this.state.inbox.push(id);
        }
      } else {
        if (prev.hash !== seen.hash) {
          changed.push(id);
        }
        nextSkills.push({
          ...prev,
          hash: seen.hash,
          paths: seen.paths,
        });
      }
    }

    const gone: string[] = [];
    for (const prev of this.state.skills) {
      if (found.has(prev.id)) {
        continue;
      }
      gone.push(prev.id);
      this.state.inbox = this.state.inbox.filter((entry) => entry !== prev.id);
      for (const command of this.state.commands) {
        command.skills = command.skills.filter((skillId) => skillId !== prev.id);
      }
    }

    this.state.skills = nextSkills;

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.skills = snapshot.skills;
      this.state.inbox = snapshot.inbox;
      this.state.commands = snapshot.commands;
      return err(new Error(`Failed to save scan: ${persistResult.error.message}`));
    }

    return ok({ added, gone, changed });
  }

  skills(): SkillRecord[] {
    return [...this.state.skills];
  }

  /** Writes state to disk. Returns an error Result if the write fails; callers must check it rather than assume the mutation was saved. */
  private persist(): Result<void> {
    this.state.version = STATE_VERSION;
    return this.fs.writeJSON(STATE_PATH, this.state);
  }

  /**
   * Picks up skills already installed by external tooling (e.g. a bare
   * `npx skills add` run outside ContextKit) so state stays in sync.
   * In-memory only: persisted on the next mutation, not on construction.
   */
  private mergeExternallyInstalledSkills(): void {
    const known = new Set(this.state.installedSkills.map((s) => s.id));
    for (const skill of this.skillsAdapter.getInstalled()) {
      if (!known.has(skill.id)) {
        this.state.installedSkills.push(skill);
        known.add(skill.id);
      }
    }
  }
}

function catalogId(folder: string, root: string): string {
  if (folder === root) {
    return '.';
  }
  const prefix = `${root}/`;
  return folder.startsWith(prefix) ? folder.slice(prefix.length) : folder;
}

function cloneSkillRecord(record: SkillRecord | undefined): SkillRecord | undefined {
  if (!record) {
    return undefined;
  }
  return {
    ...record,
    paths: [...record.paths],
    deployedTo: record.deployedTo.map((entry) => ({ ...entry })),
  };
}

function hashSkillAt(fs: IFileSystemAdapter, folder: string): string | undefined {
  const contents = fs.readFile(`${folder}/SKILL.md`);
  if (!isOk(contents)) {
    return undefined;
  }
  return createHash('sha256').update(contents.value, 'utf8').digest('hex');
}

function upsertDeploy(
  existing: SkillRecord['deployedTo'],
  entry: SkillRecord['deployedTo'][number]
): SkillRecord['deployedTo'] {
  const index = existing.findIndex((deploy) => deploy.ide === entry.ide);
  if (index === -1) {
    return [...existing, entry];
  }
  return existing.map((deploy, i) => (i === index ? entry : deploy));
}
