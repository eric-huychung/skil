import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  ArrowClockwise,
  CircleNotch,
  ToggleLeft,
  ToggleRight,
} from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { groupInboxSkills, skillPathState } from '../lib/skill-sources';
import type { OriginCheck, OriginStatus, ScanResult, SkillRecord } from '../../../shared/ipc';
import { StatusNotice, StatusSkeleton } from '../../../../../shared/status';
import SkillPreviewDialog from './SkillPreviewDialog';

const PAGE_SIZE = 25;

function goneMessage(ids: string[]): string {
  return `Gone: ${ids.join(', ')}`;
}

function matchesQuery(skillId: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length === 0 || skillId.toLowerCase().includes(needle);
}

const ORIGIN_BADGE: Record<OriginStatus, { label: string; className: string }> = {
  current: { label: 'Synced', className: 'origin-badge bg-emerald-500/15 text-emerald-500' },
  update: { label: 'New copy', className: 'origin-badge bg-amber-500/15 text-amber-500' },
  edited: { label: 'Edited', className: 'origin-badge bg-amber-500/15 text-amber-500' },
};

/**
 * On/off is a path, not a flag — read straight off `record.paths` via
 * `skillPathState`. Toggling is the write; there is nothing else to
 * confirm first. Hidden for a wishlist id with no catalog row yet.
 */
function SkillToggle({
  record,
  busy,
  onToggle,
}: {
  record: SkillRecord | undefined;
  busy: boolean;
  onToggle: () => void;
}) {
  if (!record) return null;
  const on = skillPathState(record.paths) === 'on';
  return (
    <button
      type="button"
      className={`always-on-toggle ${on ? 'on' : 'off'} ${FOCUS_RING}`}
      aria-pressed={on}
      aria-busy={busy || undefined}
      disabled={busy}
      aria-label={on ? `Turn off ${record.id}` : `Turn on ${record.id}`}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {on ? (
        <ToggleRight size={18} weight="fill" aria-hidden="true" />
      ) : (
        <ToggleLeft size={18} weight="regular" aria-hidden="true" />
      )}
      {on ? 'On' : 'Off'}
    </button>
  );
}

export default function InboxPanel() {
  const bridge = useBridge();
  const [catalog, setCatalog] = useState<SkillRecord[] | null>(null);
  const [originById, setOriginById] = useState<Record<string, OriginStatus>>({});
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [canScan, setCanScan] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{ id: string; replaceEdited: boolean } | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleErrorId, setToggleErrorId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextCatalog, nextChecks] = await Promise.all([bridge.listSkills(), bridge.originChecks()]);
    setCatalog(nextCatalog);
    const checks: OriginCheck[] = nextChecks.ok ? nextChecks.value : [];
    setOriginById(Object.fromEntries(checks.map((check) => [check.skillId, check.status])));
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return bridge.onScan((result) => {
      setLastScan(result);
      void refresh();
    });
  }, [bridge, refresh]);

  useEffect(() => {
    let cancelled = false;
    void bridge.getProjectRoot().then((root) => {
      if (!cancelled) setCanScan(root !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const ids = useMemo(() => (catalog ?? []).map((skill) => skill.id), [catalog]);
  const matches = useMemo(() => ids.filter((skillId) => matchesQuery(skillId, query)), [ids, query]);
  const groups = useMemo(() => groupInboxSkills(matches, catalog ?? []), [matches, catalog]);
  const ordered = useMemo(() => groups.flatMap((group) => group.skills), [groups]);
  const pageCount = ordered.length > 0 ? Math.ceil(ordered.length / PAGE_SIZE) : 0;
  const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const visibleStart = safePage * PAGE_SIZE;
  const visibleIds = ordered.slice(visibleStart, visibleStart + PAGE_SIZE);
  const visibleSet = new Set(visibleIds);
  const visibleGroups = groups
    .map((group) => ({ ...group, skills: group.skills.filter((id) => visibleSet.has(id)) }))
    .filter((group) => group.skills.length > 0);

  const pendingRecord = pendingDelete ? (catalog ?? []).find((skill) => skill.id === pendingDelete) : undefined;
  const pendingPaths = pendingRecord?.paths ?? [];
  const pendingNested = pendingDelete
    ? (catalog ?? []).filter((skill) => skill.id.startsWith(`${pendingDelete}/`)).map((skill) => skill.id)
    : [];
  const selectedRecord = selectedId ? (catalog ?? []).find((skill) => skill.id === selectedId) : undefined;
  const previewSource = selectedRecord && selectedRecord.paths.length > 0 ? 'local' : 'market';

  useEffect(() => {
    if (!pendingDelete && !pendingUpdate) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (isUpdating) return;
        if (pendingUpdate) closeUpdate();
        else closeDelete();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pendingDelete, pendingUpdate, isUpdating]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(0);
  }

  function closeDelete() {
    setPendingDelete(null);
    setDeleteError(false);
  }

  function closeUpdate() {
    if (isUpdating) return;
    setPendingUpdate(null);
    setUpdateError(false);
  }

  async function handleUpdate() {
    if (!pendingUpdate || isUpdating) return;
    setUpdateError(false);
    setIsUpdating(true);
    const result = await bridge.updateFromMarket(pendingUpdate.id, {
      replaceEdited: pendingUpdate.replaceEdited,
    });
    if (!result.ok) {
      setUpdateError(true);
      setIsUpdating(false);
      return;
    }
    setPendingUpdate(null);
    setSelectedId(null);
    setIsUpdating(false);
    await refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleteError(false);
    const result = await bridge.deleteSkill(pendingDelete);
    if (!result.ok) {
      setDeleteError(true);
      return;
    }
    setPendingDelete(null);
    setSelectedId(null);
    await refresh();
  }

  async function handleToggle(skillId: string, enabled: boolean) {
    setToggleErrorId(null);
    setTogglingId(skillId);
    const result = await bridge.setSkillEnabled(skillId, enabled);
    setTogglingId(null);
    if (!result.ok) {
      setToggleErrorId(skillId);
      return;
    }
    await refresh();
  }

  return (
    <section className="inbox-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Skills</p>
          <h1>Skills</h1>
          <p className="workspace-lede">
            Market is anything added from Discover; Project is what this repo already had. Toggle a row on or
            off — that is the write. Filing onto a command does not remove them.
          </p>
        </div>
        <div className="library-heading-actions">
          {catalog !== null && <span className="library-count">{catalog.length} skills</span>}
        </div>
      </div>

      <form onSubmit={handleSearch}>
        <label className="search-box" htmlFor="inbox-search-query">
          <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />
          <span className="sr-only">Search skills</span>
          <input
            id="inbox-search-query"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search skills"
          />
          <button type="submit" className="search-submit" aria-label="Search">
            <ArrowRight size={16} weight="regular" aria-hidden="true" />
          </button>
        </label>
      </form>

      {lastScan && lastScan.gone.length > 0 && (
        <p role="status" aria-atomic="true" className="scan-gone">
          {goneMessage(lastScan.gone)}
        </p>
      )}
      {lastScan && lastScan.alwaysOnWarnings.length > 0 && (
        <p role="status" aria-atomic="true" className="scan-gone">
          {lastScan.alwaysOnWarnings.join(' ')}
        </p>
      )}

      {catalog === null ? (
        <StatusSkeleton />
      ) : catalog.length === 0 ? (
        <p className="muted-copy">
          {canScan
            ? 'No unfiled skills'
            : 'No unfiled skills. Add from Discover, or connect a folder and scan.'}
        </p>
      ) : visibleGroups.length === 0 ? (
        <p className="muted-copy">No matching skills</p>
      ) : (
        <>
          <div className="command-stages inbox-groups">
            {visibleGroups.map((group) => (
              <div className="command-stage" key={group.key}>
                <p className="stage-label">{group.label}</p>
                <ul className="skill-list">
                  {group.skills.map((skillId) => {
                    const rank = visibleStart + visibleIds.indexOf(skillId) + 1;
                    const record = (catalog ?? []).find((skill) => skill.id === skillId);
                    const originStatus = originById[skillId];
                    const originBadge =
                      record?.source === 'skills.sh' && record.paths.length > 0 && originStatus
                        ? ORIGIN_BADGE[originStatus]
                        : null;
                    return (
                      <li
                        className={`library-skill library-skill-interactive${originBadge ? ` origin-row origin-row-${originStatus}` : ''}`}
                        key={skillId}
                        onClick={() => setSelectedId(skillId)}
                      >
                        <button
                          type="button"
                          className={`library-skill-hit ${FOCUS_RING}`}
                          onClick={() => setSelectedId(skillId)}
                          aria-haspopup="dialog"
                          aria-label={`Details for ${skillId}`}
                        />
                        <span className="skill-rank">{rank}</span>
                        <div className="skill-info">
                          <div className="skill-name">{skillId}</div>
                          {originBadge && (
                            <span className={originBadge.className}>{originBadge.label}</span>
                          )}
                        </div>
                        {originById[skillId] === 'update' && (
                          <button
                            type="button"
                            aria-label={`Update ${skillId}`}
                            className={`update-card ${FOCUS_RING}`}
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation();
                              setUpdateError(false);
                              setPendingUpdate({ id: skillId, replaceEdited: false });
                            }}
                          >
                            <ArrowClockwise size={16} weight="regular" aria-hidden="true" />
                            Update
                          </button>
                        )}
                        {toggleErrorId === skillId && <StatusNotice kind="enable" layout="inline" />}
                        <SkillToggle
                          record={record}
                          busy={togglingId === skillId}
                          onToggle={() =>
                            void handleToggle(skillId, skillPathState(record?.paths ?? []) !== 'on')
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {pageCount > 1 && (
            <nav aria-label="Pages" className="page-row">
              <button
                type="button"
                aria-label="Previous page"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                className={`filter ${FOCUS_RING}`}
              >
                <CaretLeft size={14} weight="regular" aria-hidden="true" />
              </button>
              <span className="page-status">
                Page {safePage + 1} of {pageCount}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={safePage === pageCount - 1}
                onClick={() => setPage(safePage + 1)}
                className={`filter ${FOCUS_RING}`}
              >
                <CaretRight size={14} weight="regular" aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}

      {selectedId && (
        <SkillPreviewDialog
          id={selectedId}
          source={previewSource}
          paths={selectedRecord?.paths}
          originStatus={originById[selectedId]}
          lockDismiss={pendingUpdate !== null || pendingDelete !== null}
          onReset={
            originById[selectedId] === 'edited'
              ? () => {
                  setUpdateError(false);
                  setPendingUpdate({ id: selectedId, replaceEdited: true });
                }
              : undefined
          }
          onDelete={() => {
            setDeleteError(false);
            setPendingDelete(selectedId);
          }}
          onClose={() => setSelectedId(null)}
        />
      )}

      {pendingDelete &&
        createPortal(
        <div className="modal-backdrop" role="presentation" onClick={closeDelete}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-skill-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Skills</p>
            <h2 id="delete-skill-title">Delete {pendingDelete}?</h2>
            {pendingPaths.length > 0 ? (
              <>
                <p className="muted-copy">
                  This removes the skill from disk. Cannot be undone. Nested skills in the same folder stay.
                </p>
                <ul className="skill-delete-paths">
                  {pendingPaths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
                {pendingNested.length > 0 && (
                  <p className="muted-copy">Keeping {pendingNested.join(', ')}</p>
                )}
              </>
            ) : (
              <p className="muted-copy">Not on disk. This only drops it from Skills.</p>
            )}
            {deleteError && <StatusNotice kind="delete" />}
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={closeDelete}>
                Cancel
              </button>
              <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => void handleDelete()}>
                Delete skill
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {pendingUpdate &&
        createPortal(
        <div className="modal-backdrop" role="presentation" onClick={isUpdating ? undefined : closeUpdate}>
          <div
            className={`help-modal${isUpdating ? ' status-loading' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-busy={isUpdating || undefined}
            aria-labelledby="update-skill-title"
            onClick={(event) => event.stopPropagation()}
          >
            {isUpdating && (
              <span className="status-icon status-icon-loading" aria-hidden="true">
                <CircleNotch size={24} weight="regular" className="spin" />
              </span>
            )}
            <p className="eyebrow">Skills</p>
            <h2 id="update-skill-title">
              {isUpdating
                ? pendingUpdate.replaceEdited
                  ? `Resetting ${pendingUpdate.id}`
                  : `Updating ${pendingUpdate.id}`
                : pendingUpdate.replaceEdited
                  ? `Reset ${pendingUpdate.id}?`
                  : `Update ${pendingUpdate.id}?`}
            </h2>
            <p className="muted-copy" role={isUpdating ? 'status' : undefined}>
              {isUpdating
                ? 'Fetching the market copy. This can take a few seconds.'
                : pendingUpdate.replaceEdited
                  ? 'This replaces your edited SKILL.md with the current market copy.'
                  : 'This replaces the on-disk SKILL.md with the current market copy.'}
            </p>
            {updateError && <StatusNotice kind="update" />}
            {!isUpdating && (
              <div className="modal-actions">
                <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={closeUpdate}>
                  Cancel
                </button>
                <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => void handleUpdate()}>
                  {pendingUpdate.replaceEdited ? 'Reset skill' : 'Update skill'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
