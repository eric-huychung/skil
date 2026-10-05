import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  ArrowClockwise,
  CircleNotch,
} from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import {
  groupInboxSkills,
  shortSkillDescription,
  skillFileName,
  skillPathState,
} from '../lib/skill-sources';
import { findingsForSkill } from '../lib/skill-health';
import { parseDescription } from '../../../../../src/core/skill-md.js';
import { loadHealth, invalidateHealth } from '../lib/health-query';
import type { HealthReport, OriginCheck, OriginStatus, ScanResult, SkillRecord } from '../../../shared/ipc';
import { StatusNotice, StatusSkeleton } from '../../../../../shared/status';
import { HealthMark, rowsForSkill } from './HealthWarning';
import SkillPreviewDialog from './SkillPreviewDialog';
import SkillToggle from './SkillToggle';

const PAGE_SIZE = 25;

function goneMessage(ids: string[]): string {
  return `Gone: ${ids.join(', ')}`;
}

function matchesQuery(skillId: string, query: string, description = ''): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    skillId.toLowerCase().includes(needle) ||
    skillFileName(skillId).toLowerCase().includes(needle) ||
    description.toLowerCase().includes(needle)
  );
}

const ORIGIN_BADGE: Record<OriginStatus, { label: string; className: string }> = {
  current: { label: 'Synced', className: 'origin-badge bg-emerald-500/15 text-emerald-500' },
  update: { label: 'Update', className: 'origin-badge bg-amber-500/15 text-amber-500' },
  edited: { label: 'Edited', className: 'origin-badge bg-destructive/15 text-destructive' },
};

export default function InboxPanel() {
  const bridge = useBridge();
  const [catalog, setCatalog] = useState<SkillRecord[] | null>(null);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [originById, setOriginById] = useState<Record<string, OriginStatus>>({});
  const [healthReport, setHealthReport] = useState<HealthReport>([]);
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
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    const [nextCatalog, nextChecks] = await Promise.all([bridge.listSkills(), bridge.originChecks()]);
    if (id !== refreshId.current) return;
    setCatalog(nextCatalog);
    const checks: OriginCheck[] = nextChecks.ok ? nextChecks.value : [];
    setOriginById(Object.fromEntries(checks.map((check) => [check.skillId, check.status])));
    const bodies = await Promise.all(
      nextCatalog.map(async (skill) => {
        const result = await bridge.readSkillMd(skill.id);
        return [skill.id, result.ok ? parseDescription(result.value) : ''] as const;
      })
    );
    if (id !== refreshId.current) return;
    setDescriptions(Object.fromEntries(bodies));
    void loadHealth(bridge).then((report) => {
      if (id !== refreshId.current) return;
      setHealthReport(report);
    });
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return bridge.onScan((result) => {
      setLastScan(result);
      invalidateHealth();
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
  const matches = useMemo(
    () => ids.filter((skillId) => matchesQuery(skillId, query, descriptions[skillId])),
    [ids, query, descriptions]
  );
  const groups = useMemo(() => groupInboxSkills(matches, catalog ?? []), [matches, catalog]);
  const ordered = useMemo(
    () => groups.flatMap((group) => group.sections?.flatMap((section) => section.skills) ?? group.skills),
    [groups]
  );
  const pageCount = ordered.length > 0 ? Math.ceil(ordered.length / PAGE_SIZE) : 0;
  const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const visibleStart = safePage * PAGE_SIZE;
  const visibleIds = ordered.slice(visibleStart, visibleStart + PAGE_SIZE);
  const visibleSet = new Set(visibleIds);
  const visibleGroups = groups
    .map((group) => {
      const skills = (group.sections?.flatMap((section) => section.skills) ?? group.skills).filter((id) =>
        visibleSet.has(id)
      );
      const sections = group.sections
        ?.map((section) => ({
          ...section,
          skills: section.skills.filter((id) => visibleSet.has(id)),
        }))
        .filter((section) => section.skills.length > 0);
      return { ...group, skills, sections };
    })
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
    invalidateHealth();
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
    invalidateHealth();
    await refresh();
  }

  async function handleToggle(skillId: string, enabled: boolean) {
    setToggleErrorId(null);
    setTogglingId(skillId);
    try {
      const result = await bridge.setSkillEnabled(skillId, enabled);
      if (!result.ok) {
        setToggleErrorId(skillId);
        return;
      }
      invalidateHealth();
      await refresh();
    } finally {
      setTogglingId(null);
    }
  }

  function renderSkillCard(skillId: string, groupKey: 'market' | 'project') {
    const record = (catalog ?? []).find((skill) => skill.id === skillId);
    const originStatus = originById[skillId];
    const originBadge =
      record?.source === 'skills.sh' && record.paths.length > 0 && originStatus
        ? ORIGIN_BADGE[originStatus]
        : null;
    const displayName = groupKey === 'project' ? skillFileName(skillId) : skillId;
    const blurb = shortSkillDescription(descriptions[skillId] ?? '');
    return (
      <li
        className={`library-skill library-skill-interactive${originBadge ? ` origin-row origin-row-${originStatus}` : ''}`}
        key={skillId}
        aria-label={`Skill ${skillId}`}
        onClick={() => setSelectedId(skillId)}
      >
        <button
          type="button"
          className={`library-skill-hit ${FOCUS_RING}`}
          onClick={() => setSelectedId(skillId)}
          aria-haspopup="dialog"
          aria-label={`Details for ${skillId}`}
        />
        <HealthMark name={skillId} findings={findingsForSkill(healthReport, skillId)} />
        <div className="skill-name">{displayName}</div>
        <span className="skill-blurb">{blurb}</span>
        <div className="skill-actions">
          {originBadge && <span className={originBadge.className}>{originBadge.label}</span>}
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
            onToggle={() => void handleToggle(skillId, skillPathState(record?.paths ?? []) !== 'on')}
          />
        </div>
      </li>
    );
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
                <p className="stage-label inbox-source-label">{group.label}</p>
                {group.sections && group.sections.length > 0 ? (
                  <div className="inbox-folders">
                    {group.sections.map((section) => (
                      <div className="command-stage" key={section.key || 'root'}>
                        {section.label && <p className="stage-label">{section.label}</p>}
                        <ul className="skill-list">
                          {section.skills.map((skillId) => renderSkillCard(skillId, group.key))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="skill-list">
                    {group.skills.map((skillId) => renderSkillCard(skillId, group.key))}
                  </ul>
                )}
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
          findings={rowsForSkill(selectedId, findingsForSkill(healthReport, selectedId))}
          toggle={
            <SkillToggle
              record={selectedRecord}
              busy={togglingId === selectedId}
              onToggle={() =>
                void handleToggle(selectedId, skillPathState(selectedRecord?.paths ?? []) !== 'on')
              }
            />
          }
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
