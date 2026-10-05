import type { SkillRecord } from '../../../shared/ipc';
import { skillPathState } from '../../../../../src/core/dock-layout.js';

export { skillPathState };

export function formatScannedAt(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export type InboxSkillSection = {
  key: string;
  label: string | null;
  skills: string[];
};

export type InboxSkillGroup = {
  key: 'market' | 'project';
  label: string;
  skills: string[];
  sections?: InboxSkillSection[];
};

export function skillParentFolder(id: string): string | null {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? null : id.slice(0, slash);
}

export function skillFileName(id: string): string {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? id : id.slice(slash + 1);
}

/** Card copy cap — long SKILL.md descriptions stay in preview, not the list. */
export const SKILL_CARD_DESC_MAX = 120;

export function shortSkillDescription(text: string, max = SKILL_CARD_DESC_MAX): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return '';
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > max * 0.5) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}…`;
}

/**
 * Nested project skills sit under their parent folder, same idea as
 * Commands stages / Rules folders. A root SKILL.md that also has
 * children (`build` + `build/increment`) stays in that folder section.
 */
export function groupProjectSkillsByFolder(ids: string[]): InboxSkillSection[] {
  const childParents = new Set(
    ids.map((id) => skillParentFolder(id)).filter((parent): parent is string => parent !== null)
  );
  const buckets = new Map<string, string[]>();
  for (const id of ids) {
    const parent = skillParentFolder(id);
    const key = parent ?? (childParents.has(id) ? id : '');
    const list = buckets.get(key);
    if (list) list.push(id);
    else buckets.set(key, [id]);
  }

  const folders = [...buckets.keys()].filter((key) => key !== '').sort((left, right) => left.localeCompare(right));
  const sections: InboxSkillSection[] = folders.map((key) => ({
    key,
    label: key,
    skills: buckets.get(key) ?? [],
  }));

  const root = buckets.get('');
  if (root && root.length > 0) {
    sections.push({
      key: '',
      label: sections.length === 0 ? null : 'Other',
      skills: root,
    });
  }
  return sections;
}

/**
 * Market vs Project is a filter over `source`, not "has a path" — a
 * market skill stays under Market after `+` writes it to disk. Only a
 * catalog row scanned off local disk (`source: 'local'`) is Project.
 * Project then splits into parent-folder sections.
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
    { key: 'project', label: 'Project', skills: project, sections: groupProjectSkillsByFolder(project) },
  ];
  return groups.filter((group) => group.skills.length > 0);
}
