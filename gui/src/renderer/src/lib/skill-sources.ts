export const SKILL_SOURCES = ['.cursor', '.claude', '.windsurf', '.agents'] as const;

export type SkillSourceFolder = (typeof SKILL_SOURCES)[number];

export function countSkillsBySource(
  skills: Array<{ paths: string[] }>
): Array<{ source: SkillSourceFolder; count: number }> {
  return SKILL_SOURCES.map((source) => ({
    source,
    count: skills.filter((skill) =>
      skill.paths.some((path) => path === source || path.startsWith(`${source}/`))
    ).length,
  }));
}

export function formatScannedAt(date: Date | null): string {
  if (!date) return 'Never';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
