/**
 * skills.sh ids are often `owner/repo/skill`. `npx skills add owner/repo/skill`
 * treats the third segment as a repo-root folder and reports "No skills found"
 * when the skill lives under `skills/`. The CLI's `owner/repo@skill` form
 * works. Shared by `SkillsAdapter.install` (actually shells out) and the
 * market preview handler (just displays the copy-paste command).
 */
export function toSkillsAddSource(skillId: string): string {
  const parts = skillId.split('/').filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]}/${parts[1]}@${parts[parts.length - 1]}`;
  }
  return skillId;
}
