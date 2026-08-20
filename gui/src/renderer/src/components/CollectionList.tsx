import { useCallback, useEffect, useState } from 'react';
import { useBridge } from '../bridge-context';
import type { Collection } from '../../../shared/ipc';

export default function CollectionList() {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, status] = await Promise.all([bridge.listCollections(), bridge.getStatus()]);
    setCollections(list);
    setActiveCollection(status.activeCollection);
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (collections === null) {
    return null;
  }

  if (collections.length === 0) {
    return <p className="text-sm text-muted-foreground">No collections yet</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {collections.map((collection) => {
        const isActive = collection.name === activeCollection;
        return (
          <li
            key={collection.name}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2"
          >
            <span className="text-sm">{collection.name}</span>
            {isActive && (
              <span className="text-xs font-medium text-foreground" role="status">
                Active
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
