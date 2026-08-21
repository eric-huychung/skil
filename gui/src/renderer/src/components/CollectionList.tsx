import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, Check, Trash, X } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection, IDE } from '../../../shared/ipc';

const IDE_OPTIONS: IDE[] = ['cursor', 'claude', 'windsurf'];

type ExportState = { status: 'success'; ide: IDE } | { status: 'error'; message: string };

function CollectionDetail({
  collection,
  onChange,
  onDeleted,
}: {
  collection: Collection;
  onChange: () => void;
  onDeleted: () => void;
}) {
  const bridge = useBridge();
  const [error, setError] = useState<string | null>(null);
  const [exportIde, setExportIde] = useState<IDE>('cursor');
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleRemoveSkill(skillId: string) {
    setError(null);
    const result = await bridge.removeSkillFromCollection(collection.name, skillId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onChange();
  }

  async function handleExport() {
    setError(null);
    setExportState(null);
    setIsExporting(true);
    const result = await bridge.exportCollections([collection.name], exportIde);
    setIsExporting(false);

    if (!result.ok) {
      setExportState({ status: 'error', message: result.error.message });
      return;
    }
    if (result.value.failures.length > 0) {
      setExportState({ status: 'error', message: result.value.failures.join('; ') });
      return;
    }
    setExportState({ status: 'success', ide: exportIde });
  }

  async function handleDelete() {
    setError(null);
    const result = await bridge.deleteCollection(collection.name);
    if (!result.ok) {
      setError(result.error.message);
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    onDeleted();
  }

  return (
    <section className="detail-panel panel-section" aria-label={`Collection ${collection.name} details`}>
      <div className="detail-header">
        <div>
          <p className="eyebrow">Collection / {collection.name}</p>
          <h2>{collection.name}</h2>
          <p className="muted-copy">
            {collection.skills.length === 1 ? '1 skill' : `${collection.skills.length} skills`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${collection.name}`}
          className={`delete-card detail-delete ${FOCUS_RING}`}
        >
          <Trash size={16} weight="regular" aria-hidden="true" />
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="target-row">
        <span>Target IDE</span>
        <label htmlFor={`export-ide-${collection.name}`} className="sr-only">
          {`Export ${collection.name} to`}
        </label>
        <select
          id={`export-ide-${collection.name}`}
          value={exportIde}
          onChange={(event) => setExportIde(event.target.value as IDE)}
          className={FOCUS_RING}
        >
          {IDE_OPTIONS.map((ide) => (
            <option key={ide} value={ide}>
              {ide.charAt(0).toUpperCase() + ide.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="active-skills">
        <div className="subheading">
          <span>Included skills</span>
          <span className="count-pill">{collection.skills.length}</span>
        </div>
        {collection.skills.map((skillId) => (
          <div className="included-skill" key={skillId}>
            <span className="checkmark" aria-hidden="true">
              <Check size={11} weight="regular" />
            </span>
            <span>{skillId}</span>
            <button
              type="button"
              onClick={() => handleRemoveSkill(skillId)}
              aria-label={`Remove ${skillId}`}
              className={FOCUS_RING}
            >
              <X size={14} weight="regular" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        aria-label={`Export ${collection.name}`}
        className={`primary-button export-button ${FOCUS_RING}`}
      >
        <ArrowDown size={16} weight="regular" />
        {isExporting ? 'Exporting…' : 'Export Collection'}
      </button>
      {!isExporting && exportState?.status === 'success' && (
        <p className="muted-copy">{`Exported to ${exportState.ide}`}</p>
      )}
      {!isExporting && exportState?.status === 'error' && (
        <p role="alert" className="muted-copy text-destructive">
          {exportState.message}
        </p>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmDelete(false)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-collection-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Collections</p>
            <h2 id="delete-collection-title">Delete {collection.name}?</h2>
            <p className="muted-copy">This cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => void handleDelete()}>
                Delete collection
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InboxList({
  ids,
  collections,
  onFiled,
}: {
  ids: string[];
  collections: Collection[];
  onFiled: () => void;
}) {
  const bridge = useBridge();
  const [target, setTarget] = useState(collections[0]?.name ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target && collections.some((collection) => collection.name === target)) return;
    setTarget(collections[0]?.name ?? '');
  }, [collections, target]);

  async function handleFile(skillId: string) {
    setError(null);
    if (!target) {
      setError('Create a collection to file Inbox items.');
      return;
    }
    const result = await bridge.fileToCollection(skillId, target);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onFiled();
  }

  return (
    <div className="inbox-list">
      <div className="subheading">
        <span>Inbox</span>
        <span className="count-pill">{ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <p className="muted-copy">Inbox is empty</p>
      ) : (
        <>
          {collections.length > 0 && (
            <div className="target-row inbox-target">
              <label htmlFor="inbox-file-target">File into</label>
              <select
                id="inbox-file-target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                className={FOCUS_RING}
              >
                {collections.map((collection) => (
                  <option key={collection.name} value={collection.name}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {ids.map((skillId) => (
            <div className="included-skill" key={skillId}>
              <span>{skillId}</span>
              <button
                type="button"
                onClick={() => void handleFile(skillId)}
                disabled={!target}
                aria-label={`File ${skillId} into ${target || 'a collection'}`}
                className={`text-button inbox-file ${FOCUS_RING}`}
              >
                File
              </button>
            </div>
          ))}
        </>
      )}
      {error && (
        <p role="alert" className="muted-copy text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function selectCollection(event: KeyboardEvent<HTMLLIElement>, name: string, onSelect: (name: string) => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(name);
  }
}

function CollectionsPanel({ children }: { children: ReactNode }) {
  return (
    <section className="collections-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Collections</h1>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function CollectionList({ children }: { children?: ReactNode }) {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [inbox, setInbox] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [next, nextInbox] = await Promise.all([bridge.listCollections(), bridge.listInbox()]);
    setCollections(next);
    setInbox(nextInbox);
    setSelectedName((current) => {
      if (current && next.some((collection) => collection.name === current)) return current;
      return next[0]?.name ?? null;
    });
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (collections === null) {
    return <CollectionsPanel>{children}</CollectionsPanel>;
  }

  const selected = collections.find((collection) => collection.name === selectedName) ?? null;

  return (
    <>
      <CollectionsPanel>
        {collections.length === 0 ? (
          <p className="muted-copy">No collections yet</p>
        ) : (
          <ul className="collection-list">
            {collections.map((collection) => (
              <li
                key={collection.name}
                aria-label={`Collection ${collection.name}`}
                aria-current={collection.name === selectedName ? 'true' : undefined}
                className={`collection-card ${collection.name === selectedName ? 'selected' : ''}`}
                tabIndex={0}
                onClick={() => setSelectedName(collection.name)}
                onKeyDown={(event) => selectCollection(event, collection.name, setSelectedName)}
              >
                <div className="card-title">
                  <span>{collection.name}</span>
                </div>
                <div className="skill-count">
                  <span>
                    {collection.skills.length} {collection.skills.length === 1 ? 'skill' : 'skills'}
                  </span>
                  <span className="mini-dot" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ul>
        )}
        <InboxList ids={inbox} collections={collections} onFiled={refresh} />
        {children}
      </CollectionsPanel>
      {selected && (
        <CollectionDetail collection={selected} onChange={refresh} onDeleted={refresh} />
      )}
    </>
  );
}
