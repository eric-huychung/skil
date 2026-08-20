import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection } from '../../../shared/ipc';

export default function CollectionList() {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, status] = await Promise.all([bridge.listCollections(), bridge.getStatus()]);
    setCollections(list);
    setActiveCollection(status.activeCollection);
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleActivate(name: string) {
    setError(null);
    const result = await bridge.activateCollection(name);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await refresh();
  }

  async function handleDeactivate() {
    setError(null);
    const result = await bridge.deactivateCollection();
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await refresh();
  }

  if (collections === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections yet</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {collections.map((collection) => {
            const isActive = collection.name === activeCollection;
            return (
              <li
                key={collection.name}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => handleActivate(collection.name)}
                  className={`rounded-sm text-left text-sm hover:underline ${FOCUS_RING}`}
                >
                  {collection.name}
                </button>
                {isActive && (
                  <div className="flex items-center gap-3">
                    <span role="status" className="text-xs font-medium text-foreground">
                      Active
                    </span>
                    <button
                      type="button"
                      onClick={handleDeactivate}
                      className={`rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${FOCUS_RING}`}
                    >
                      Deactivate
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
