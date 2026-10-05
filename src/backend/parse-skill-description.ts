import { load as loadYaml } from 'js-yaml';

const FENCED_YAML = /^---\r?\n([\s\S]*?)\r?\n---/;
const MAX_LENGTH = 500;

/**
 * Extracts the YAML frontmatter `description` from a SKILL.md file's
 * contents, for the market index's search field. No network — pure parse.
 * Missing frontmatter, missing/non-string `description`, or a parse
 * error all return `null`. A description over `MAX_LENGTH` is trimmed.
 */
export function parseSkillDescription(skillMdContents: string): string | null {
  const fenced = skillMdContents.match(FENCED_YAML);
  const yaml = fenced?.[1];
  if (yaml === undefined) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(yaml);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const description = (parsed as { description?: unknown }).description;
  if (typeof description !== 'string') {
    return null;
  }

  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.length > MAX_LENGTH ? trimmed.slice(0, MAX_LENGTH).trim() : trimmed;
}

const EXCERPT_MAX_LENGTH = 1_000;
/** A run of `|`-prefixed lines longer than this (header + separator + 4 rows) is dropped. */
const LONG_TABLE_MAX_LINES = 6;
const CODE_FENCE = /^\s*(```|~~~)/;
const TABLE_LINE = /^\s*\|/;

/** Drops fenced code blocks (an unclosed fence runs to the end) and tables over `LONG_TABLE_MAX_LINES`. */
function dropCodeAndLongTables(body: string): string {
  const kept: string[] = [];
  let fence: string | undefined;
  let table: string[] = [];

  const flushTable = () => {
    if (table.length <= LONG_TABLE_MAX_LINES) {
      kept.push(...table);
    }
    table = [];
  };

  for (const line of body.split(/\r?\n/)) {
    const fenceMarker = line.match(CODE_FENCE)?.[1];
    if (fence !== undefined) {
      if (fenceMarker === fence) {
        fence = undefined;
      }
      continue;
    }
    if (fenceMarker !== undefined) {
      flushTable();
      fence = fenceMarker;
      continue;
    }
    if (TABLE_LINE.test(line)) {
      table.push(line);
      continue;
    }
    flushTable();
    kept.push(line);
  }
  flushTable();

  return kept.join('\n');
}

/**
 * Builds the label excerpt Jev classifies on from a SKILL.md file's contents
 * (design §4.3). No network — pure parse. Strips frontmatter, drops code
 * fences and long tables, collapses whitespace, and caps at
 * `EXCERPT_MAX_LENGTH` chars cut at a word boundary. Nothing left is `null`.
 */
export function parseSkillExcerpt(skillMdContents: string): string | null {
  const body = skillMdContents.replace(FENCED_YAML, '');
  const text = dropCodeAndLongTables(body).replace(/\s+/g, ' ').trim();
  if (text.length === 0) {
    return null;
  }
  if (text.length <= EXCERPT_MAX_LENGTH) {
    return text;
  }

  const cut = text.lastIndexOf(' ', EXCERPT_MAX_LENGTH);
  return (cut > 0 ? text.slice(0, cut) : text.slice(0, EXCERPT_MAX_LENGTH)).trim();
}
