import { createContext, useContext } from 'react';
import type { IDE } from '../../../shared/ipc';

export const CommandFormatContext = createContext<IDE>('cursor');

export function useCommandFormat(): IDE {
  return useContext(CommandFormatContext);
}
