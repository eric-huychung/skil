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
