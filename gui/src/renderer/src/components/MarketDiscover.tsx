import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { ArrowRight, Check, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { formatInstalls } from '../lib/format-installs';
import type { BrowseView, LlmStatus, MarketSearchRow, ShelfRole } from '../../../shared/ipc';
import { LeaderboardSourceNote } from '../../../../../shared/leaderboard-source-note';
import { StatusNotice, StatusSkeleton, type StatusKind } from '../../../../../shared/status';
import SkillPreviewDialog from './SkillPreviewDialog';
import WorkspaceWarning from './WorkspaceWarning';

type AddState = { status: 'success' } | { status: 'error' };
type Row = { id: string; name: string; installs: number; rank?: number };

/** Survives Discover unmount (Settings toggle) so one LLM rank per project+role. */
const editorialSuggestCache = new Map<string, Row[]>();
const llmSuggestCache = new Map<string, { rows: Row[]; usedLlm: boolean }>();

function suggestSessionKey(root: string | null, role: string): string {
  return `${root ?? ''}::${role}`;
}

/** Test-only. Production cache lives for the renderer session. */
export function clearDiscoverSuggestCache(): void {
  editorialSuggestCache.clear();
  llmSuggestCache.clear();
}

/** Live skills.sh Top / Trending browse — same chips as the web leaderboard. */
const BROWSE_TABS: Array<{ view: BrowseView; label: string }> = [
  { view: 'all-time', label: 'Top' },
  { view: 'trending', label: 'Trending' },
];

/** Editorial role chips on the Suggested tab — mirrors `SEED_ROLES` in `market-seed.ts`. */
const SUGGEST_ROLE_TABS = [
  { slug: 'swe', label: 'SWE' },
  { slug: 'ui-ux', label: 'UI/UX' },
  { slug: 'pm', label: 'PM' },
  { slug: 'data', label: 'Data' },
  { slug: 'agent', label: 'Agent' },
  { slug: 'other', label: 'Other' },
] as const;

type SuggestGate =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: Row[]; usedLlm: boolean };

/** Flattens shelves into an id -> row lookup so suggested ids (engine returns ids only) get a name/installs to display. */
function shelfRowsById(shelves: ShelfRole[]): Map<string, Row> {
  const byId = new Map<string, Row>();
  for (const role of shelves) {
    for (const field of role.fields) {
      for (const skill of field.skills) {
        if (!byId.has(skill.id)) {
          byId.set(skill.id, { id: skill.id, name: skill.name, installs: skill.installs });
        }
      }
    }
  }
  return byId;
}

/**
 * Role -> category -> ranked skills from the market index, plus live
 * Top / Trending. Empty or failed shelves keep this same nest and default
 * to Top — no second Discover UI.
 */
export default function MarketDiscover({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
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
  const [suggestedActive, setSuggestedActive] = useState(true);
  const [suggestRole, setSuggestRole] = useState<string>(SUGGEST_ROLE_TABS[0].slug);
  const [suggestGate, setSuggestGate] = useState<SuggestGate>({ status: 'idle' });
  const [llm, setLlm] = useState<LlmStatus>({
    hasKey: true,
    enabled: true,
    provider: 'anthropic',
    keys: [],
    activeId: null,
  });

  useEffect(() => {
    let cancelled = false;
    void bridge.marketShelves().then((result) => {
      if (cancelled) return;
      const roles = result.ok ? result.value : [];
      setShelves(roles);
      setActiveRole(roles[0]?.slug ?? null);
      setActiveField(roles[0]?.fields[0]?.slug ?? null);
    });
    return () => {
      cancelled = true;
    };
    // loadBrowse reads cache + bridge; fetch once per bridge identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  useEffect(() => {
    void bridge.llmStatus().then(setLlm);
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
    clearSearch();
    setSuggestedActive(false);
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

  function clearSearch() {
    setQuery('');
    setSearchResults(null);
    setSearchError(null);
    setIsSearching(false);
  }

  function handleRoleSelect(r: ShelfRole) {
    clearSearch();
    setSuggestedActive(false);
    setBrowseView(null);
    setBrowseError(null);
    setActiveRole(r.slug);
    setActiveField(r.fields[0]?.slug ?? null);
  }

  /**
   * Editorial from Vercel; LLM rank once per project+role. Key on/off only
   * switches which cached list is shown — it does not POST again.
   */
  const runSuggestCheck = useCallback(
    async (role: string) => {
      const [status, root] = await Promise.all([bridge.llmStatus(), bridge.getProjectRoot()]);
      setLlm(status);
      const llmOn = status.hasKey && status.enabled;
      const key = suggestSessionKey(root, role);

      if (!llmOn) {
        const cached = editorialSuggestCache.get(key);
        if (cached) {
          setSuggestGate({ status: 'ready', rows: cached, usedLlm: false });
          return;
        }
        setSuggestGate({ status: 'loading' });
        const remote = await bridge.marketSuggested(role);
        if (!remote.ok) {
          setSuggestGate({ status: 'error' });
          return;
        }
        const catalog = await bridge.listSkills();
        const exclude = new Set(catalog.map((skill) => skill.id));
        const skills = remote.value.roles.find((row) => row.slug === role)?.skills ?? [];
        const rows = skills
          .filter((skill) => !exclude.has(skill.id))
          .map((skill, index) => ({
            id: skill.id,
            name: skill.name,
            installs: skill.installs,
            rank: skill.rank ?? index + 1,
          }));
        editorialSuggestCache.set(key, rows);
        setSuggestGate({ status: 'ready', rows, usedLlm: false });
        return;
      }

      const cached = llmSuggestCache.get(key);
      if (cached) {
        setSuggestGate({ status: 'ready', rows: cached.rows, usedLlm: cached.usedLlm });
        return;
      }

      setSuggestGate({ status: 'loading' });
      const shelvesPromise = bridge.marketShelves();
      const remotePromise = bridge.marketSuggested(role);
      const shelvesResult = await shelvesPromise;
      const nextShelves = shelvesResult.ok ? shelvesResult.value : [];
      try {
        const [remote, ranked] = await Promise.all([remotePromise, bridge.suggest(nextShelves, role)]);
        const byId = shelfRowsById(nextShelves);
        if (remote.ok) {
          for (const skill of remote.value.roles.flatMap((row) => row.skills)) {
            if (!byId.has(skill.id)) {
              byId.set(skill.id, { id: skill.id, name: skill.name, installs: skill.installs });
            }
          }
        }
        if (!ranked.ok) {
          setSuggestGate({ status: 'error' });
          return;
        }
        const rows = ranked.value.ids.map((id, index) => {
          const known = byId.get(id);
          const slug = id.split('/').pop() ?? id;
          return known ?? { id, name: slug, installs: 0, rank: index + 1 };
        });
        llmSuggestCache.set(key, { rows, usedLlm: ranked.value.usedLlm });
        setSuggestGate({ status: 'ready', rows, usedLlm: ranked.value.usedLlm });
      } catch {
        setSuggestGate({ status: 'error' });
      }
    },
    [bridge]
  );

  useEffect(() => {
    if (!suggestedActive || shelves === null) return;
    void runSuggestCheck(suggestRole);
  }, [suggestedActive, shelves, suggestRole, runSuggestCheck]);

  function handleSelectSuggested() {
    clearSearch();
    setBrowseView(null);
    setBrowseError(null);
    setSuggestedActive(true);
  }

  function handleSelectLeaderboard() {
    clearSearch();
    setSuggestedActive(false);
    if (browseView === null) {
      void loadBrowse('all-time');
    }
  }

  function handleSuggestRoleSelect(slug: string) {
    clearSearch();
    setSuggestRole(slug);
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

  const searchActive = searchResults !== null || searchError !== null || isSearching;
  const catalogError = searchError ?? (!searchActive && browseView ? browseError : null);
  const showSkeleton = shelves === null || isSearching || (!searchActive && !suggestedActive && isBrowsing);

  function renderSkillRow(skill: Row, index: number) {
    const addState = addStates[skill.id];
    const isAdding = addingId === skill.id;
    const added = !isAdding && addState?.status === 'success';
    return (
      <li className="library-skill library-skill-interactive" key={skill.id} onClick={() => setSelectedId(skill.id)}>
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
  }

  return (
    <section className="library-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Discover</h1>
        </div>
        {suggestedActive && !(llm.hasKey && llm.enabled) && (
          <WorkspaceWarning
            text={llm.hasKey ? 'Editorial picks only — LLM off' : 'Editorial picks only — no LLM key'}
            title={
              llm.hasKey
                ? 'Turn the key on in Settings to rank by this repo.'
                : 'Add a key in Settings to rank by this repo.'
            }
            onAction={onOpenSettings ? () => onOpenSettings() : undefined}
          />
        )}
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

      <LeaderboardSourceNote linkClassName={`leaderboard-source-link skill-details-link ${FOCUS_RING}`} />

      {shelves && (
        <>
          <div role="tablist" aria-label="Discover" className="filter-row role-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={suggestedActive}
              onClick={handleSelectSuggested}
              className={`filter ${suggestedActive ? 'active-filter' : ''} ${FOCUS_RING}`}
            >
              Suggested
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!suggestedActive}
              onClick={handleSelectLeaderboard}
              className={`filter ${!suggestedActive ? 'active-filter' : ''} ${FOCUS_RING}`}
            >
              Leaderboard
            </button>
          </div>

          {suggestedActive && (
            <div role="tablist" aria-label="Suggested role" className="filter-row">
              {SUGGEST_ROLE_TABS.map((tab) => (
                <button
                  key={tab.slug}
                  type="button"
                  role="tab"
                  aria-selected={suggestRole === tab.slug}
                  onClick={() => handleSuggestRoleSelect(tab.slug)}
                  className={`filter ${suggestRole === tab.slug ? 'active-filter' : ''} ${FOCUS_RING}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {!suggestedActive && (
            <>
              <div role="tablist" aria-label="Leaderboard" className="filter-row">
                {BROWSE_TABS.map((tab) => (
                  <button
                    key={tab.view}
                    type="button"
                    role="tab"
                    aria-selected={browseView === tab.view}
                    onClick={() => {
                      void loadBrowse(tab.view);
                    }}
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
                      onClick={() => {
                        clearSearch();
                        setActiveField(f.slug);
                      }}
                      className={`filter ${f.slug === activeField ? 'active-filter' : ''} ${FOCUS_RING}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {searchActive ? (
        <>
          {showSkeleton && <StatusSkeleton />}
          {catalogError && !showSkeleton && <StatusNotice kind={catalogError} onRetry={retryFailedCatalog} />}
          {shelves && !showSkeleton && !catalogError && <ul className="skill-list">{rows.map(renderSkillRow)}</ul>}
        </>
      ) : suggestedActive ? (
        <>
          {(shelves === null || suggestGate.status === 'loading') && <StatusSkeleton />}
          {suggestGate.status === 'error' && (
            <StatusNotice kind="load" onRetry={() => void runSuggestCheck(suggestRole)} />
          )}
          {suggestGate.status === 'ready' && suggestGate.rows.length === 0 && (
            <p className="muted-copy">No suggestions right now — every pick for this role is already in your catalog.</p>
          )}
          {suggestGate.status === 'ready' && suggestGate.rows.length > 0 && (
            <ul className="skill-list">{suggestGate.rows.map(renderSkillRow)}</ul>
          )}
        </>
      ) : (
        <>
          {showSkeleton && <StatusSkeleton />}
          {catalogError && !showSkeleton && <StatusNotice kind={catalogError} onRetry={retryFailedCatalog} />}
          {shelves && !showSkeleton && !catalogError && <ul className="skill-list">{rows.map(renderSkillRow)}</ul>}
        </>
      )}

      {selectedId && <SkillPreviewDialog id={selectedId} source="market" onClose={() => setSelectedId(null)} />}
    </section>
  );
}
