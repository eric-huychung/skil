import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowsClockwise, CaretDown, Check, Plus, Trash, X } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection, IDE, ScanResult } from '../../../shared/ipc';

const IDE_OPTIONS: IDE[] = ['cursor', 'claude', 'windsurf'];

type ExportState = { status: 'success'; ide: IDE } | { status: 'error'; message: string };

function CollectionDetail({
  collection,
  inbox,
  onChange,
  onDeleted,
}: {
  collection: Collection;
  inbox: string[];
  onChange: () => void;
  onDeleted: () => void;
}) {
  const bridge = useBridge();
  const [error, setError] = useState<string | null>(null);
  const [exportIde, setExportIde] = useState<IDE>('cursor');
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);
  const inboxPickerId = `inbox-picker-${collection.name}`;

  async function handleAddFromInbox(skillId: string) {
    setError(null);
    const result = await bridge.addSkill(collection.name, skillId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onChange();
  }

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

      {inbox.length > 0 && (
        <div className="active-skills inbox-picker">
          <button
            type="button"
            className={`inbox-toggle ${FOCUS_RING}`}
            aria-expanded={inboxOpen}
            aria-controls={inboxPickerId}
            aria-label={`From Inbox, ${inbox.length === 1 ? '1 skill' : `${inbox.length} skills`}`}
            onClick={() => setInboxOpen((open) => !open)}
          >
            <span>From Inbox</span>
            <span className="count-pill">{inbox.length}</span>
            <CaretDown className="inbox-caret" size={14} weight="regular" aria-hidden="true" />
          </button>
          <div id={inboxPickerId} hidden={!inboxOpen} className="inbox-picker-list">
            {inbox.map((skillId) => {
              const added = collection.skills.includes(skillId);
              return (
                <div className="library-skill" key={skillId}>
                  <div className="skill-info">
                    <div className="skill-name">{skillId}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAddFromInbox(skillId)}
                    aria-label={added ? `Added ${skillId}` : `Add ${skillId} to ${collection.name}`}
                    aria-pressed={added}
                    className={`add-icon-button ${FOCUS_RING}`}
                  >
                    {added ? (
                      <Check size={16} weight="regular" aria-hidden="true" />
                    ) : (
                      <Plus size={16} weight="regular" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
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
        {collection.skills.length === 0 && <p className="muted-copy">No skills in this collection yet</p>}
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

function selectCollection(event: KeyboardEvent<HTMLLIElement>, name: string, onSelect: (name: string) => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(name);
  }
}

function goneMessage(ids: string[]): string {
  return `Gone: ${ids.join(', ')}`;
}

function CollectionsPanel({
  children,
  canScan,
  scanning,
  scanError,
  lastScan,
  onScan,
}: {
  children: ReactNode;
  canScan: boolean;
  scanning: boolean;
  scanError: string | null;
  lastScan: ScanResult | null;
  onScan: () => void;
}) {
  return (
    <section className="collections-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Collections</h1>
        </div>
        <button
          type="button"
          className={`outline-button scan-button ${FOCUS_RING}`}
          onClick={onScan}
          disabled={!canScan || scanning}
          aria-label={canScan ? 'Scan' : 'Scan (connect a folder first)'}
        >
          <ArrowsClockwise size={16} weight="regular" aria-hidden="true" />
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
      </div>
      {!canScan && (
        <p className="muted-copy scan-hint">Connect a project folder to scan</p>
      )}
      {scanError && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {scanError}
        </p>
      )}
      {lastScan && lastScan.gone.length > 0 && (
        <p role="status" aria-atomic="true" className="scan-gone">
          {goneMessage(lastScan.gone)}
        </p>
      )}
      {children}
    </section>
  );
}

export default function CollectionList({ children }: { children?: ReactNode }) {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [inbox, setInbox] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void bridge.getProjectRoot().then((root) => {
      if (!cancelled) setCanScan(root !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const handleScan = useCallback(async () => {
    if (!canScan) return;
    setScanError(null);
    setScanning(true);
    const result = await bridge.scan();
    setScanning(false);
    if (!result.ok) {
      setScanError(result.error.message);
      return;
    }
    setLastScan(result.value);
    await refresh();
  }, [bridge, canScan, refresh]);

  const panelProps = { canScan, scanning, scanError, lastScan, onScan: () => void handleScan() };

  if (collections === null) {
    return <CollectionsPanel {...panelProps}>{children}</CollectionsPanel>;
  }

  const selected = collections.find((collection) => collection.name === selectedName) ?? null;

  return (
    <>
      <CollectionsPanel {...panelProps}>
        <div className="inbox-inventory">
          <div className="subheading">
            <h2 className="inbox-heading">Inbox</h2>
            <span className="count-pill">{inbox.length}</span>
          </div>
          {inbox.length === 0 ? (
            <p className="muted-copy">
              {canScan
                ? 'No unfiled skills'
                : 'No unfiled skills. Add from Discover, or connect a folder and scan.'}
            </p>
          ) : (
            <ul className="inbox-inventory-list">
              {inbox.map((skillId) => (
                <li key={skillId}>{skillId}</li>
              ))}
            </ul>
          )}
        </div>
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
        {children}
      </CollectionsPanel>
      {selected && (
        <CollectionDetail collection={selected} inbox={inbox} onChange={refresh} onDeleted={refresh} />
      )}
    </>
  );
}
