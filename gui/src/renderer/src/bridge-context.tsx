import { createContext, useContext, type ReactNode } from 'react';
import type { SkilBridge } from '../../shared/ipc';
import { BootFailure } from './components/BootFailure';

const BridgeContext = createContext<SkilBridge | null>(null);

/** Provides the `SkilBridge` to the component tree. Real app uses `window.skil`; tests inject a bridge backed by an in-memory engine. */
export function BridgeProvider({ bridge, children }: { bridge?: SkilBridge; children: ReactNode }) {
  if (!bridge) {
    return <BootFailure />;
  }
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

/** Reads the `SkilBridge` from context. Components use this instead of touching `window.skil` directly, so they can be tested with an injected bridge. */
export function useBridge(): SkilBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error('useBridge must be used within a BridgeProvider');
  return bridge;
}
