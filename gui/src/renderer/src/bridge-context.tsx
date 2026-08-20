import { createContext, useContext, type ReactNode } from 'react';
import type { ContextKitBridge } from '../../shared/ipc';

const BridgeContext = createContext<ContextKitBridge | null>(null);

/** Provides the `ContextKitBridge` to the component tree. Real app uses `window.contextkit`; tests inject a bridge backed by an in-memory engine. */
export function BridgeProvider({ bridge, children }: { bridge: ContextKitBridge; children: ReactNode }) {
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

/** Reads the `ContextKitBridge` from context. Components use this instead of touching `window.contextkit` directly, so they can be tested with an injected bridge. */
export function useBridge(): ContextKitBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error('useBridge must be used within a BridgeProvider');
  return bridge;
}
