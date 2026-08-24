import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowSquareOut, ArrowsClockwise, CaretLeft, CaretRight, Check, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { BrowseView, Skill } from '../../../shared/ipc';

type AddState = { status: 'success' } | { status: 'error'; message: string };

const BROWSE_DISPLAY_LIMIT = 500;
const PAGE_SIZE = 25;

function formatInstalls(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

function skillLabel(skill: Skill): string {
  return skill.name ?? skill.id;
}

function skillMatchesQuery(skill: Skill, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return `${skill.name ?? ''} ${skill.id}`.toLowerCase().includes(needle);
}

export default function SkillSearch() {
  const bridge = useBridge();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Skill[] | null>(null);
  const [resultSource, setResultSource] = useState<'search' | BrowseView>('all-time');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});
  const [selected, setSelected] = useState<Skill | null>(null);
  const [page, setPage] = useState(0);
  const browseCache = useRef<Partial<Record<BrowseView, Skill[]>>>({});
  const lastBrowseView = useRef<BrowseView>('all-time');
  const queryRef = useRef(query);
  queryRef.current = query;

  function showFromCache(view: BrowseView, q: string): boolean {
    const cached = browseCache.current[view];
    if (!cached) return false;
    const trimmed = q.trim();
    setResultSource(view);
    setPage(0);
    setResults(trimmed.length === 0 ? cached : cached.filter((skill) => skillMatchesQuery(skill, trimmed)));
    return true;
  }

  useEffect(() => {
    void bridge.listInbox().then((ids) => {
      setAddStates((current) => {
        const next = { ...current };
        for (const id of ids) {
          next[id] = { status: 'success' };
        }
        return next;
      });
    });
  }, [bridge]);

  useEffect(() => {
    if (!selected) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelected(null);
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [selected]);

  async function loadBrowse(view: BrowseView) {
    setSearchError(null);
    lastBrowseView.current = view;

    if (showFromCache(view, queryRef.current)) {
      return;
    }

    setIsSearching(true);
    try {
      const result = await bridge.browseSkills(view);
      if (!result.ok) {
        setSearchError(result.error.message);
        setResults(null);
        return;
      }

      const sliced = result.value.slice(0, BROWSE_DISPLAY_LIMIT);
      browseCache.current[view] = sliced;
      showFromCache(view, queryRef.current);
    } catch (error) {
      setSearchError((error as Error).message);
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    void loadBrowse('all-time');
    // Fetch on first visit to this panel, not when the bridge identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSearchError(null);
    showFromCache(lastBrowseView.current, value);
  }

  async function handleSync() {
    browseCache.current = {};
    await loadBrowse(lastBrowseView.current);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const view = lastBrowseView.current;
    if (trimmed.length === 0) {
      await loadBrowse(view);
      return;
    }

    const cached = browseCache.current[view];
    const local = cached?.filter((skill) => skillMatchesQuery(skill, trimmed)) ?? [];
    if (local.length > 0) {
      setSearchError(null);
      setResultSource(view);
      setPage(0);
      setResults(local);
      return;
    }

    setSearchError(null);
    setIsSearching(true);
    try {
      const result = await bridge.searchSkills(trimmed);
      if (!result.ok) {
        setSearchError(result.error.message);
        setResults(null);
        return;
      }
      setResultSource('search');
      setPage(0);
      setResults(result.value);
    } catch (error) {
      setSearchError((error as Error).message);
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleAdd(skillId: string) {
    setAddingId(skillId);
    const result = await bridge.addToInbox(skillId);
    setAddingId(null);

    setAddStates((current) => ({
      ...current,
      [skillId]: result.ok ? { status: 'success' } : { status: 'error', message: result.error.message },
    }));
  }

  const pageCount = results && results.length > 0 ? Math.ceil(results.length / PAGE_SIZE) : 0;
  const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1);
  const visible = results?.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE) ?? [];

  return (
    <section className="library-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Discover</h1>
          <p className="workspace-lede">
            Browse skills.sh by all-time and trending use. Add anything useful to Inbox — install is a later
            step.
          </p>
        </div>
        <div className="library-heading-actions">
          {results !== null && <span className="library-count">{results.length} available</span>}
          <button
            type="button"
            className={`icon-button ${FOCUS_RING}`}
            aria-label="Refresh skills"
            onClick={() => void handleSync()}
            disabled={isSearching}
          >
            <ArrowsClockwise size={16} weight="regular" aria-hidden="true" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch}>
        <label className="search-box" htmlFor="skill-search-query">
          <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />
          <span className="sr-only">Search skills</span>
          <input
            id="skill-search-query"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search skills"
          />
          <button type="submit" className="search-submit" aria-label="Search">
            <ArrowRight size={16} weight="regular" aria-hidden="true" />
          </button>
        </label>
      </form>

      <div role="tablist" aria-label="Leaderboard" className="filter-row">
        <LeaderboardTab
          label="All time"
          selected={resultSource === 'all-time'}
          onSelect={() => void loadBrowse('all-time')}
        />
        <LeaderboardTab
          label="Trending"
          selected={resultSource === 'trending'}
          onSelect={() => void loadBrowse('trending')}
        />
      </div>

      {isSearching && (
        <p role="status" className="muted-copy">
          Searching&hellip;
        </p>
      )}
      {searchError && (
        <p role="alert" className="muted-copy text-destructive">
          {searchError}
        </p>
      )}

      {results !== null && !isSearching && (
        <ul className="skill-list">
          {visible.map((skill, index) => {
            const addState = addStates[skill.id];
            const isAdding = addingId === skill.id;
            const added = !isAdding && addState?.status === 'success';
            const label = skillLabel(skill);
            return (
              <li
                className="library-skill library-skill-interactive"
                key={skill.id}
                onClick={() => setSelected(skill)}
              >
                <button
                  type="button"
                  className={`library-skill-hit ${FOCUS_RING}`}
                  onClick={() => setSelected(skill)}
                  aria-haspopup="dialog"
                  aria-label={`Details for ${label}`}
                />
                <span className="skill-rank">{safePage * PAGE_SIZE + index + 1}</span>
                <div className="skill-info">
                  <div className="skill-name">{label}</div>
                </div>
                <div className="skill-actions">
                  {!isAdding && addState?.status === 'error' && (
                    <span role="alert" className="muted-copy text-destructive">
                      {addState.message}
                    </span>
                  )}
                  {skill.installs !== undefined && (
                    <span className="skill-installs">{formatInstalls(skill.installs)}</span>
                  )}
                  <button
                    type="button"
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      void handleAdd(skill.id);
                    }}
                    disabled={isAdding}
                    aria-label={
                      isAdding ? `Adding ${skill.id}` : added ? `Added ${skill.id}` : `Add ${skill.id}`
                    }
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

      {results !== null && !isSearching && pageCount > 1 && (
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

      {selected && <SkillDetailsDialog skill={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function SkillDetailsDialog({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const title = skillLabel(skill);
  const repositoryHref = skill.installUrl;

  return createPortal(
    <div className="skill-details-backdrop" role="presentation" onClick={onClose}>
      <div
        className="skill-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label="Close details" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <p className="eyebrow">Skill</p>
        <h2 id="skill-details-title">{title}</h2>
        <dl className="skill-details">
          <div>
            <dt>Repository</dt>
            <dd>
              {repositoryHref ? (
                <ExternalLink href={repositoryHref}>{skill.id}</ExternalLink>
              ) : (
                skill.id
              )}
            </dd>
          </div>
          {skill.installs !== undefined && (
            <div>
              <dt>Installs</dt>
              <dd>{formatInstalls(skill.installs)}</dd>
            </div>
          )}
          {skill.url && (
            <div>
              <dt>skills.sh</dt>
              <dd>
                <ExternalLink href={skill.url}>skills.sh</ExternalLink>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>,
    document.body,
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`skill-details-link ${FOCUS_RING}`}>
      <span>{children}</span>
      <ArrowSquareOut size={14} weight="regular" aria-hidden="true" />
    </a>
  );
}

function LeaderboardTab({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`filter ${selected ? 'active-filter' : ''} ${FOCUS_RING}`}
    >
      {label}
    </button>
  );
}
