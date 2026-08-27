import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowSquareOut, Check, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { formatInstalls } from '../lib/format-installs';
import type { MarketPreviewData, MarketSearchRow, ShelfRole } from '../../../shared/ipc';
import SkillSearch from './SkillSearch';

type AddState = { status: 'success' } | { status: 'error'; message: string };
type Row = { id: string; name: string; installs: number; rank?: number };

const AUDIT_LABEL: Record<MarketPreviewData['audit']['status'], string> = {
  pass: 'Audit passed',
  warn: 'Audit warning',
  fail: 'Audit failed',
  none: 'No audit',
};

/**
 * Task 13: role -> category -> ranked skills, backed by the market index
 * read API (`marketShelves` / `marketSearch` / `marketPreview` on the
 * bridge — see `gui/src/main/index.ts`). Per the plan's "keep All-time /
 * Trending until shelves have data" rule, an empty or failed shelves load
 * falls back to the existing `SkillSearch` (skills.sh live browse)
 * unchanged, rather than showing a broken nested view.
 */
export default function MarketDiscover() {
  const bridge = useBridge();
  const [shelves, setShelves] = useState<ShelfRole[] | null>(null);
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MarketSearchRow[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});

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
  }, [bridge]);

  useEffect(() => {
    void bridge.listInbox().then((ids) => {
      setAddStates((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = { status: 'success' };
        return next;
      });
    });
  }, [bridge]);

  const role = useMemo(() => shelves?.find((r) => r.slug === activeRole) ?? null, [shelves, activeRole]);
  const field = useMemo(
    () => role?.fields.find((f) => f.slug === activeField) ?? role?.fields[0] ?? null,
    [role, activeField]
  );
  const rows: Row[] = searchResults ?? field?.skills ?? [];

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    setSearchError(null);
    if (trimmed.length === 0) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const result = await bridge.marketSearch(trimmed);
      if (!result.ok) {
        setSearchError(result.error.message);
        setSearchResults(null);
        return;
      }
      setSearchResults(result.value);
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

  if (shelves === null) {
    return (
      <section className="library-panel panel-section">
        <p role="status" className="muted-copy">
          Loading&hellip;
        </p>
      </section>
    );
  }

  if (shelves.length === 0) {
    return <SkillSearch />;
  }

  return (
    <section className="library-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Discover</h1>
          <p className="workspace-lede">
            Browse the market index by role, then category. Add anything useful to Inbox — install is a later
            step.
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

      {searchResults === null && (
        <>
          <div role="tablist" aria-label="Role" className="filter-row">
            {shelves.map((r) => (
              <button
                key={r.slug}
                type="button"
                role="tab"
                aria-selected={r.slug === activeRole}
                onClick={() => {
                  setActiveRole(r.slug);
                  setActiveField(r.fields[0]?.slug ?? null);
                }}
                className={`filter ${r.slug === activeRole ? 'active-filter' : ''} ${FOCUS_RING}`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {role && (
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

      {!isSearching && (
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
                  {!isAdding && addState?.status === 'error' && (
                    <span role="alert" className="muted-copy text-destructive">
                      {addState.message}
                    </span>
                  )}
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

      {selectedId && <MarketPreviewDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </section>
  );
}

function MarketPreviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const bridge = useBridge();
  const [preview, setPreview] = useState<MarketPreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError(null);
    void bridge.marketPreview(id).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setPreview(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, id]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return createPortal(
    <div className="skill-details-backdrop" role="presentation" onClick={onClose}>
      <div
        className="skill-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label="Close details" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <p className="eyebrow">Skill</p>
        <h2 id="market-preview-title">{preview?.name ?? id}</h2>
        {error && (
          <p role="alert" className="muted-copy text-destructive">
            {error}
          </p>
        )}
        {!error && !preview && (
          <p role="status" className="muted-copy">
            Loading&hellip;
          </p>
        )}
        {preview && (
          <>
            <dl className="skill-details">
              <div>
                <dt>Installs</dt>
                <dd>{formatInstalls(preview.installs)}</dd>
              </div>
              <div>
                <dt>Audit</dt>
                <dd>{AUDIT_LABEL[preview.audit.status]}</dd>
              </div>
              {preview.installUrl && (
                <div>
                  <dt>Repository</dt>
                  <dd>
                    <a href={preview.installUrl} target="_blank" rel="noreferrer" className={`skill-details-link ${FOCUS_RING}`}>
                      <span>{preview.installUrl}</span>
                      <ArrowSquareOut size={14} weight="regular" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {preview.skillMd && (
              <pre className="skill-md-preview">
                <code>{preview.skillMd}</code>
              </pre>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
