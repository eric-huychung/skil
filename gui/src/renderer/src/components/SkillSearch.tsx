import { useState, type FormEvent } from 'react';
import { useBridge } from '../bridge-context';
import type { Skill } from '../../../shared/ipc';

type InstallState = { status: 'success' } | { status: 'error'; message: string };

export default function SkillSearch() {
  const bridge = useBridge();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Skill[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({});

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchError(null);
    setIsSearching(true);
    const result = await bridge.searchSkills(query);
    setIsSearching(false);

    if (!result.ok) {
      setSearchError(result.error.message);
      setResults(null);
      return;
    }
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
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-input px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Search
        </button>
      </form>

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
                <span className="text-sm">{skill.id}</span>
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
                    className="rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
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
