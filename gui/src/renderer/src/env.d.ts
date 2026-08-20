/// <reference types="vite/client" />

import type { ContextKitBridge } from '../../shared/ipc';

declare global {
  interface Window {
    contextkit: ContextKitBridge;
  }
}
