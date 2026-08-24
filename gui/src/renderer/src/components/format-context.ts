import { createContext, useContext } from 'react';
import type { IDE } from '../../../shared/ipc';

export const FORMAT_LABELS: Record<IDE, string> = {
  cursor: 'Cursor',
  claude: 'Claude Code',
  windsurf: 'Windsurf',
  agents: 'Agents',
};

export const CommandFormatContext = createContext<IDE>('cursor');

export function useCommandFormat(): IDE {
  return useContext(CommandFormatContext);
}
