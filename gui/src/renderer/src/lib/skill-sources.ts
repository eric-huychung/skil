import type { IDE, SkillRecord } from '../../../shared/ipc';
import {
  SKILL_SOURCES,
  SKILL_SOURCE_BY_IDE,
  skillPathState,
  type SkillSourceFolder,
} from '../../../../../src/core/dock-layout.js';

export { SKILL_SOURCES, skillPathState, type SkillSourceFolder };

export const SOURCE_BY_IDE: Record<IDE, SkillSourceFolder> = SKILL_SOURCE_BY_IDE;

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

/**
 * Market vs Project is a filter over `source`, not "has a path" — a
 * market skill stays under Market after `+` writes it to disk. Only a
 * catalog row scanned off local disk (`source: 'local'`) is Project.
 */
export function groupInboxSkills(
  inbox: string[],
  catalog: Array<Pick<SkillRecord, 'id' | 'source'>>
): InboxSkillGroup[] {
  const sourceById = new Map(catalog.map((skill) => [skill.id, skill.source]));
  const market: string[] = [];
  const project: string[] = [];
  for (const id of inbox) {
    if (sourceById.get(id) === 'local') project.push(id);
    else market.push(id);
  }
  const groups: InboxSkillGroup[] = [
    { key: 'market', label: 'Market', skills: market },
    { key: 'project', label: 'Project', skills: project },
  ];
  return groups.filter((group) => group.skills.length > 0);
}
