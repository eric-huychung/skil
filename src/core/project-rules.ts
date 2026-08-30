import type { IFileSystemAdapter } from '../interfaces/adapters.js';
import type { RuleRecord } from '../types/index.js';
import { PARKED_RULES_ROOT } from './dock-layout.js';
import { err, isOk, ok, type Result } from './result.js';

/**
 * Shared law lives in one place: `AGENTS.md`. `setSharedRuleEnabled`
 * upserts or removes one of these sections. `CLAUDE.md` is expected to
 * be `@AGENTS.md` plus real Claude-only notes below that line — see
 * `leftoverAlwaysOnWarnings`.
 */
export const AGENTS_MD = 'AGENTS.md';
export const CLAUDE_MD = 'CLAUDE.md';
export const COPILOT_INSTRUCTIONS_MD = '.github/copilot-instructions.md';

/**
 * Path-scoped glob rule dirs a real dock actually loads by file glob —
 * left on disk exactly as found, read-only, never folded into
 * `AGENTS.md`, never toggled. `.codex/rules` and `.agents/rules` are
 * deliberately absent: Codex and the `agents` dock only read
 * `AGENTS.md`, so files under those dirs are leftover, not a real glob
 * rule root (see `leftoverAlwaysOnWarnings`).
 */
export const GLOB_RULE_DIRS: Record<string, { ext: string }> = {
  '.cursor/rules': { ext: '.mdc' },
  '.claude/rules': { ext: '.md' },
  '.github/instructions': { ext: '.instructions.md' },
  '.windsurf/rules': { ext: '.md' },
};

/** Root always-on files the watcher must cover (parent dir, non-recursive, filtered by filename). */
export const ROOT_RULE_FILES: string[] = [AGENTS_MD, CLAUDE_MD, COPILOT_INSTRUCTIONS_MD];

const SECTION_RE = /<!-- skil:rule ([^\s]+) -->\r?\n?([\s\S]*?)\r?\n?<!-- \/skil:rule \1 -->/g;

export function parseRuleSections(contents: string): Array<{ id: string; body: string }> {
  const found: Array<{ id: string; body: string }> = [];
  const re = new RegExp(SECTION_RE);
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

/** Removes one section, cleaning up the blank lines it leaves behind. */
export function removeRuleSection(contents: string, id: string): string {
  const re = new RegExp(
    `\\n*<!-- skil:rule ${escapeRegExp(id)} -->\\r?\\n?[\\s\\S]*?\\r?\\n?<!-- /skil:rule ${escapeRegExp(id)} -->\\n*`
  );
  return contents.replace(re, '\n\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

function parkedSharedRuleId(path: string): string {
  const prefix = `${PARKED_RULES_ROOT}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Shared-law rows: one per `AGENTS.md` section (`enabled: true`), plus
 * one per parked rule id with no live section (`enabled: false`) so an
 * off row still shows up. A parked id whose section is also live (a
 * stale park after a manual re-add) is deduped to the live row.
 */
export function collectSharedRules(fs: IFileSystemAdapter): Result<RuleRecord[]> {
  const rows: RuleRecord[] = [];
  const seen = new Set<string>();

  const agents = fs.readFile(AGENTS_MD);
  if (isOk(agents)) {
    for (const section of parseRuleSections(agents.value)) {
      rows.push({ id: section.id, name: section.id, kind: 'shared', path: AGENTS_MD, enabled: true });
      seen.add(section.id);
    }
  }

  const parked = fs.listAllFiles(PARKED_RULES_ROOT);
  if (!isOk(parked)) {
    return err(parked.error);
  }
  for (const path of parked.value) {
    const id = parkedSharedRuleId(path);
    if (seen.has(id)) {
      continue;
    }
    rows.push({ id, name: id, kind: 'shared', path: AGENTS_MD, enabled: false });
    seen.add(id);
  }

  return ok(rows);
}

function globRuleName(dir: string, path: string, ext: string): string {
  const relative = path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : path;
  return relative.endsWith(ext) ? relative.slice(0, -ext.length) : relative;
}

/** Path-scoped rule files, read-only. One row per file found under `GLOB_RULE_DIRS`. */
export function collectGlobRules(fs: IFileSystemAdapter): Result<RuleRecord[]> {
  const rows: RuleRecord[] = [];
  for (const [dir, { ext }] of Object.entries(GLOB_RULE_DIRS)) {
    const listed = fs.listAllFiles(dir);
    if (!isOk(listed)) {
      return err(listed.error);
    }
    for (const path of listed.value) {
      const base = path.slice(path.lastIndexOf('/') + 1);
      if (base.startsWith('.') || !base.endsWith(ext.endsWith('.md') ? '.md' : ext)) {
        continue;
      }
      rows.push({ id: path, name: globRuleName(dir, path, ext), kind: 'glob', path });
    }
  }
  return ok(rows);
}

/** Every rule row: shared law first, then glob files, both sorted by id. */
export function collectRules(fs: IFileSystemAdapter): Result<RuleRecord[]> {
  const shared = collectSharedRules(fs);
  if (!isOk(shared)) {
    return shared;
  }
  const glob = collectGlobRules(fs);
  if (!isOk(glob)) {
    return glob;
  }
  return ok([
    ...shared.value.sort((a, b) => a.id.localeCompare(b.id)),
    ...glob.value.sort((a, b) => a.id.localeCompare(b.id)),
  ]);
}

/**
 * Leftover always-on files that fight the shared-law pair. Warn only —
 * never rewritten, never folded into `AGENTS.md`. A path-scoped glob
 * rule (`.cursor/rules/*.mdc`, etc.) is never flagged here.
 */
export function leftoverAlwaysOnWarnings(fs: IFileSystemAdapter): string[] {
  const warnings: string[] = [];

  if (isOk(fs.readFile(COPILOT_INSTRUCTIONS_MD))) {
    warnings.push(`${COPILOT_INSTRUCTIONS_MD} is a leftover always-on file; shared law lives in ${AGENTS_MD}.`);
  }

  const claude = fs.readFile(CLAUDE_MD);
  if (isOk(claude) && !claude.value.trimStart().startsWith('@AGENTS.md')) {
    warnings.push(`${CLAUDE_MD} does not start with @AGENTS.md; it duplicates shared law instead of deferring to it.`);
  }

  const codexRules = fs.listAllFiles('.codex/rules');
  if (isOk(codexRules) && codexRules.value.length > 0) {
    warnings.push(`.codex/rules is not a real dock (Codex only reads ${AGENTS_MD}); those files are leftover.`);
  }

  const agents = fs.readFile(AGENTS_MD);
  if (isOk(agents) && isOk(claude)) {
    for (const section of parseRuleSections(agents.value)) {
      if (ruleBodiesEqual(section.body, claude.value)) {
        warnings.push(`${CLAUDE_MD} duplicates the "${section.id}" section already in ${AGENTS_MD}.`);
      }
    }
  }

  return warnings;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
