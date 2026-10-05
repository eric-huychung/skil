import { useEffect, useState } from 'react';
import { FOCUS_RING } from '../lib/focus-ring';
import type { DriftAction, SyncAudit, SyncRow } from '../../../shared/ipc';
import ConfirmModal from './ConfirmModal';
import SyncCompareDialog from './SyncCompareDialog';

export function syncBannerText(audit: SyncAudit): string {
  const n = audit.rows.length;
  const leftovers = `${n} ${n === 1 ? 'leftover' : 'leftovers'}`;
  if (audit.driftCount === 0) return leftovers;
  const conflicts = `${audit.driftCount} ${audit.driftCount === 1 ? 'conflict' : 'conflicts'}`;
  if (audit.driftCount === n) return conflicts;
  return `${leftovers} · ${conflicts}`;
}

export default function SyncCleanupModal({
  audit,
  busy,
  error,
  onClose,
  onImport,
  onRemove,
  onResolveDrift,
}: {
  audit: SyncAudit;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onImport: (ids: string[]) => void;
  onRemove: (paths: string[]) => void;
  onResolveDrift: (id: string, action: DriftAction, path: string) => void;
}) {
  const needsImport = audit.rows.filter((row) => row.status === 'needs-import');
  const ready = audit.rows.filter((row) => row.status === 'ready-to-remove');
  const drift = audit.rows.filter((row) => row.status === 'drift');
  const readyKey = ready.map((row) => row.path).join('\0');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ready.map((row) => row.path)));
  const [comparePath, setComparePath] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string[] | null>(null);

  useEffect(() => {
    setSelected(new Set(readyKey === '' ? [] : readyKey.split('\0')));
  }, [readyKey]);

  useEffect(() => {
    if (comparePath && !audit.rows.some((row) => row.path === comparePath && row.status === 'drift')) {
      setComparePath(null);
    }
  }, [audit, comparePath]);

  function togglePath(path: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  const allReadySelected = ready.length > 0 && ready.every((row) => selected.has(row.path));
  const selectedReady = ready.filter((row) => selected.has(row.path)).map((row) => row.path);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="help-modal sync-cleanup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-cleanup-title"
        aria-describedby="sync-cleanup-lede"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sync-cleanup-header">
          <h2 id="sync-cleanup-title">Cleanup</h2>
          <p id="sync-cleanup-lede" className="muted-copy">
            Drop extra copies so agents read from .agents and .claude.
          </p>
          <p className="muted-copy">{syncBannerText(audit)}</p>
        </header>
        {error && (
          <p role="alert" className="muted-copy text-destructive">
            {error}
          </p>
        )}

        <div className="sync-cleanup-body">
          {needsImport.length > 0 && (
            <section className="sync-cleanup-section" aria-labelledby="needs-import-heading">
              <div className="sync-cleanup-head">
                <h3 id="needs-import-heading">Needs import ({needsImport.length})</h3>
                <button
                  type="button"
                  className={`outline-button ${FOCUS_RING}`}
                  disabled={busy}
                  onClick={() => onImport(needsImport.map((row) => row.id))}
                >
                  Import all
                </button>
              </div>
              <ul className="sync-cleanup-list" aria-label="Needs import">
                {needsImport.map((row) => (
                  <li key={row.path}>
                    <KindBadge row={row} />
                    <span className="sync-cleanup-path">{row.path}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ready.length > 0 && (
            <section className="sync-cleanup-section" aria-labelledby="ready-heading">
              <div className="sync-cleanup-head">
                <h3 id="ready-heading">Safe to remove ({ready.length})</h3>
                <label className="sync-cleanup-select-all">
                  <input
                    type="checkbox"
                    checked={allReadySelected}
                    disabled={busy}
                    aria-label="Select all ready to remove"
                    onChange={() => {
                      setSelected(allReadySelected ? new Set() : new Set(ready.map((row) => row.path)));
                    }}
                  />
                  Select all
                </label>
              </div>
              <ul className="sync-cleanup-list sync-cleanup-checklist" aria-label="Ready to remove">
                {ready.map((row) => (
                  <li key={row.path}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(row.path)}
                        disabled={busy}
                        onChange={() => togglePath(row.path)}
                      />
                      <KindBadge row={row} />
                      <span className="sync-cleanup-path">{row.path}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {drift.length > 0 && (
            <section className="sync-cleanup-section" aria-labelledby="conflicts-heading">
              <h3 id="conflicts-heading">Conflicts ({drift.length})</h3>
              <ul className="sync-cleanup-list" aria-label="Conflicts">
                {drift.map((row) => (
                  <li key={row.path} className="sync-conflict-card">
                    <button
                      type="button"
                      className={`sync-conflict-open ${FOCUS_RING}`}
                      aria-label={`Compare ${row.id}`}
                      onClick={() => setComparePath(row.path)}
                    />
                    <div className="sync-conflict-body">
                      <div className="sync-conflict-top">
                        <p className="sync-conflict-id">{row.id}</p>
                        <KindBadge row={row} />
                      </div>
                      <p className="sync-cleanup-path">{row.path}</p>
                      <p className="sync-conflict-hint">Doesn't match the live copy</p>
                    </div>
                    <div className="sync-cleanup-drift-actions">
                      <button
                        type="button"
                        className={`outline-button ${FOCUS_RING}`}
                        disabled={busy}
                        onClick={() => onResolveDrift(row.id, 'keep-live', row.path)}
                      >
                        Keep current
                      </button>
                      <button
                        type="button"
                        className={`outline-button ${FOCUS_RING}`}
                        disabled={busy}
                        onClick={() => onResolveDrift(row.id, 'import', row.path)}
                      >
                        Use leftover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className={`outline-button ${FOCUS_RING}`} disabled={busy} onClick={onClose}>
            Close
          </button>
          {ready.length > 0 && (
            <button
              type="button"
              className={`outline-button ${FOCUS_RING}`}
              disabled={busy || selectedReady.length === 0}
              onClick={() => setPendingRemove(selectedReady)}
            >
              Remove leftovers
            </button>
          )}
        </div>
      </div>
      {pendingRemove && pendingRemove.length > 0 && (
        <ConfirmModal
          eyebrow="Sync"
          titleId="remove-leftovers-title"
          title={`Remove ${pendingRemove.length} ${pendingRemove.length === 1 ? 'leftover' : 'leftovers'}?`}
          confirmLabel="Remove leftovers"
          confirmDisabled={busy}
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            const paths = pendingRemove;
            setPendingRemove(null);
            onRemove(paths);
          }}
        >
          <p className="muted-copy">
            We&apos;ll move them under <span className="sync-cleanup-path">.skil/deprecated/</span>. Check there if
            you need to restore them.
          </p>
        </ConfirmModal>
      )}
      {comparePath && <SyncCompareDialog path={comparePath} onClose={() => setComparePath(null)} />}
    </div>
  );
}

function KindBadge({ row }: { row: SyncRow }) {
  return <span className="leftover-kind">{row.kind}</span>;
}
