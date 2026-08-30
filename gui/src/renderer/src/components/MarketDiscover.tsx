import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowRight, Check, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { formatInstalls } from '../lib/format-installs';
import type { BrowseView, MarketSearchRow, ShelfRole } from '../../../shared/ipc';
import { StatusNotice, StatusSkeleton, type StatusKind } from '../../../../../shared/status';
import SkillPreviewDialog from './SkillPreviewDialog';

type AddState = { status: 'success' } | { status: 'error' };
type Row = { id: string; name: string; installs: number; rank?: number };

/** Live skills.sh browse, same tabs as Landing Discover. */
const BROWSE_TABS: Array<{ view: BrowseView; label: string }> = [
  { view: 'all-time', label: 'Top' },
  { view: 'trending', label: 'Trending' },
];

/**
 * Role -> category -> ranked skills from the market index, plus live
 * Top / Trending. Empty or failed shelves keep this same nest and default
 * to Top — no second Discover UI.
 */
export default function MarketDiscover() {
  const bridge = useBridge();
  const [shelves, setShelves] = useState<ShelfRole[] | null>(null);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [browseView, setBrowseView] = useState<BrowseView | null>(null);
  const [browseRows, setBrowseRows] = useState<Row[] | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<StatusKind | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketSearchRow[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<StatusKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});
  const browseCache = useRef<Partial<Record<BrowseView, Row[]>>>({});

  useEffect(() => {
    let cancelled = false;
    void bridge.marketShelves().then((result) => {
      if (cancelled) return;
      const roles = result.ok ? result.value : [];
      setShelves(roles);
      setActiveRole(roles[0]?.slug ?? null);
      setActiveField(roles[0]?.fields[0]?.slug ?? null);
      if (roles.length === 0) {
        void loadBrowse('all-time');
      }
    });
    return () => {
      cancelled = true;
    };
    // loadBrowse reads cache + bridge; fetch once per bridge identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  useEffect(() => {
    void bridge.listSkills().then((catalog) => {
      setAddStates((current) => {
        const next = { ...current };
        for (const skill of catalog) next[skill.id] = { status: 'success' };
        return next;
      });
    });
  }, [bridge]);

  const role = useMemo(() => shelves?.find((r) => r.slug === activeRole) ?? null, [shelves, activeRole]);
  const field = useMemo(
    () => role?.fields.find((f) => f.slug === activeField) ?? role?.fields[0] ?? null,
    [role, activeField]
  );
  const rows: Row[] = searchResults ?? (browseView ? browseRows ?? [] : field?.skills ?? []);

  async function loadBrowse(view: BrowseView) {
    setBrowseView(view);
    setBrowseError(null);
    const cached = browseCache.current[view];
    if (cached) {
      setBrowseRows(cached);
      return;
    }

    setIsBrowsing(true);
    try {
      const result = await bridge.browseSkills(view);
      if (!result.ok) {
        setBrowseError('load');
        setBrowseRows(null);
        return;
      }
      const rows = result.value.map((skill) => ({
        id: skill.id,
        name: skill.name ?? skill.id,
        installs: skill.installs ?? 0,
      }));
      browseCache.current[view] = rows;
      setBrowseRows(rows);
    } catch {
      setBrowseError('load');
      setBrowseRows(null);
    } finally {
      setIsBrowsing(false);
    }
  }

  function handleRoleSelect(r: ShelfRole) {
    setBrowseView(null);
    setBrowseError(null);
    setActiveRole(r.slug);
    setActiveField(r.fields[0]?.slug ?? null);
  }

  async function runMarketSearch(trimmed: string) {
    setSearchError(null);
    if (trimmed.length === 0) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const result = await bridge.marketSearch(trimmed);
      if (!result.ok) {
        setSearchError('search');
        setSearchResults(null);
        return;
      }
      setSearchResults(result.value);
    } catch {
      setSearchError('search');
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runMarketSearch(query.trim());
  }

  function retryFailedCatalog() {
    if (searchError) {
      void runMarketSearch(query.trim());
      return;
    }
    if (browseView) void loadBrowse(browseView);
  }

  async function handleAdd(skillId: string) {
    setAddingId(skillId);
    const result = await bridge.install(skillId);
    setAddingId(null);
    setAddStates((current) => ({
      ...current,
      [skillId]: result.ok ? { status: 'success' } : { status: 'error' },
    }));
  }

  const catalogError = searchError ?? (browseView ? browseError : null);
  const showSkeleton = shelves === null || isSearching || isBrowsing;

  return (
    <section className="library-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Discover</h1>
          <p className="workspace-lede">
            Browse the market index by role, then category. `+` writes a skill into both live trees right away —
            it shows up under Skills as Market.
          </p>
        </div>
      </div>

      <form onSubmit={(event) => void handleSearch(event)}>
        <label className="search-box" htmlFor="market-search-query">
          <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />
          <span className="sr-only">Search skills</span>
          <input
            id="market-search-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills"
          />
          <button type="submit" className="search-submit" aria-label="Search">
            <ArrowRight size={16} weight="regular" aria-hidden="true" />
          </button>
        </label>
      </form>

      {shelves && searchResults === null && (
        <>
          <div role="tablist" aria-label="Role" className="filter-row role-tabs">
            {BROWSE_TABS.map((tab) => (
              <button
                key={tab.view}
                type="button"
                role="tab"
                aria-selected={browseView === tab.view}
                onClick={() => void loadBrowse(tab.view)}
                className={`filter ${browseView === tab.view ? 'active-filter' : ''} ${FOCUS_RING}`}
              >
                {tab.label}
              </button>
            ))}
            {shelves.map((r) => (
              <button
                key={r.slug}
                type="button"
                role="tab"
                aria-selected={browseView === null && r.slug === activeRole}
                onClick={() => handleRoleSelect(r)}
                className={`filter ${browseView === null && r.slug === activeRole ? 'active-filter' : ''} ${FOCUS_RING}`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {role && browseView === null && (
            <div role="tablist" aria-label="Category" className="filter-row">
              {role.fields.map((f) => (
                <button
                  key={f.slug}
                  type="button"
                  role="tab"
                  aria-selected={f.slug === activeField}
                  onClick={() => setActiveField(f.slug)}
                  className={`filter ${f.slug === activeField ? 'active-filter' : ''} ${FOCUS_RING}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showSkeleton && <StatusSkeleton />}
      {catalogError && !showSkeleton && <StatusNotice kind={catalogError} onRetry={retryFailedCatalog} />}

      {shelves && !showSkeleton && !catalogError && (
        <ul className="skill-list">
          {rows.map((skill, index) => {
            const addState = addStates[skill.id];
            const isAdding = addingId === skill.id;
            const added = !isAdding && addState?.status === 'success';
            return (
              <li
                className="library-skill library-skill-interactive"
                key={skill.id}
                onClick={() => setSelectedId(skill.id)}
              >
                <button
                  type="button"
                  className={`library-skill-hit ${FOCUS_RING}`}
                  onClick={() => setSelectedId(skill.id)}
                  aria-haspopup="dialog"
                  aria-label={`Details for ${skill.name}`}
                />
                <span className="skill-rank">{skill.rank ?? index + 1}</span>
                <div className="skill-info">
                  <div className="skill-name">{skill.name}</div>
                </div>
                <div className="skill-actions">
                  {!isAdding && addState?.status === 'error' && <StatusNotice kind="add" layout="inline" />}
                  <span className="skill-installs">{formatInstalls(skill.installs)}</span>
                  <button
                    type="button"
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      void handleAdd(skill.id);
                    }}
                    disabled={isAdding}
                    aria-label={isAdding ? `Adding ${skill.id}` : added ? `Added ${skill.id}` : `Add ${skill.id}`}
                    aria-pressed={added}
                    aria-busy={isAdding || undefined}
                    className={`add-icon-button ${FOCUS_RING}`}
                  >
                    {added ? (
                      <Check size={16} weight="regular" aria-hidden="true" />
                    ) : (
                      <Plus size={16} weight="regular" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selectedId && <SkillPreviewDialog id={selectedId} source="market" onClose={() => setSelectedId(null)} />}
    </section>
  );
}
