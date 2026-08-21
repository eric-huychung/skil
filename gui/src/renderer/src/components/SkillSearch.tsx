import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { BrowseView, Skill } from '../../../shared/ipc';

type InstallState = { status: 'success' } | { status: 'error'; message: string };

const BROWSE_DISPLAY_LIMIT = 20;

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
    const result = await bridge.browseSkills(view);
    setIsSearching(false);

    if (!result.ok) {
      setSearchError(result.error.message);
      setResults(null);
      return;
    }

    const sliced = result.value.slice(0, BROWSE_DISPLAY_LIMIT);
    browseCache.current[view] = sliced;
    setResults(sliced);
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
    const result = await bridge.searchSkills(trimmed);
    setIsSearching(false);

    if (!result.ok) {
      setSearchError(result.error.message);
      setResults(null);
      return;
    }
    setResultSource('search');
    setResults(result.value);
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
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearch} className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="skill-search-query" className="text-sm font-medium">
            Search skills
          </label>
          <input
            id="skill-search-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={`rounded-md border border-input bg-transparent px-3 py-2 text-sm ${FOCUS_RING}`}
          />
        </div>
        <button
          type="submit"
          className={`rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent ${FOCUS_RING}`}
        >
          Search
        </button>
      </form>

      <div role="tablist" aria-label="Leaderboard" className="flex gap-1">
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

      {isSearching && <p role="status" className="text-sm text-muted-foreground">Searching&hellip;</p>}
      {searchError && (
        <p role="alert" className="text-sm text-destructive">
          {searchError}
        </p>
      )}

      {results !== null && !isSearching && (
        <ul className="flex flex-col gap-1">
          {results.map((skill) => {
            const installState = installStates[skill.id];
            const isInstalling = installingId === skill.id;
            return (
              <li
                key={skill.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span className="flex items-baseline gap-2 text-sm">
                  <span>{skill.id}</span>
                  {skill.installs !== undefined && (
                    <span className="text-xs text-muted-foreground">{skill.installs} installs</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {isInstalling && (
                    <span role="status" className="text-xs text-muted-foreground">
                      Installing&hellip;
                    </span>
                  )}
                  {!isInstalling && installState?.status === 'success' && (
                    <span role="status" className="text-xs text-foreground">
                      Installed
                    </span>
                  )}
                  {!isInstalling && installState?.status === 'error' && (
                    <span role="alert" className="text-xs text-destructive">
                      {installState.message}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleInstall(skill.id)}
                    disabled={isInstalling}
                    aria-label={`Install ${skill.id}`}
                    className={`rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    Install
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
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
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${FOCUS_RING} ${
        selected ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      {label}
    </button>
  );
}
