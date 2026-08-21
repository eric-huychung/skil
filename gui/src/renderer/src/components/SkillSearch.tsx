import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { BrowseView, Skill } from '../../../shared/ipc';

type InstallState = { status: 'success' } | { status: 'error'; message: string };

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
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({});
  const browseCache = useRef<Partial<Record<BrowseView, Skill[]>>>({});

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

  async function handleInstall(skillId: string) {
    setInstallingId(skillId);
    const result = await bridge.installSkill(skillId);
    setInstallingId(null);

    setInstallStates((current) => ({
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
            const installState = installStates[skill.id];
            const isInstalling = installingId === skill.id;
            const installed = !isInstalling && installState?.status === 'success';
            return (
              <li className="library-skill" key={skill.id}>
                <span className="skill-rank">{index + 1}</span>
                <div className="skill-info">
                  <div className="skill-name">{skill.id}</div>
                  {skill.installs !== undefined && (
                    <div className="skill-meta">
                      <span>{formatInstalls(skill.installs)} installs</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isInstalling && (
                    <span role="status" className="muted-copy">
                      Installing&hellip;
                    </span>
                  )}
                  {!isInstalling && installState?.status === 'error' && (
                    <span role="alert" className="muted-copy text-destructive">
                      {installState.message}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleInstall(skill.id)}
                    disabled={isInstalling}
                    aria-label={`Install ${skill.id}`}
                    className={`${installed ? 'installed-button' : 'install-button'} ${FOCUS_RING}`}
                  >
                    {installed ? 'Installed' : 'Install'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
