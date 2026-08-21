import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Plus } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection } from '../../../shared/ipc';

export default function CreateCollectionForm({ onCreated }: { onCreated?: (collection: Collection) => void }) {
  const bridge = useBridge();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function close() {
    setOpen(false);
    setName('');
    setNameError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);

    const result = await bridge.createCollection(name, []);
    if (!result.ok) {
      setNameError(result.error.message);
      return;
    }

    close();
    onCreated?.(result.value);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  return (
    <div className="create-collection">
      <button
        type="button"
        className={`outline-button create-button ${FOCUS_RING}`}
        onClick={() => setOpen(true)}
      >
        <Plus size={15} weight="regular" aria-hidden="true" />
        Create New Collection
      </button>

      {open && (
        <div className="modal-backdrop" role="presentation" onClick={close}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-collection-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <p className="eyebrow">Workspace</p>
            <h2 id="create-collection-title">Create collection</h2>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="collection-name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="collection-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'collection-name-error' : undefined}
                  className={`rounded-md border border-input bg-transparent px-3 py-2 text-sm ${FOCUS_RING}`}
                />
                {nameError && (
                  <p id="collection-name-error" role="alert" className="text-sm text-destructive">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={close}>
                  Cancel
                </button>
                <button type="submit" className={`primary-button ${FOCUS_RING}`}>
                  Create collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
