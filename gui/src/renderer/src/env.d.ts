/// <reference types="vite/client" />

import type { SkilBridge } from '../../shared/ipc';

declare global {
  interface Window {
    skil: SkilBridge;
  }
}
