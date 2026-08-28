import type { IDE } from '../../../shared/ipc';

export const SKILL_SOURCES = ['.cursor', '.claude', '.codex', '.github', '.agents', '.windsurf'] as const;

export type SkillSourceFolder = (typeof SKILL_SOURCES)[number];

export const SOURCE_BY_IDE: Record<IDE, SkillSourceFolder> = {
  cursor: '.cursor',
  claude: '.claude',
  codex: '.codex',
  copilot: '.github',
  windsurf: '.windsurf',
  agents: '.agents',
};

function skillIsUnderSource(paths: string[], source: SkillSourceFolder): boolean {
  return paths.some((path) => path === source || path.startsWith(`${source}/`));
}

export function countSkillsBySource(
  skills: Array<{ paths: string[] }>
): Array<{ source: SkillSourceFolder; count: number }> {
  return SKILL_SOURCES.map((source) => ({
    source,
    count: skills.filter((skill) => skillIsUnderSource(skill.paths, source)).length,
  }));
}

/** Catalog skills on disk for one IDE. Independent of command membership. */
export function skillCountForIde(skills: Array<{ paths: string[] }>, ide: IDE): number {
  const source = SOURCE_BY_IDE[ide];
  return skills.filter((skill) => skillIsUnderSource(skill.paths, source)).length;
}

/** Unique skills filed onto an IDE's commands. Independent of disk catalog. */
export function filedSkillCount(collections: Array<{ skills: string[] }>): number {
  return new Set(collections.flatMap((collection) => collection.skills)).size;
}

export function formatScannedAt(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export type InboxSkillGroup = {
  key: 'market' | 'project';
  label: string;
  skills: string[];
};

export function groupInboxSkills(
  inbox: string[],
  catalog: Array<{ id: string; paths: string[] }>
): InboxSkillGroup[] {
  const onDisk = new Set(catalog.filter((skill) => skill.paths.length > 0).map((skill) => skill.id));
  const market: string[] = [];
  const project: string[] = [];
  for (const id of inbox) {
    if (onDisk.has(id)) project.push(id);
    else market.push(id);
  }
  const groups: InboxSkillGroup[] = [
    { key: 'market', label: 'Market', skills: market },
    { key: 'project', label: 'Project', skills: project },
  ];
  return groups.filter((group) => group.skills.length > 0);
}
