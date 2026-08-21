import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { BrowseView, Skill } from '../../../shared/ipc';

type AddState = { status: 'success' } | { status: 'error'; message: string };

const BROWSE_DISPLAY_LIMIT = 20;

function formatInstalls(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
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
  const browseCache = useRef<Partial<Record<BrowseView, Skill[]>>>({});

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
    setResultSource(view);

    const cached = browseCache.current[view];
    if (cached) {
      setResults(cached);
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
      setResults(sliced);
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

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      await loadBrowse(resultSource === 'trending' ? 'trending' : 'all-time');
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

  return (
    <section className="library-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Discover</p>
          <h1>Find Skills</h1>
        </div>
        {results !== null && <span className="library-count">{results.length} available</span>}
      </div>

      <form onSubmit={handleSearch}>
        <label className="search-box" htmlFor="skill-search-query">
          <MagnifyingGlass size={16} weight="regular" aria-hidden="true" />
          <span className="sr-only">Search skills</span>
          <input
            id="skill-search-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills"
            className={FOCUS_RING}
          />
          <button type="submit" className={`text-button search-submit ${FOCUS_RING}`}>
            Search
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
          {results.map((skill, index) => {
            const addState = addStates[skill.id];
            const isAdding = addingId === skill.id;
            const added = !isAdding && addState?.status === 'success';
            return (
              <li className="library-skill" key={skill.id}>
                <span className="skill-rank">{index + 1}</span>
                <div className="skill-info">
                  <button
                    type="button"
                    className={`skill-name skill-name-button ${FOCUS_RING}`}
                    onClick={() => setSelected(skill)}
                    aria-haspopup="dialog"
                  >
                    {skill.id}
                  </button>
                  {skill.installs !== undefined && (
                    <div className="skill-meta">
                      <span>{formatInstalls(skill.installs)} installs</span>
                    </div>
                  )}
                </div>
                <div className="skill-actions">
                  {isAdding && (
                    <span role="status" className="muted-copy">
                      Adding&hellip;
                    </span>
                  )}
                  {!isAdding && addState?.status === 'error' && (
                    <span role="alert" className="muted-copy text-destructive">
                      {addState.message}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAdd(skill.id)}
                    disabled={isAdding}
                    aria-label={added ? `Added ${skill.id}` : `Add ${skill.id}`}
                    aria-pressed={added}
                    className={`${added ? 'installed-button' : 'install-button'} ${FOCUS_RING}`}
                  >
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selected && <SkillDetailsDialog skill={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function SkillDetailsDialog({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const title = skill.name ?? skill.id;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="help-modal"
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
            <dt>Route</dt>
            <dd>{skill.id}</dd>
          </div>
          {skill.repo && (
            <div>
              <dt>Repo</dt>
              <dd>{skill.repo}</dd>
            </div>
          )}
          {skill.installs !== undefined && (
            <div>
              <dt>Installs</dt>
              <dd>{formatInstalls(skill.installs)}</dd>
            </div>
          )}
          {skill.installUrl && (
            <div>
              <dt>GitHub</dt>
              <dd>
                <a href={skill.installUrl} target="_blank" rel="noreferrer" className={FOCUS_RING}>
                  GitHub
                </a>
              </dd>
            </div>
          )}
          {skill.url && (
            <div>
              <dt>skills.sh</dt>
              <dd>
                <a href={skill.url} target="_blank" rel="noreferrer" className={FOCUS_RING}>
                  skills.sh
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
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
