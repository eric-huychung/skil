/**
 * skills.sh ids are often `owner/repo/skill`. `npx skills add owner/repo/skill`
 * treats the third segment as a repo-root folder and reports "No skills found"
 * when the skill lives under `skills/`. The CLI's `owner/repo@skill` form
 * works. Shared by `SkillsAdapter.install` (actually shells out) and the
 * market preview handler (the copy-paste command).
 *
 * Returns null when the result is not safe to pass to a shell or to `npx`
 * as one argument: spaces, quotes, `$()`, leading `-` (flag injection).
 */
const SAFE_SKILL_SOURCE = /^@?[A-Za-z0-9][A-Za-z0-9._@/-]{0,240}$/;

export function toSkillsAddSource(skillId: string): string | null {
  const parts = skillId.split('/').filter(Boolean);
  const source =
    parts.length >= 3 ? `${parts[0]}/${parts[1]}@${parts[parts.length - 1]}` : skillId;
  if (!SAFE_SKILL_SOURCE.test(source) || source.includes('..')) return null;
  return source;
}
