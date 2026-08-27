import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, CaretLeft, CaretRight, MagnifyingGlass, Trash } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { groupInboxSkills } from '../lib/skill-sources';
import type { ScanResult, SkillRecord } from '../../../shared/ipc';

const PAGE_SIZE = 25;

function goneMessage(ids: string[]): string {
  return `Gone: ${ids.join(', ')}`;
}

function pullMessage(pulls: Array<{ ide: string; name: string }>): string {
  return `Pulled: ${pulls.map((pull) => `${pull.ide}/${pull.name}`).join(', ')}`;
}

function matchesQuery(skillId: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length === 0 || skillId.toLowerCase().includes(needle);
}

export default function InboxPanel() {
  const bridge = useBridge();
  const [inbox, setInbox] = useState<string[] | null>(null);
  const [catalog, setCatalog] = useState<SkillRecord[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [canScan, setCanScan] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextInbox, nextCatalog] = await Promise.all([bridge.listInbox(), bridge.listSkills()]);
    setInbox(nextInbox);
    setCatalog(nextCatalog);
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

  const matches = useMemo(
    () => (inbox ?? []).filter((skillId) => matchesQuery(skillId, query)),
    [inbox, query]
  );
  const groups = useMemo(() => groupInboxSkills(matches, catalog), [matches, catalog]);
  const ordered = useMemo(() => groups.flatMap((group) => group.skills), [groups]);
  const pageCount = ordered.length > 0 ? Math.ceil(ordered.length / PAGE_SIZE) : 0;
  const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const visibleStart = safePage * PAGE_SIZE;
  const visibleIds = ordered.slice(visibleStart, visibleStart + PAGE_SIZE);
  const visibleSet = new Set(visibleIds);
  const visibleGroups = groups
    .map((group) => ({ ...group, skills: group.skills.filter((id) => visibleSet.has(id)) }))
    .filter((group) => group.skills.length > 0);

  const pendingRecord = pendingDelete ? catalog.find((skill) => skill.id === pendingDelete) : undefined;
  const pendingPaths = pendingRecord?.paths ?? [];
  const pendingNested = pendingDelete
    ? catalog.filter((skill) => skill.id.startsWith(`${pendingDelete}/`)).map((skill) => skill.id)
    : [];

  useEffect(() => {
    if (!pendingDelete) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPendingDelete(null);
        setDeleteError(null);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pendingDelete]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(0);
  }

  function closeDelete() {
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    const result = await bridge.deleteSkill(pendingDelete);
    if (!result.ok) {
      setDeleteError(result.error.message);
      return;
    }
    setPendingDelete(null);
    await refresh();
  }

  return (
    <section className="inbox-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1>Inbox</h1>
          <p className="workspace-lede">
            Staging pool from scans and Discover. File them onto a command when you are ready. They stay here after you file.
          </p>
        </div>
        <div className="library-heading-actions">
          {inbox !== null && <span className="library-count">{inbox.length} skills</span>}
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
      {lastScan && lastScan.commandPulls.length > 0 && (
        <p role="status" aria-atomic="true" className="scan-gone">
          {pullMessage(lastScan.commandPulls)}
        </p>
      )}

      {inbox === null ? null : inbox.length === 0 ? (
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
                    return (
                      <li className="library-skill library-skill-static" key={skillId}>
                        <span className="skill-rank">{rank}</span>
                        <div className="skill-info">
                          <div className="skill-name">{skillId}</div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete ${skillId}`}
                          className={`delete-card ${FOCUS_RING}`}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(skillId);
                          }}
                        >
                          <Trash size={16} weight="regular" aria-hidden="true" />
                        </button>
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

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation" onClick={closeDelete}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-skill-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Inbox</p>
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
              <p className="muted-copy">Not on disk. This only drops it from Inbox.</p>
            )}
            {deleteError && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={closeDelete}>
                Cancel
              </button>
              <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => void handleDelete()}>
                Delete skill
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
