import { load as loadYaml } from 'js-yaml';
import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import type { IDE, RuleRecord } from '../types/index.js';
import { err, isOk, ok, type Result } from './result.js';

/** How each dock actually loads rules. Dest paths come from this, not ad-hoc ifs. */
export type DockRuleLayout = {
  folder?: { dir: string; ext: string };
  root?: string;
  /** Folder copies also land in `root` (Codex/agents load AGENTS.md). */
  mergeFolderRulesIntoRoot?: boolean;
};

export const RULE_LAYOUT: Record<IDE, DockRuleLayout> = {
  cursor: { folder: { dir: '.cursor/rules', ext: '.mdc' }, root: 'AGENTS.md' },
  claude: { folder: { dir: '.claude/rules', ext: '.md' }, root: 'CLAUDE.md' },
  copilot: {
    folder: { dir: '.github/instructions', ext: '.instructions.md' },
    root: '.github/copilot-instructions.md',
  },
  windsurf: { folder: { dir: '.windsurf/rules', ext: '.md' } },
  codex: { folder: { dir: '.codex/rules', ext: '.md' }, root: 'AGENTS.md', mergeFolderRulesIntoRoot: true },
  agents: { folder: { dir: '.agents/rules', ext: '.md' }, root: 'AGENTS.md', mergeFolderRulesIntoRoot: true },
};

export const RULE_DIR_BY_IDE: Partial<Record<IDE, string>> = Object.fromEntries(
  (Object.entries(RULE_LAYOUT) as Array<[IDE, DockRuleLayout]>)
    .filter(([, layout]) => layout.folder)
    .map(([dock, layout]) => [dock, layout.folder!.dir])
);

/** Unique root files we walk. Dock is the product owner of that filename. */
export const ROOT_RULE_FILES: Array<{ path: string; dock: IDE }> = [
  { path: 'CLAUDE.md', dock: 'claude' },
  { path: 'AGENTS.md', dock: 'agents' },
  { path: '.github/copilot-instructions.md', dock: 'copilot' },
];

const ALWAYS_ON_ROOTS = new Set(ROOT_RULE_FILES.map((file) => file.path));

const FENCED_YAML = /^---\r?\n([\s\S]*?)\r?\n---/;

export type RuleDest = { mode: 'file'; path: string } | { mode: 'section'; path: string };

export function ruleExtension(ide: IDE): string {
  return RULE_LAYOUT[ide].folder?.ext ?? '.md';
}

export function collectRules(fs: IFileSystemAdapter, sourceRoot = ''): Result<RuleRecord[]> {
  const prefix = normalizeRoot(sourceRoot);
  const found: RuleRecord[] = [];

  for (const [dock, dir] of Object.entries(RULE_DIR_BY_IDE) as Array<[IDE, string]>) {
    const listed = fs.listAllFiles(underRoot(prefix, dir));
    if (!isOk(listed)) {
      return err(listed.error);
    }
    for (const readPath of listed.value) {
      const relative = stripPrefix(readPath, prefix);
      if (!isRuleFile(relative, dock)) {
        continue;
      }
      const contents = fs.readFile(readPath);
      if (!isOk(contents)) {
        return err(contents.error);
      }
      found.push(toRecord(relative, dock, contents.value));
    }
  }

  for (const rootFile of ROOT_RULE_FILES) {
    const readPath = underRoot(prefix, rootFile.path);
    const contents = fs.readFile(readPath);
    if (!isOk(contents)) {
      continue;
    }
    const sections = parseRuleSections(contents.value);
    for (const section of sections) {
      found.push(
        toRecord(rootFile.path, rootFile.dock, section.body, {
          id: `${rootFile.path}#${section.id}`,
          name: section.id,
        })
      );
    }
    if (sections.length === 0 || leftoverRootBody(contents.value).trim() !== '') {
      found.push(toRecord(rootFile.path, rootFile.dock, contents.value));
    }
  }

  found.sort((a, b) => a.id.localeCompare(b.id));
  return ok(found);
}

export function parseAlwaysApply(path: string, contents: string, id = path): boolean {
  if (ALWAYS_ON_ROOTS.has(path) && !id.includes('#')) {
    return true;
  }

  const yaml = extractFrontmatter(contents);
  if (yaml === null) {
    return path.startsWith('.claude/rules/');
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(yaml);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }

  const rec = parsed as Record<string, unknown>;
  if (rec.alwaysApply === true) return true;
  if (rec.alwaysApply === false) return false;
  if (typeof rec.applyTo === 'string' && (rec.applyTo === '**' || rec.applyTo === '*')) return true;
  if (Array.isArray(rec.paths) && rec.paths.length > 0) return false;
  return path.startsWith('.claude/rules/');
}

/** Root always-on files cannot toggle. Folder copies and AGENTS.md sections can. */
export function canToggleAlwaysApply(id: string): boolean {
  const path = rulePathFromId(id);
  if (ALWAYS_ON_ROOTS.has(path) && !id.includes('#')) {
    return false;
  }
  return true;
}

export function withAlwaysApply(contents: string, alwaysApply: boolean): string {
  return withFrontmatterKey(contents, 'alwaysApply', String(alwaysApply));
}

/** Stamp a dest copy. Same `generated_by: skil` key as command files. No clock. */
export function stampRule(contents: string, id: string, alwaysApply: boolean): string {
  return withFrontmatterKey(
    withFrontmatterKey(withAlwaysApply(contents, alwaysApply), 'id', id),
    'generated_by',
    'skil'
  );
}

export function destRuleTargets(source: RuleRecord, destDock: IDE): RuleDest[] {
  const layout = RULE_LAYOUT[destDock];
  if (ALWAYS_ON_ROOTS.has(rulePathFromId(source.id)) && !source.id.includes('#')) {
    return layout.root && layout.root === source.path ? [{ mode: 'file', path: layout.root }] : [];
  }
  const dests: RuleDest[] = [];
  if (layout.folder) {
    dests.push({ mode: 'file', path: `${layout.folder.dir}/${source.name}${layout.folder.ext}` });
  }
  if (layout.root && (layout.mergeFolderRulesIntoRoot || !layout.folder)) {
    dests.push({ mode: 'section', path: layout.root });
  }
  return dests;
}

/**
 * One card per rule name. Export already keys dest path off `name`, so
 * dock copies are deploys of the same rule, not new rules. Prefer a
 * Cursor `.mdc` so Always on still writes the native file.
 */
export function collapseRules(rules: RuleRecord[]): RuleRecord[] {
  const groups = new Map<string, RuleRecord[]>();
  for (const rule of rules) {
    const group = groups.get(rule.name) ?? [];
    group.push(rule);
    groups.set(rule.name, group);
  }

  return [...groups.values()]
    .map((group) => group.find((rule) => rule.path.endsWith('.mdc')) ?? group[0]!)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Rule files that belong to `dock` for import (same-dock copy). One row per path. */
export function importRulePathsForDock(dock: IDE, rules: RuleRecord[]): RuleRecord[] {
  const dir = RULE_DIR_BY_IDE[dock];
  const matched = rules.filter((rule) => {
    if (dir && (rule.path === dir || rule.path.startsWith(`${dir}/`))) {
      return true;
    }
    if (rule.path === 'AGENTS.md' && (dock === 'cursor' || dock === 'agents' || dock === 'codex')) {
      return true;
    }
    if (rule.path === 'CLAUDE.md' && dock === 'claude') {
      return true;
    }
    if (rule.path === '.github/copilot-instructions.md' && dock === 'copilot') {
      return true;
    }
    return false;
  });

  const seen = new Set<string>();
  return matched.filter((rule) => {
    if (seen.has(rule.path)) return false;
    seen.add(rule.path);
    return true;
  });
}

export function parseRuleSections(contents: string): Array<{ id: string; body: string }> {
  const found: Array<{ id: string; body: string }> = [];
  const re = /<!-- skil:rule ([^\s]+) -->\r?\n?([\s\S]*?)\r?\n?<!-- \/skil:rule \1 -->/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(contents)) !== null) {
    const id = match[1];
    if (!id) continue;
    found.push({ id, body: match[2] ?? '' });
  }
  return found;
}

export function readRuleSection(contents: string, id: string): string | null {
  return parseRuleSections(contents).find((section) => section.id === id)?.body ?? null;
}

export function ruleBodiesEqual(left: string, right: string): boolean {
  return left.replace(/\r\n/g, '\n').trim() === right.replace(/\r\n/g, '\n').trim();
}

export function upsertRuleSection(contents: string, id: string, body: string): string {
  const block = `<!-- skil:rule ${id} -->\n${body.trimEnd()}\n<!-- /skil:rule ${id} -->`;
  const re = new RegExp(
    `<!-- skil:rule ${escapeRegExp(id)} -->\\r?\\n?[\\s\\S]*?\\r?\\n?<!-- /skil:rule ${escapeRegExp(id)} -->`
  );
  if (re.test(contents)) {
    return contents.replace(re, block);
  }
  const trimmed = contents.replace(/\s+$/, '');
  return trimmed === '' ? `${block}\n` : `${trimmed}\n\n${block}\n`;
}

function leftoverRootBody(contents: string): string {
  return contents.replace(
    /<!-- skil:rule [^\s]+ -->\r?\n?[\s\S]*?\r?\n?<!-- \/skil:rule [^\s]+ -->\n*/g,
    ''
  );
}

function toRecord(
  path: string,
  dock: IDE,
  contents: string,
  override?: { id: string; name: string }
): RuleRecord {
  const id = override?.id ?? path;
  return {
    id,
    name: override?.name ?? ruleDisplayName(path, dock),
    path,
    dock,
    alwaysApply: parseAlwaysApply(path, contents, id),
    canToggle: canToggleAlwaysApply(id),
  };
}

function ruleDisplayName(path: string, dock: IDE): string {
  const dir = RULE_DIR_BY_IDE[dock];
  if (dir && path.startsWith(`${dir}/`)) {
    return stripKnownExt(path.slice(dir.length + 1));
  }
  const base = path.slice(path.lastIndexOf('/') + 1);
  return stripKnownExt(base);
}

function stripKnownExt(name: string): string {
  return name.replace(/\.instructions\.md$/i, '').replace(/\.mdc$/i, '').replace(/\.md$/i, '');
}

function isRuleFile(path: string, dock: IDE): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name.startsWith('.')) return false;
  if (dock === 'cursor') return name.endsWith('.mdc') || name.endsWith('.md');
  if (dock === 'copilot') {
    return name.endsWith('.instructions.md') || (name.endsWith('.md') && !name.endsWith('.prompt.md'));
  }
  return name.endsWith('.md');
}

function extractFrontmatter(contents: string): string | null {
  return contents.match(FENCED_YAML)?.[1] ?? null;
}

function withFrontmatterKey(contents: string, key: string, value: string): string {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/);
  if (!match) {
    return `---\n${key}: ${value}\n---\n\n${contents}`;
  }
  const yaml = match[1] ?? '';
  const rest = contents.slice(match[0].length);
  const line = new RegExp(`^${escapeRegExp(key)}:\\s*.*$`, 'm');
  const nextYaml = line.test(yaml) ? yaml.replace(line, `${key}: ${value}`) : `${yaml}\n${key}: ${value}`;
  return `---\n${nextYaml}\n---\n${rest}`;
}

function rulePathFromId(id: string): string {
  const hash = id.indexOf('#');
  return hash === -1 ? id : id.slice(0, hash);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '');
}

function underRoot(root: string, relative: string): string {
  if (!root) return relative;
  return `${root}/${relative}`;
}

function stripPrefix(path: string, prefix: string): string {
  if (!prefix) return path;
  const head = `${prefix}/`;
  return path.startsWith(head) ? path.slice(head.length) : path;
}
