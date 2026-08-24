import type { Collection } from '../../../shared/ipc';

export const SDLC_STAGES = [
  { key: 'planning', label: 'Planning', names: ['planning'] },
  { key: 'build', label: 'Build', names: ['build'] },
  { key: 'testing', label: 'Testing', names: ['testing', 'test'] },
  { key: 'review', label: 'Review', names: ['review'] },
] as const;

export type CommandStageGroup = {
  key: string;
  label: string | null;
  commands: Collection[];
};

export function groupCommandsByStage(commands: Collection[]): CommandStageGroup[] {
  const used = new Set<string>();
  const groups: CommandStageGroup[] = [];

  for (const stage of SDLC_STAGES) {
    const matched = commands.filter((command) =>
      (stage.names as readonly string[]).includes(command.name)
    );
    if (matched.length === 0) continue;
    groups.push({ key: stage.key, label: stage.label, commands: matched });
    for (const command of matched) used.add(command.name);
  }

  const other = commands.filter((command) => !used.has(command.name));
  if (other.length === 0) return groups;

  groups.push({
    key: 'other',
    label: groups.length === 0 ? null : 'Other',
    commands: other,
  });
  return groups;
}
