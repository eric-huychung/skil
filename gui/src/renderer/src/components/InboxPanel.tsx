import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowsClockwise, CaretLeft, CaretRight, MagnifyingGlass } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { ScanResult } from '../../../shared/ipc';
import { InstallSkill } from './InstallSkill';
import { StatusDialog } from './StatusDialog';

const PAGE_SIZE = 25;

function goneMessage(ids: string[]): string {
  return `Gone: ${ids.join(', ')}`;
}

function matchesQuery(skillId: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length === 0 || skillId.toLowerCase().includes(needle);
}

export default function InboxPanel() {
  const bridge = useBridge();
  const [inbox, setInbox] = useState<string[] | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanBlocked, setScanBlocked] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

  const refresh = useCallback(async () => {
    setInbox(await bridge.listInbox());
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
    if (!canScan) {
      setScanBlocked(true);
      return;
    }
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

  const matches = useMemo(
    () => (inbox ?? []).filter((skillId) => matchesQuery(skillId, query)),
    [inbox, query]
  );
  const pageCount = matches.length > 0 ? Math.ceil(matches.length / PAGE_SIZE) : 0;
  const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const visible = matches.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(0);
  }

  return (
    <section className="inbox-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1>Inbox</h1>
          <p className="workspace-lede">
            Unfiled skills from scans and Discover. File them onto a command when you are ready.
          </p>
        </div>
        <div className="library-heading-actions">
          {inbox !== null && <span className="library-count">{inbox.length} unfiled</span>}
          <button
            type="button"
            className={`icon-button ${FOCUS_RING}`}
            onClick={() => void handleScan()}
            disabled={scanning}
            aria-label="Scan"
          >
            <ArrowsClockwise size={16} weight="regular" aria-hidden="true" />
          </button>
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

      {!canScan && <p className="muted-copy scan-hint">Connect a project folder to scan</p>}
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

      {inbox === null ? null : inbox.length === 0 ? (
        <p className="muted-copy">
          {canScan
            ? 'No unfiled skills'
            : 'No unfiled skills. Add from Discover, or connect a folder and scan.'}
        </p>
      ) : visible.length === 0 ? (
        <p className="muted-copy">No matching skills</p>
      ) : (
        <>
          <ul className="skill-list">
            {visible.map((skillId, index) => (
              <li className="library-skill" key={skillId}>
                <span className="skill-rank">{safePage * PAGE_SIZE + index + 1}</span>
                <div className="skill-info">
                  <div className="skill-name">{skillId}</div>
                </div>
                <div className="skill-actions">
                  <InstallSkill skillId={skillId} instance="inbox" />
                </div>
              </li>
            ))}
          </ul>
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

      {scanBlocked && (
        <StatusDialog
          eyebrow="Scan"
          title="Connect a folder"
          kind="error"
          closeLabel="Close scan status"
          onClose={() => setScanBlocked(false)}
        >
          <p role="alert" className="muted-copy text-destructive">
            Scan reads SKILL.md folders from a connected project. Connect a folder on the Sync tab first.
          </p>
        </StatusDialog>
      )}
    </section>
  );
}
