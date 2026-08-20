import type { Collection } from '../../../src/types/index.js';

export type { Collection };

/**
 * IPC channel names shared between the main process (handler registration)
 * and the preload script (invoke calls). Renderer code never sees channel
 * names directly — it only sees the typed `window.contextkit` bridge.
 */
export const IPC_CHANNELS = {
  listCollections: 'contextkit:list-collections',
} as const;

/** Shape of the bridge exposed to the renderer via `contextBridge`. */
export interface ContextKitBridge {
  listCollections(): Promise<Collection[]>;
}
