import { load as loadYaml } from 'js-yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Drop leading YAML (Cursor `.mdc` / SKILL.md). Body-only markdown is unchanged. */
export function stripFrontmatter(contents: string): string {
  return contents.replace(FRONTMATTER_RE, '').trim();
}

/** Rough char/4 token estimate — a relative warn signal, not a billing number. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Pulls the YAML `description:` field out of SKILL.md frontmatter. Malformed/missing frontmatter is `''`, not a crash. */
export function parseDescription(contents: string): string {
  const match = contents.match(FRONTMATTER_RE);
  if (!match?.[1]) {
    return '';
  }
  try {
    const parsed = loadYaml(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const description = (parsed as { description?: unknown }).description;
      return typeof description === 'string' ? description : '';
    }
  } catch {
    // malformed frontmatter — no description found, not a crash
  }
  return '';
}
