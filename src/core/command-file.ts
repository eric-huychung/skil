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
const SKILLS_HEADING = /^## Skills\s*$/m;

export function isSkilStamped(contents: string): boolean {
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) {
    return false;
  }
  return new RegExp(`^${SKIL_STAMP}\\s*$`, 'm').test(match[1]);
}

export function parseStampedSkills(contents: string): string[] | null {
  if (!isSkilStamped(contents)) {
    return null;
  }
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) {
    return [];
  }
  const parsed = loadYaml(match[1]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const skills = (parsed as { skills?: unknown }).skills;
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills.filter((id): id is string => typeof id === 'string');
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
  const body = existing.replace(FRONTMATTER, '');
  const heading = body.search(SKILLS_HEADING);
  const zone = (heading === -1 ? body : body.slice(0, heading)).replace(/\r\n/g, '\n').trim();
  if (isManagedStub(zone)) {
    return STARTER_USER_ZONE;
  }
  return zone;
}

function isManagedStub(zone: string): boolean {
  return zone === '' || zone === OLD_STUB || zone === STARTER_USER_ZONE;
}
