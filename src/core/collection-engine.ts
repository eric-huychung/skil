import { createHash } from 'node:crypto';
import type { ICollectionEngine } from '../interfaces/engine.js';
import type { IFileSystemAdapter, ISkillsAdapter, IUsageCollector } from '../interfaces/adapters.js';
import type {
  AdoptResult,
  BrowseView,
  Collection,
  CommandRecord,
  LeftoverRecord,
  OriginCheck,
  RuleRecord,
  ScanResult,
  Skill,
  SkillRecord,
  State,
  UsageRow,
} from '../types/index.js';
import { err, isOk, ok, type Result } from './result.js';
import { isCommandSkillStamp, isSkilStamped, parseStampedSkills, writeCommandFile, writeOpenAiYaml } from './command-file.js';
import {
  AGENTS_MD,
  collectRules,
  leftoverAlwaysOnWarnings,
  readRuleSection,
  removeRuleSection,
  upsertRuleSection,
} from './project-rules.js';
import {
  COMMAND_DIR_BY_IDE,
  COMMAND_EXTENSION_BY_IDE,
  deprecatedPathFor,
  isLiveSkillPath,
  isParkedPath,
  liveSkillPaths,
  LIVE_IDES,
  parkedCommandPath,
  parkedRulePath,
  parkedSkillPath,
  SCAN_SKILL_ROOTS,
  SKILL_ROOTS,
} from './dock-layout.js';
import type { IDE } from '../types/index.js';

/** Path to the persisted engine state, relative to the project root. */
export const STATE_PATH = '.skil/state.json';

const LEFTOVER_STATE_PATH = '.contextkit/state.json';

/** Current state schema version. See `State`'s doc comment for the v5 → v6 notes. */
const STATE_VERSION = '6.0';

/** Set form of `LIVE_IDES` so a broader `IDE` value can be checked with `.has`. */
const LIVE_IDE_SET = new Set<IDE>(LIVE_IDES);

/** Store `/build` as `build`. UI may still display the slash. */
function normalizeCommandName(name: string): string {
  return name.startsWith('/') ? name.slice(1) : name;
}

function commandNotFound(name: string): Error {
  return new Error(`Command '${name}' not found. Run 'skil list' to see available commands.`);
}

function skillFolderName(skillId: string): string {
  return skillId.split('/').filter(Boolean).at(-1) ?? skillId;
}

/** Prefix a workspace-relative path with an optional dest root. */
function underRoot(root: string | undefined, relative: string): string {
  if (!root) return relative;
  return `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${relative}`;
}

/** On-disk command that may still use v4 `skills[]`. */
interface PersistedCommand {
  name: string;
  skills?: string[];
  membership?: Partial<Record<IDE, string[]>>;
  createdAt: string;
  command?: string;
}

/** On-disk shape that may still use v3 `collections`. */
interface PersistedState {
  version?: string;
  commands?: PersistedCommand[];
  collections?: PersistedCommand[];
  skills?: SkillRecord[];
  installedSkills?: Skill[];
}

function emptyState(): State {
  return { commands: [], skills: [], installedSkills: [], version: STATE_VERSION };
}

const ALL_IDES: IDE[] = ['cursor', 'claude', 'codex', 'copilot', 'agents', 'windsurf'];
const DEFAULT_IDE: IDE = 'cursor';

function unionMembership(membership: Partial<Record<IDE, string[]>>): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  const order: IDE[] = [DEFAULT_IDE, ...ALL_IDES.filter((ide) => ide !== DEFAULT_IDE)];
  for (const ide of order) {
    for (const id of membership[ide] ?? []) {
      if (!seen.has(id)) {
        seen.add(id);
        skills.push(id);
      }
    }
  }
  return skills;
}

function toCommandRecord(raw: PersistedCommand): CommandRecord {
  const skills =
    raw.membership !== undefined ? unionMembership(raw.membership) : [...(raw.skills ?? [])];
  return {
    name: raw.name,
    skills,
    createdAt: raw.createdAt,
    ...(raw.command !== undefined ? { command: raw.command } : {}),
  };
}

function normalizeState(raw: PersistedState): State {
  const commands = (raw.commands ?? raw.collections ?? []).map(toCommandRecord);
  return {
    commands,
    skills: raw.skills ?? [],
    installedSkills: raw.installedSkills ?? [],
    version: raw.version ?? STATE_VERSION,
  };
}


function cloneCommandRecord(record: CommandRecord): CommandRecord {
  return {
    ...record,
    skills: [...record.skills],
  };
}

/** Load `.skil/state.json`. Missing file → empty state. Leftover `.contextkit/state.json` with no `.skil/` file is an error. */
function loadState(fs: IFileSystemAdapter): State {
  const current = fs.readJSON<PersistedState>(STATE_PATH);
  if (isOk(current)) {
    return normalizeState(current.value);
  }
  const leftover = fs.readJSON<PersistedState>(LEFTOVER_STATE_PATH);
  if (isOk(leftover)) {
    throw new Error(
      'Found leftover .contextkit/state.json. Move it to .skil/state.json and retry.'
    );
  }
  return emptyState();
}

/**
 * CollectionEngine is skil's deep module: see ICollectionEngine for the
 * public contract. This class owns state management, live/parked/
 * leftover/deprecated path classification, and coordination with the
 * injected adapters.
 */
const NOOP_USAGE: IUsageCollector = {
  async collect() {
    return ok([]);
  },
};

export class CollectionEngine implements ICollectionEngine {
  private state: State;
  private writtenPaths: string[] = [];

  constructor(
    private readonly fs: IFileSystemAdapter,
    private readonly skillsAdapter: ISkillsAdapter,
    private readonly usageCollector: IUsageCollector = NOOP_USAGE,
    private readonly projectRoot: string = process.cwd()
  ) {
    this.state = loadState(this.fs);
    this.mergeExternallyInstalledSkills();
  }

  lastWrittenPaths(): string[] {
    return [...this.writtenPaths];
  }

  /** `enabled` is computed from disk (every live command-skill path present), never persisted. */
  private toView(record: CommandRecord): Collection {
    const livePaths = liveSkillPaths(record.name);
    const enabled = livePaths.every((path) => isOk(this.fs.readFile(`${path}/SKILL.md`)));
    return {
      name: record.name,
      skills: [...record.skills],
      createdAt: record.createdAt,
      enabled,
      ...(record.command !== undefined ? { command: record.command } : {}),
    };
  }

  async usage(): Promise<Result<UsageRow[]>> {
    const skillIds = this.state.skills.map((skill) => skill.id);
    const collected = await this.usageCollector.collect({
      projectRoot: this.projectRoot,
      skillIds,
    });
    if (!isOk(collected)) {
      return err(collected.error);
    }
    const counts = new Map<string, number>();
    for (const event of collected.value) {
      counts.set(event.skillId, (counts.get(event.skillId) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([skillId, count]) => ({ skillId, count }))
      .sort((a, b) => b.count - a.count || a.skillId.localeCompare(b.skillId));
    return ok(rows);
  }

  create(name: string, skillIds: string[]): Result<Collection> {
    name = normalizeCommandName(name);
    const existing = this.state.commands.find((c) => c.name === name);
    if (existing) {
      return err(new Error(`Command '${name}' already exists. Choose a different name or run 'skil list' to see existing commands.`));
    }

    const record: CommandRecord = {
      name,
      skills: [...skillIds],
      createdAt: new Date().toISOString(),
    };
    this.state.commands.push(record);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.commands.pop();
      return err(new Error(`Failed to save command '${name}': ${persistResult.error.message}`));
    }

    this.writtenPaths = [];
    return ok(this.toView(record));
  }

  addSkill(name: string, skillId: string): Result<Collection> {
    name = normalizeCommandName(name);
    const record = this.state.commands.find((c) => c.name === name);
    if (!record) {
      return err(commandNotFound(name));
    }
    if (record.skills.includes(skillId)) {
      return ok(this.toView(record));
    }

    const snapshot = [...record.skills];
    record.skills.push(skillId);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      record.skills = snapshot;
      return err(new Error(`Failed to save command '${name}': ${persistResult.error.message}`));
    }

    this.writtenPaths = this.writeThroughCommandSkill(name);
    return ok(this.toView(record));
  }

  removeSkill(name: string, skillId: string): Result<Collection> {
    name = normalizeCommandName(name);
    const record = this.state.commands.find((c) => c.name === name);
    if (!record) {
      return err(commandNotFound(name));
    }

    const index = record.skills.indexOf(skillId);
    if (index === -1) {
      return ok(this.toView(record));
    }

    const snapshot = [...record.skills];
    record.skills.splice(index, 1);
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      record.skills = snapshot;
      return err(new Error(`Failed to save command '${name}': ${persistResult.error.message}`));
    }

    this.writtenPaths = this.writeThroughCommandSkill(name);
    return ok(this.toView(record));
  }

  list(): Collection[] {
    return this.state.commands.map((c) => this.toView(c));
  }

  async install(
    skillId: string,
    opts?: { dest?: string; replace?: boolean; refreshOrigin?: boolean }
  ): Promise<Result<SkillRecord>> {
    const livePaths = liveSkillPaths(skillId).map((path) => underRoot(opts?.dest, path));
    const [agentsPath, ...mirrorPaths] = livePaths as [string, ...string[]];

    const result = await this.skillsAdapter.install(skillId, opts?.dest ? { cwd: opts.dest } : undefined);
    if (!isOk(result)) {
      return err(result.error);
    }

    const placed = this.relocateNpxInstall(skillId, opts?.dest, opts?.replace === true);
    if (!isOk(placed)) {
      return placed;
    }

    for (const mirrorPath of mirrorPaths) {
      const mirrored = this.mirrorLiveInstall(skillId, agentsPath, mirrorPath, opts?.replace === true);
      if (!isOk(mirrored)) {
        return mirrored;
      }
    }

    const installedAt = new Date().toISOString();
    const existingIndex = this.state.skills.findIndex((s) => s.id === skillId);
    const previous = existingIndex >= 0 ? cloneSkillRecord(this.state.skills[existingIndex]) : undefined;
    const hash = hashSkillAt(this.fs, agentsPath) ?? previous?.hash ?? '';
    const originHash = opts?.refreshOrigin
      ? hash || previous?.originHash
      : previous?.originHash ?? (hash || undefined);

    const deploys = LIVE_IDES.map((ide, index) => ({
      ide,
      path: livePaths[index] as string,
      installedAt,
    }));

    const record: SkillRecord = previous
      ? {
          ...previous,
          hash,
          ...(originHash !== undefined ? { originHash } : {}),
          paths: [...previous.paths, ...livePaths.filter((path) => !previous.paths.includes(path))],
          deployedTo: deploys.reduce(upsertDeploy, previous.deployedTo),
        }
      : {
          id: skillId,
          hash,
          ...(hash ? { originHash: hash } : {}),
          paths: [...livePaths],
          deployedTo: deploys,
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

    this.writtenPaths = livePaths.flatMap((path) => [path, `${path}/SKILL.md`]);
    return ok(record);
  }

  async setSkillEnabled(skillId: string, enabled: boolean): Promise<Result<SkillRecord>> {
    const index = this.state.skills.findIndex((skill) => skill.id === skillId);
    if (index === -1) {
      return err(new Error(`Skill '${skillId}' is not in the catalog.`));
    }
    return enabled ? this.turnSkillOn(skillId, index) : this.turnSkillOff(skillId, index);
  }

  async setCommandEnabled(name: string, enabled: boolean): Promise<Result<Collection>> {
    name = normalizeCommandName(name);
    const record = this.state.commands.find((c) => c.name === name);
    if (!record) {
      return err(commandNotFound(name));
    }
    return enabled ? this.turnCommandOn(name, record) : this.turnCommandOff(name, record);
  }

  search(query: string): Promise<Result<Skill[]>> {
    return this.skillsAdapter.search(query);
  }

  browse(view: BrowseView): Promise<Result<Skill[]>> {
    return this.skillsAdapter.browse(view);
  }

  deleteSkill(skillId: string): Result<void> {
    const record = this.state.skills.find((skill) => skill.id === skillId);
    const filed = this.commandsFiling(skillId);
    if (!record && filed.length === 0) {
      return ok(undefined);
    }

    const snapshot = {
      skills: this.state.skills.map((skill) => ({
        ...skill,
        paths: [...skill.paths],
        deployedTo: skill.deployedTo.map((entry) => ({ ...entry })),
      })),
      commands: this.state.commands.map(cloneCommandRecord),
    };

    if (record) {
      this.state.skills = this.state.skills.filter((skill) => skill.id !== skillId);
    }
    this.dropSkillId(skillId);

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.skills = snapshot.skills;
      this.state.commands = snapshot.commands;
      return err(new Error(`Failed to save after deleting '${skillId}': ${persistResult.error.message}`));
    }

    const muted: string[] = [];
    if (record) {
      for (const folder of record.paths) {
        if (!skillRootOf(folder)) {
          continue;
        }
        const removed = this.removeSkillFolder(folder);
        if (!isOk(removed)) {
          return err(removed.error);
        }
        muted.push(...removed.value);
      }
    }

    const names = [...new Set(filed.map((entry) => entry.name))];
    const written = names.flatMap((name) => this.writeThroughCommandSkill(name));
    this.writtenPaths = [...muted, ...written];
    return ok(undefined);
  }

  readSkillMd(skillId: string): Result<string> {
    const record = this.state.skills.find((skill) => skill.id === skillId);
    if (!record) {
      return err(new Error(`Skill '${skillId}' is not in the catalog.`));
    }

    for (const folder of record.paths) {
      const contents = this.fs.readFile(`${folder}/SKILL.md`);
      if (isOk(contents)) {
        return ok(contents.value);
      }
    }

    return err(new Error(`Skill '${skillId}' has no SKILL.md on disk.`));
  }

  delete(name: string): Result<void> {
    name = normalizeCommandName(name);
    const index = this.state.commands.findIndex((c) => c.name === name);
    if (index === -1) {
      return err(commandNotFound(name));
    }

    const existing = this.state.commands[index];
    if (!existing) {
      return err(commandNotFound(name));
    }

    const snapshot = cloneCommandRecord(existing);
    this.state.commands.splice(index, 1);

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.commands.splice(index, 0, snapshot);
      return err(new Error(`Failed to save after deleting '${name}': ${persistResult.error.message}`));
    }

    this.writtenPaths = this.removeCommandFolders(name);
    return ok(undefined);
  }

  scan(): Result<ScanResult> {
    const commandNames = new Set(this.state.commands.map((command) => command.name));
    const found = new Map<string, { hash: string; paths: string[] }>();

    for (const root of SCAN_SKILL_ROOTS) {
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

        if (commandNames.has(id) && isCommandSkillStamp(contents.value)) {
          // Our own live command skill — a command, not a catalog skill.
          continue;
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
      commands: this.state.commands.map(cloneCommandRecord),
    };

    const previous = new Map(this.state.skills.map((record) => [record.id, record]));
    const added: string[] = [];
    const changed: string[] = [];
    const nextSkills: SkillRecord[] = [];
    const matchedPrevious = new Set<string>();
    const matchedFound = new Set<string>();

    for (const [id, seen] of found) {
      const prev = previous.get(id);
      if (prev) {
        matchedPrevious.add(id);
        matchedFound.add(id);
        if (prev.hash !== seen.hash) {
          changed.push(id);
        }
        nextSkills.push({
          ...prev,
          hash: seen.hash,
          paths: seen.paths,
          ...(prev.source === 'skills.sh' && !prev.originHash ? { originHash: seen.hash } : {}),
        });
      }
    }

    const unmatchedPrev = this.state.skills.filter((record) => !matchedPrevious.has(record.id));
    const unmatchedFound = [...found.entries()].filter(([id]) => !matchedFound.has(id));

    for (const prev of unmatchedPrev) {
      const renameIndex = unmatchedFound.findIndex(([, seen]) => seen.hash === prev.hash);
      if (renameIndex === -1) {
        continue;
      }
      const renamed = unmatchedFound.splice(renameIndex, 1)[0];
      if (!renamed) {
        continue;
      }
      const [newId, seen] = renamed;
      matchedPrevious.add(prev.id);
      this.renameSkillId(prev.id, newId);
      nextSkills.push({
        ...prev,
        id: newId,
        hash: seen.hash,
        paths: seen.paths,
      });
    }

    for (const [id, seen] of unmatchedFound) {
      const origin = nextSkills.find(
        (record) => record.source === 'skills.sh' && record.id !== id && skillFolderName(record.id) === id
      );
      if (origin) {
        for (const path of seen.paths) {
          if (!origin.paths.includes(path)) origin.paths.push(path);
        }
        continue;
      }
      added.push(id);
      nextSkills.push({
        id,
        hash: seen.hash,
        paths: seen.paths,
        deployedTo: [],
        source: 'local',
      });
    }

    const gone: string[] = [];
    for (const prev of this.state.skills) {
      if (matchedPrevious.has(prev.id) || nextSkills.some((record) => record.id === prev.id)) {
        continue;
      }
      gone.push(prev.id);
      this.dropSkillId(prev.id);
    }

    this.state.skills = nextSkills;

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.skills = snapshot.skills;
      this.state.commands = snapshot.commands;
      return err(new Error(`Failed to save scan: ${persistResult.error.message}`));
    }

    const written = this.state.commands.flatMap((command) => this.writeThroughCommandSkill(command.name));
    this.writtenPaths = written;

    const alwaysOnWarnings = leftoverAlwaysOnWarnings(this.fs);
    return ok({ added, gone, changed, alwaysOnWarnings });
  }

  skills(): SkillRecord[] {
    return [...this.state.skills];
  }

  rules(): RuleRecord[] {
    const listed = collectRules(this.fs);
    return isOk(listed) ? listed.value : [];
  }

  readRule(id: string): Result<string> {
    const listed = collectRules(this.fs);
    if (!isOk(listed)) {
      return err(new Error(`Rule '${id}' not found.`));
    }
    const target = listed.value.find((rule) => rule.id === id);
    if (!target) {
      return err(new Error(`Rule '${id}' not found.`));
    }
    if (target.kind === 'glob') {
      return this.fs.readFile(target.path);
    }
    const contents = this.fs.readFile(target.path);
    if (!isOk(contents)) {
      return err(new Error(`Rule '${id}' not found.`));
    }
    const section = readRuleSection(contents.value, id);
    if (section === null) {
      return err(new Error(`Rule '${id}' not found.`));
    }
    return ok(section);
  }

  setSharedRuleEnabled(id: string, enabled: boolean): Result<RuleRecord> {
    const listed = collectRules(this.fs);
    if (!isOk(listed)) {
      return listed;
    }
    const target = listed.value.find((rule) => rule.id === id);
    if (target?.kind === 'glob') {
      return err(new Error(`'${id}' is a path-scoped rule file. It stays on disk and cannot be toggled.`));
    }
    return enabled ? this.turnSharedRuleOn(id, target) : this.turnSharedRuleOff(id, target);
  }

  leftovers(): Result<LeftoverRecord[]> {
    const rows: LeftoverRecord[] = [];

    for (const record of this.state.skills) {
      for (const path of record.paths) {
        if (isLiveSkillPath(path) || isParkedPath(path)) {
          continue;
        }
        rows.push({ kind: 'skill', id: record.id, path });
      }
    }

    for (const [ide, dir] of Object.entries(COMMAND_DIR_BY_IDE) as Array<[IDE, string]>) {
      const listed = this.fs.listFiles(dir);
      if (!isOk(listed)) {
        continue;
      }
      const ext = COMMAND_EXTENSION_BY_IDE[ide] ?? '.md';
      for (const path of listed.value) {
        if (!path.endsWith(ext)) {
          continue;
        }
        const name = path.slice(path.lastIndexOf('/') + 1, -ext.length);
        if (name === '') {
          continue;
        }
        const contents = this.fs.readFile(path);
        if (!isOk(contents) || !isSkilStamped(contents.value)) {
          continue;
        }
        rows.push({ kind: 'command', id: name, path });
      }
    }

    const codexRules = this.fs.listAllFiles('.codex/rules');
    if (isOk(codexRules)) {
      for (const path of codexRules.value) {
        rows.push({ kind: 'rule', id: path, path });
      }
    }

    return ok(rows);
  }

  async adoptLeftovers(ids?: string[]): Promise<Result<AdoptResult>> {
    const listed = this.leftovers();
    if (!isOk(listed)) {
      return listed;
    }
    const idSet = ids ? new Set(ids) : null;
    const targets = listed.value.filter((row) => !idSet || idSet.has(row.id));

    const adopted: string[] = [];
    const deprecated: string[] = [];

    for (const row of targets) {
      const adoptResult = this.adoptOne(row);
      if (!isOk(adoptResult)) {
        return err(adoptResult.error);
      }
      if (adoptResult.value) {
        adopted.push(row.id);
      }

      const moved = this.moveToDeprecated(row);
      if (!isOk(moved)) {
        return err(moved.error);
      }
      deprecated.push(moved.value);

      if (row.kind === 'skill') {
        const record = this.state.skills.find((skill) => skill.id === row.id);
        if (record) {
          record.paths = record.paths.filter((path) => path !== row.path);
        }
      }
    }

    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      return err(new Error(`Failed to save after adopting leftovers: ${persistResult.error.message}`));
    }

    this.writtenPaths = deprecated;
    return ok({ adopted, deprecated });
  }

  private adoptOne(row: LeftoverRecord): Result<boolean> {
    if (row.kind === 'skill') {
      const record = this.state.skills.find((skill) => skill.id === row.id);
      if (!record) {
        return ok(false);
      }
      const livePaths = liveSkillPaths(row.id);
      const missing = livePaths.filter((path) => !isOk(this.fs.readFile(`${path}/SKILL.md`)));
      if (missing.length === 0) {
        return ok(false);
      }
      for (const path of missing) {
        const copied = this.fs.copyDir(row.path, path);
        if (!isOk(copied)) {
          return err(new Error(`Failed to adopt '${row.id}': ${copied.error.message}`));
        }
      }
      record.paths = [...new Set([...record.paths, ...livePaths])];
      return ok(true);
    }

    if (row.kind === 'command') {
      const command = this.state.commands.find((c) => c.name === row.id);
      if (!command) {
        return ok(false);
      }
      const on = this.turnCommandOn(row.id, command);
      return isOk(on) ? ok(true) : err(on.error);
    }

    const name = ruleNameFromLeftoverPath(row.path);
    const sharedListed = collectRules(this.fs);
    const alreadyShared = isOk(sharedListed) && sharedListed.value.some((rule) => rule.kind === 'shared' && rule.id === name);
    if (alreadyShared) {
      return ok(false);
    }
    const body = this.fs.readFile(row.path);
    if (!isOk(body)) {
      return ok(false);
    }
    const agents = this.fs.readFile(AGENTS_MD);
    const next = upsertRuleSection(isOk(agents) ? agents.value : '', name, body.value);
    const written = this.fs.writeFile(AGENTS_MD, next);
    if (!isOk(written)) {
      return err(new Error(`Failed to adopt '${row.id}': ${written.error.message}`));
    }
    return ok(true);
  }

  /** Skill leftovers are folders (copyDir/removeDir); command/rule leftovers are single files. */
  private moveToDeprecated(row: LeftoverRecord): Result<string> {
    const dest = deprecatedPathFor(row.path);
    if (row.kind === 'skill') {
      const copied = this.fs.copyDir(row.path, dest);
      if (!isOk(copied)) {
        return err(new Error(`Failed to deprecate '${row.path}': ${copied.error.message}`));
      }
      const removed = this.fs.removeDir(row.path);
      if (!isOk(removed)) {
        return err(new Error(`Failed to remove leftover '${row.path}': ${removed.error.message}`));
      }
      return ok(dest);
    }

    const contents = this.fs.readFile(row.path);
    if (!isOk(contents)) {
      return err(new Error(`Failed to deprecate '${row.path}': ${contents.error.message}`));
    }
    const written = this.fs.writeFile(dest, contents.value);
    if (!isOk(written)) {
      return err(new Error(`Failed to deprecate '${row.path}': ${written.error.message}`));
    }
    const removed = this.fs.removeFile(row.path);
    if (!isOk(removed)) {
      return err(new Error(`Failed to remove leftover '${row.path}': ${removed.error.message}`));
    }
    return ok(dest);
  }

  async originChecks(): Promise<Result<OriginCheck[]>> {
    const checks: OriginCheck[] = [];
    for (const record of this.state.skills) {
      if (record.source !== 'skills.sh' || !record.originHash) {
        continue;
      }
      if (record.hash !== record.originHash) {
        checks.push({ skillId: record.id, status: 'edited' });
        continue;
      }
      const market = await this.skillsAdapter.skillHash(record.id);
      if (!isOk(market) || !market.value || market.value === record.originHash) {
        checks.push({ skillId: record.id, status: 'current' });
        continue;
      }
      checks.push({ skillId: record.id, status: 'update' });
    }
    return ok(checks);
  }

  async updateFromMarket(
    skillId: string,
    opts?: { replaceEdited?: boolean; dest?: string }
  ): Promise<Result<SkillRecord>> {
    const record = this.state.skills.find((skill) => skill.id === skillId);
    if (!record || record.source !== 'skills.sh' || !record.originHash) {
      return err(new Error(`Skill '${skillId}' has no market origin to update from.`));
    }
    if (record.hash !== record.originHash && !opts?.replaceEdited) {
      return err(new Error(`Skill '${skillId}' was edited. Reset from the preview if you want the market copy.`));
    }

    const installed = await this.install(skillId, {
      dest: opts?.dest,
      replace: true,
      refreshOrigin: true,
    });
    if (!isOk(installed)) {
      return installed;
    }
    return ok(installed.value);
  }

  /**
   * Off: park whichever live folders exist under `.skil/parked/skills/<id>`
   * (first present live copy is the source), then remove the live
   * folders. Already off (no live copy present) is a no-op.
   */
  private turnSkillOff(skillId: string, index: number): Result<SkillRecord> {
    const record = this.state.skills[index] as SkillRecord;
    const livePaths = liveSkillPaths(skillId);
    const presentLive = livePaths.filter((path) => isOk(this.fs.readFile(`${path}/SKILL.md`)));
    if (presentLive.length === 0) {
      return ok(record);
    }

    const parkedPath = parkedSkillPath(skillId);
    const source = presentLive[0] as string;
    const parked = this.fs.copyDir(source, parkedPath);
    if (!isOk(parked)) {
      return err(new Error(`Failed to park skill '${skillId}': ${parked.error.message}`));
    }

    for (const path of presentLive) {
      const removed = this.fs.removeDir(path);
      if (!isOk(removed)) {
        return err(new Error(`Failed to park skill '${skillId}': ${removed.error.message}`));
      }
    }

    const remainingPaths = record.paths.filter((path) => !livePaths.includes(path));
    const nextRecord: SkillRecord = {
      ...record,
      paths: remainingPaths.includes(parkedPath) ? remainingPaths : [...remainingPaths, parkedPath],
      deployedTo: record.deployedTo.filter((deploy) => !LIVE_IDE_SET.has(deploy.ide)),
    };

    this.state.skills[index] = nextRecord;
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.skills[index] = record;
      return err(new Error(`Failed to save after parking '${skillId}': ${persistResult.error.message}`));
    }

    this.writtenPaths = [...presentLive, parkedPath];
    return ok(nextRecord);
  }

  /**
   * On: fill every missing live path. A present live copy self-heals the
   * others first (parked stays untouched); otherwise the parked copy is
   * restored to both. No live and no parked copy re-fetches from the
   * market for a `skills.sh` record, or errors for a `local` one.
   * Already on (every live path present) is a no-op.
   */
  private async turnSkillOn(skillId: string, index: number): Promise<Result<SkillRecord>> {
    const record = this.state.skills[index] as SkillRecord;
    const livePaths = liveSkillPaths(skillId);
    const missingLive = livePaths.filter((path) => !isOk(this.fs.readFile(`${path}/SKILL.md`)));
    if (missingLive.length === 0) {
      return ok(record);
    }

    const presentLive = livePaths.filter((path) => isOk(this.fs.readFile(`${path}/SKILL.md`)));
    const parkedPath = parkedSkillPath(skillId);
    let source = presentLive[0];
    if (!source) {
      const parkedPresent = isOk(this.fs.readFile(`${parkedPath}/SKILL.md`));
      if (!parkedPresent) {
        if (record.source !== 'skills.sh') {
          return err(
            new Error(`Skill '${skillId}' has no parked copy to restore. Nothing to turn on from.`)
          );
        }
        return this.install(skillId);
      }
      source = parkedPath;
    }

    const written: string[] = [];
    for (const path of missingLive) {
      const copied = this.fs.copyDir(source, path);
      if (!isOk(copied)) {
        return err(new Error(`Failed to restore skill '${skillId}' to ${path}: ${copied.error.message}`));
      }
      written.push(path);
    }

    const installedAt = new Date().toISOString();
    const deployedTo = LIVE_IDES.reduce(
      (acc, ide, i) => upsertDeploy(acc, { ide, path: livePaths[i] as string, installedAt }),
      record.deployedTo
    );
    const nextRecord: SkillRecord = {
      ...record,
      paths: [...new Set([...record.paths, ...livePaths])],
      deployedTo,
    };

    this.state.skills[index] = nextRecord;
    const persistResult = this.persist();
    if (!isOk(persistResult)) {
      this.state.skills[index] = record;
      return err(new Error(`Failed to save after restoring '${skillId}': ${persistResult.error.message}`));
    }

    this.writtenPaths = written;
    return ok(nextRecord);
  }

  /**
   * On: every live path must either be missing or already be this
   * command's own skill (checked via `isCommandSkillStamp` on whatever
   * SKILL.md is there) — otherwise the write is refused, no auto-prefix.
   * Fills every missing live path: self-heals from a present live copy,
   * else restores from parked, else writes a fresh human-only skill
   * (`disable-model-invocation: true` + `agents/openai.yaml`). Already
   * on is a no-op.
   */
  private turnCommandOn(name: string, record: CommandRecord): Result<Collection> {
    const livePaths = liveSkillPaths(name);

    for (const path of livePaths) {
      const skillMd = this.fs.readFile(`${path}/SKILL.md`);
      if (isOk(skillMd) && !isCommandSkillStamp(skillMd.value)) {
        return err(
          new Error(
            `Cannot turn on '/${name}': '${path}' already exists and is not a command skil manages. Rename or remove that skill first.`
          ),
          { code: 'COMMAND_NAME_COLLISION', labels: [name] }
        );
      }
    }

    const missingLive = livePaths.filter((path) => !isOk(this.fs.readFile(`${path}/SKILL.md`)));
    if (missingLive.length === 0) {
      return ok(this.toView(record));
    }

    const presentLive = livePaths.filter((path) => !missingLive.includes(path));
    const parkedPath = parkedCommandPath(name);
    const parkedPresent = isOk(this.fs.readFile(`${parkedPath}/SKILL.md`));

    const written: string[] = [];
    if (presentLive.length > 0 || parkedPresent) {
      const source = (presentLive[0] ?? parkedPath) as string;
      for (const path of missingLive) {
        const copied = this.fs.copyDir(source, path);
        if (!isOk(copied)) {
          return err(new Error(`Failed to turn on '/${name}': ${copied.error.message}`));
        }
        written.push(path);
      }
    } else {
      for (const path of livePaths) {
        const skillMdResult = this.fs.writeFile(`${path}/SKILL.md`, writeCommandFile(name, record.skills));
        if (!isOk(skillMdResult)) {
          return err(new Error(`Failed to turn on '/${name}': ${skillMdResult.error.message}`));
        }
        const yamlResult = this.fs.writeFile(`${path}/agents/openai.yaml`, writeOpenAiYaml());
        if (!isOk(yamlResult)) {
          return err(new Error(`Failed to turn on '/${name}': ${yamlResult.error.message}`));
        }
        written.push(path);
      }
    }

    this.writtenPaths = written;
    return ok(this.toView(record));
  }

  /** Off: park whichever live command folders exist, then remove them. Already off is a no-op. */
  private turnCommandOff(name: string, record: CommandRecord): Result<Collection> {
    const livePaths = liveSkillPaths(name);
    const presentLive = livePaths.filter((path) => isOk(this.fs.readFile(`${path}/SKILL.md`)));
    if (presentLive.length === 0) {
      return ok(this.toView(record));
    }

    const parkedPath = parkedCommandPath(name);
    const source = presentLive[0] as string;
    const parked = this.fs.copyDir(source, parkedPath);
    if (!isOk(parked)) {
      return err(new Error(`Failed to turn off '/${name}': ${parked.error.message}`));
    }

    for (const path of presentLive) {
      const removed = this.fs.removeDir(path);
      if (!isOk(removed)) {
        return err(new Error(`Failed to turn off '/${name}': ${removed.error.message}`));
      }
    }

    this.writtenPaths = [...presentLive, parkedPath];
    return ok(this.toView(record));
  }

  private turnSharedRuleOn(id: string, target: RuleRecord | undefined): Result<RuleRecord> {
    if (target?.enabled) {
      return ok(target);
    }
    const parkedPath = parkedRulePath(id);
    const parked = this.fs.readFile(parkedPath);
    if (!isOk(parked)) {
      return err(new Error(`Rule '${id}' has no parked copy to restore. Nothing to turn on from.`));
    }
    const agents = this.fs.readFile(AGENTS_MD);
    const next = upsertRuleSection(isOk(agents) ? agents.value : '', id, parked.value);
    const written = this.fs.writeFile(AGENTS_MD, next);
    if (!isOk(written)) {
      return err(new Error(`Failed to turn on rule '${id}': ${written.error.message}`));
    }
    const removed = this.fs.removeFile(parkedPath);
    if (!isOk(removed)) {
      return err(new Error(`Failed to remove parked rule '${id}': ${removed.error.message}`));
    }
    this.writtenPaths = [AGENTS_MD, parkedPath];
    return ok({ id, name: id, kind: 'shared', path: AGENTS_MD, enabled: true });
  }

  private turnSharedRuleOff(id: string, target: RuleRecord | undefined): Result<RuleRecord> {
    if (!target) {
      return err(new Error(`Rule '${id}' not found.`));
    }
    if (!target.enabled) {
      return ok(target);
    }
    const agents = this.fs.readFile(AGENTS_MD);
    const body = isOk(agents) ? readRuleSection(agents.value, id) : null;
    if (!isOk(agents) || body === null) {
      return err(new Error(`Rule '${id}' not found.`));
    }
    const parkedPath = parkedRulePath(id);
    const parked = this.fs.writeFile(parkedPath, body);
    if (!isOk(parked)) {
      return err(new Error(`Failed to park rule '${id}': ${parked.error.message}`));
    }
    const next = removeRuleSection(agents.value, id);
    const written = this.fs.writeFile(AGENTS_MD, next);
    if (!isOk(written)) {
      return err(new Error(`Failed to turn off rule '${id}': ${written.error.message}`));
    }
    this.writtenPaths = [AGENTS_MD, parkedPath];
    return ok({ id, name: id, kind: 'shared', path: AGENTS_MD, enabled: false });
  }

  private removeCommandFolders(name: string): string[] {
    const removed: string[] = [];
    for (const path of liveSkillPaths(name)) {
      if (isOk(this.fs.readFile(`${path}/SKILL.md`))) {
        const result = this.fs.removeDir(path);
        if (isOk(result)) removed.push(path);
      }
    }
    const parked = parkedCommandPath(name);
    if (isOk(this.fs.readFile(`${parked}/SKILL.md`))) {
      const result = this.fs.removeDir(parked);
      if (isOk(result)) removed.push(parked);
    }
    return removed;
  }

  /**
   * Rewrites `## Skills` (and frontmatter `skills:`) on a command's live
   * skill folders — only when it is currently on (every live path
   * present). A no-op when the disk copy already matches the map (skips
   * touching `generated_at`). Off/none commands are left unwritten until
   * the next `setCommandEnabled(name, true)`.
   */
  private writeThroughCommandSkill(name: string): string[] {
    const record = this.state.commands.find((c) => c.name === name);
    if (!record) {
      return [];
    }
    const livePaths = liveSkillPaths(name);
    const presentLive = livePaths.filter((path) => isOk(this.fs.readFile(`${path}/SKILL.md`)));
    if (presentLive.length !== livePaths.length) {
      return [];
    }

    const written: string[] = [];
    for (const path of livePaths) {
      const existing = this.fs.readFile(`${path}/SKILL.md`);
      const existingSkills = isOk(existing) ? parseStampedSkills(existing.value) : null;
      if (existingSkills !== null && listsEqual(existingSkills, record.skills)) {
        continue;
      }
      const contents = writeCommandFile(name, record.skills, isOk(existing) ? existing.value : undefined);
      const result = this.fs.writeFile(`${path}/SKILL.md`, contents);
      if (isOk(result)) {
        written.push(path);
      }
    }
    return written;
  }

  private dropSkillId(id: string): void {
    for (const command of this.state.commands) {
      command.skills = command.skills.filter((skillId) => skillId !== id);
    }
  }

  private commandsFiling(skillId: string): Array<{ name: string }> {
    return this.state.commands
      .filter((command) => command.skills.includes(skillId))
      .map((command) => ({ name: command.name }));
  }

  /**
   * Deletes this skill’s files under `folder`, leaves nested skill
   * folders, then prunes empty parents up to the IDE skills root.
   */
  private removeSkillFolder(folder: string): Result<string[]> {
    const nested = this.fs.findSkillFolders(folder);
    if (!isOk(nested)) {
      return nested;
    }
    const keep = nested.value.filter((path) => path !== folder);

    const files = this.fs.listAllFiles(folder);
    if (!isOk(files)) {
      return files;
    }

    const muted: string[] = [];
    for (const file of files.value) {
      if (keep.some((skillDir) => file === `${skillDir}/SKILL.md` || file.startsWith(`${skillDir}/`))) {
        continue;
      }
      const removed = this.fs.removeFile(file);
      if (!isOk(removed)) {
        return removed;
      }
      muted.push(file);
    }

    const root = skillRootOf(folder);
    const candidates = new Set<string>(muted.map(parentDir).filter((dir) => dir !== ''));
    let dir: string | undefined = folder;
    while (dir && root && dir !== root) {
      candidates.add(dir);
      dir = parentDir(dir);
    }

    const deepestFirst = [...candidates].sort((a, b) => b.length - a.length);
    for (const emptyDir of deepestFirst) {
      if (!root || emptyDir === root || !emptyDir.startsWith(`${root}/`)) {
        continue;
      }
      const remaining = this.fs.listAllFiles(emptyDir);
      if (!isOk(remaining) || remaining.value.length > 0) {
        continue;
      }
      const removed = this.fs.removeDir(emptyDir);
      if (!isOk(removed)) {
        return removed;
      }
      muted.push(emptyDir);
    }

    return ok(muted);
  }

  private renameSkillId(fromId: string, toId: string): void {
    for (const command of this.state.commands) {
      command.skills = command.skills.map((skillId) => (skillId === fromId ? toId : skillId));
    }
  }

  /**
   * `npx skills add --agent universal` lands in `.agents/skills/<short-name>`.
   * Move that folder under the full market id so scan does not treat the id
   * as gone and strip it from the command.
   */
  private relocateNpxInstall(skillId: string, dest?: string, replace?: boolean): Result<void> {
    const deployPath = underRoot(dest, `.agents/skills/${skillId}`);
    const destExists = isOk(this.fs.readFile(`${deployPath}/SKILL.md`));
    if (destExists && !replace) {
      return ok(undefined);
    }

    const npxFolder = underRoot(dest, `.agents/skills/${skillFolderName(skillId)}`);
    const npxExists = npxFolder !== deployPath && isOk(this.fs.readFile(`${npxFolder}/SKILL.md`));
    if (!npxExists) {
      if (replace) {
        return err(new Error(`Failed to replace skill '${skillId}': market copy was not downloaded.`));
      }
      return ok(undefined);
    }

    if (destExists && replace) {
      const cleared = this.fs.removeDir(deployPath);
      if (!isOk(cleared)) {
        return err(
          new Error(`Failed to replace skill '${skillId}' at ${deployPath}: ${cleared.error.message}`)
        );
      }
    }

    const copied = this.fs.copyDir(npxFolder, deployPath);
    if (!isOk(copied)) {
      return err(new Error(`Failed to place skill '${skillId}' in ${deployPath}: ${copied.error.message}`));
    }
    const removed = this.fs.removeDir(npxFolder);
    if (!isOk(removed)) {
      return err(new Error(`Failed to remove stray skill folder '${npxFolder}': ${removed.error.message}`));
    }
    return ok(undefined);
  }

  /**
   * Second half of a market install: mirror the fresh `.agents` copy into
   * the other live tree. Skips when there is nothing on disk to mirror
   * (an adapter that failed to deliver is surfaced by the empty hash, not
   * a copy error) or when the mirror already exists and this is not a
   * replace.
   */
  private mirrorLiveInstall(skillId: string, from: string, to: string, replace: boolean): Result<void> {
    if (!isOk(this.fs.readFile(`${from}/SKILL.md`))) {
      return ok(undefined);
    }
    const destExists = isOk(this.fs.readFile(`${to}/SKILL.md`));
    if (destExists) {
      if (!replace) {
        return ok(undefined);
      }
      const cleared = this.fs.removeDir(to);
      if (!isOk(cleared)) {
        return err(new Error(`Failed to replace skill '${skillId}' at ${to}: ${cleared.error.message}`));
      }
    }
    const copied = this.fs.copyDir(from, to);
    if (!isOk(copied)) {
      return err(new Error(`Failed to place skill '${skillId}' in ${to}: ${copied.error.message}`));
    }
    return ok(undefined);
  }

  /** Writes state to disk. Returns an error Result if the write fails; callers must check it rather than assume the mutation was saved. */
  private persist(): Result<void> {
    this.state.version = STATE_VERSION;
    return this.fs.writeJSON(STATE_PATH, this.state);
  }

  /**
   * Picks up skills already installed by external tooling (e.g. a bare
   * `npx skills add` run outside skil) so state stays in sync.
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

function listsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function catalogId(folder: string, root: string): string {
  if (folder === root) {
    return '.';
  }
  const prefix = `${root}/`;
  return folder.startsWith(prefix) ? folder.slice(prefix.length) : folder;
}

function skillRootOf(path: string): (typeof SKILL_ROOTS)[number] | undefined {
  return SKILL_ROOTS.find((root) => path === root || path.startsWith(`${root}/`));
}

function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '' : normalized.slice(0, index);
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

/** `.codex/rules/pair-programming/behavior.md` → `pair-programming/behavior`. */
function ruleNameFromLeftoverPath(path: string): string {
  const prefix = '.codex/rules/';
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return relative.replace(/\.md$/i, '');
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
