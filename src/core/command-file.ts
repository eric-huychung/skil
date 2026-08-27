import { load as loadYaml } from 'js-yaml';

export const SKIL_STAMP = 'generated_by: skil';

const STARTER_USER_ZONE = `## Goal
<!-- Describe what this command is for. -->

## Sequence
<!-- Ordered must-follow steps. Skills below are extras, not extra phases. -->

## Rules
<!-- Constraints the agent must not break. -->`;

const OLD_STUB = `1. Use the skills listed in frontmatter when they apply.
2. Do not invent extra required steps.`;

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const FENCED_YAML = /^---\r?\n([\s\S]*?)\r?\n---/;
const STAMP_LINE = new RegExp(`^${SKIL_STAMP}\\s*$`, 'm');
const SKILLS_HEADING = /^## Skills\s*$/m;
const BODY_HEADING = /^## (?!name\s*:)/m;

export function isSkilStamped(contents: string): boolean {
  return stampYaml(contents) !== null;
}

/** True only when the stamp is closed YAML (`---` … `generated_by: skil` … `---`). */
export function isClosedSkilStamp(contents: string): boolean {
  const fenced = contents.match(FENCED_YAML);
  return fenced?.[1] !== undefined && STAMP_LINE.test(fenced[1]);
}

export function parseStampedSkills(contents: string): string[] | null {
  const yaml = stampYaml(contents);
  if (yaml === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = loadYaml(yaml);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const skills = (parsed as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills.filter((id): id is string => typeof id === 'string');
}

function stampYaml(contents: string): string | null {
  const fenced = contents.match(FENCED_YAML);
  if (fenced?.[1] !== undefined) {
    return STAMP_LINE.test(fenced[1]) ? fenced[1] : null;
  }
  if (!/^---\r?\n/.test(contents) || !STAMP_LINE.test(contents)) {
    return null;
  }
  const after = contents.replace(/^---\r?\n/, '');
  const cut = after.search(BODY_HEADING);
  const region = cut === -1 ? after : after.slice(0, cut);
  return STAMP_LINE.test(region) ? region : null;
}

export function writeCommandFile(
  name: string,
  skills: string[],
  existing?: string,
  opts?: { reset?: boolean }
): string {
  const userZone = opts?.reset || !existing ? STARTER_USER_ZONE : userZoneFromExisting(existing);
  return `${renderFrontmatter(name, skills)}\n${userZone}\n\n${skillsSection(skills)}\n`;
}

function renderFrontmatter(name: string, skills: string[]): string {
  const skillLines =
    skills.length === 0 ? 'skills: []' : `skills:\n${skills.map((id) => `  - ${id}`).join('\n')}`;
  return `---
name: /${name}
${skillLines}
${SKIL_STAMP}
generated_at: ${new Date().toISOString()}
---
`;
}

function skillsSection(skills: string[]): string {
  if (skills.length === 0) {
    return `## Skills
When they apply, read and follow. None filed yet.`;
  }
  return `## Skills
When they apply, read and follow:
${skills.map((id) => `- \`${id}\``).join('\n')}`;
}

function userZoneFromExisting(existing: string): string {
  const body = stripFrontmatter(existing);
  const heading = body.search(SKILLS_HEADING);
  const zone = (heading === -1 ? body : body.slice(0, heading)).replace(/\r\n/g, '\n').trim();
  if (isManagedStub(zone)) {
    return STARTER_USER_ZONE;
  }
  return zone;
}

function stripFrontmatter(existing: string): string {
  const fenced = existing.match(FRONTMATTER);
  if (fenced) {
    return existing.slice(fenced[0].length);
  }
  if (!/^---\r?\n/.test(existing) || !STAMP_LINE.test(existing)) {
    return existing;
  }
  const after = existing.replace(/^---\r?\n/, '');
  const cut = after.search(BODY_HEADING);
  return cut === -1 ? '' : after.slice(cut);
}

function isManagedStub(zone: string): boolean {
  return zone === '' || zone === OLD_STUB || zone === STARTER_USER_ZONE;
}
