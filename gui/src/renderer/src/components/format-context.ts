import type { IDE } from '../../../shared/ipc';

export const FORMAT_LABELS: Record<IDE, string> = {
  cursor: 'Cursor',
  claude: 'Claude Code',
  codex: 'Codex',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
  agents: 'Agents',
};

/** Docks offered on Sync's Import format picker. */
export const IDE_OPTIONS: IDE[] = ['cursor', 'claude', 'codex', 'copilot', 'agents', 'windsurf'];

/** Last path segment, for showing a dest folder next to a dock name. */
export function folderName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path;
}
