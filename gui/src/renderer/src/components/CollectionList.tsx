import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { CaretDown, CaretLeft, CaretRight, Check, Plus, ToggleLeft, ToggleRight, Trash, X } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { conflictLabels, isCommandNameCollision } from '../lib/command-conflicts';
import { statusLine } from '../../../../../shared/status';
import { groupCommandsByStage } from '../lib/sdlc';
import type { Collection } from '../../../shared/ipc';

const INBOX_PAGE_SIZE = 10;

function matchesQuery(skillId: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle.length === 0 || skillId.toLowerCase().includes(needle);
}

/**
 * On/off is a path, not a flag — `collection.enabled` is computed from
 * disk each time `list()` runs. Toggling is the write; there is nothing
 * else to confirm first (a name collision surfaces as an inline error).
 */
function CommandToggle({
  collection,
  busy,
  onToggle,
}: {
  collection: Collection;
  busy: boolean;
  onToggle: () => void;
}) {
  const on = collection.enabled;
  return (
    <button
      type="button"
      className={`always-on-toggle ${on ? 'on' : 'off'} ${FOCUS_RING}`}
      aria-pressed={on}
      aria-busy={busy || undefined}
      disabled={busy}
      aria-label={on ? `Turn off ${collection.name}` : `Turn on ${collection.name}`}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {on ? (
        <ToggleRight size={18} weight="fill" aria-hidden="true" />
      ) : (
        <ToggleLeft size={18} weight="regular" aria-hidden="true" />
      )}
      {on ? 'On' : 'Off'}
    </button>
  );
}

function CollectionDetail({
  collection,
  inbox,
  onChange,
  onDeleted,
}: {
  collection: Collection;
  inbox: string[];
  onChange: () => void;
  onDeleted: () => void;
}) {
  const bridge = useBridge();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [inboxQuery, setInboxQuery] = useState('');
  const [inboxPage, setInboxPage] = useState(0);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [toggling, setToggling] = useState(false);
  const inboxPickerId = `inbox-picker-${collection.name}`;

  useEffect(() => {
    let cancelled = false;
    void bridge.usage().then((result) => {
      if (cancelled || !result.ok) return;
      const next: Record<string, number> = {};
      for (const row of result.value) {
        next[row.skillId] = row.count;
      }
      setUsageCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, collection.skills]);

  const inboxMatches = useMemo(
    () => inbox.filter((skillId) => matchesQuery(skillId, inboxQuery)),
    [inbox, inboxQuery]
  );
  const inboxPageCount = inboxMatches.length > 0 ? Math.ceil(inboxMatches.length / INBOX_PAGE_SIZE) : 0;
  const safeInboxPage = inboxPageCount === 0 ? 0 : Math.min(inboxPage, inboxPageCount - 1);
  const visibleInbox = inboxMatches.slice(safeInboxPage * INBOX_PAGE_SIZE, (safeInboxPage + 1) * INBOX_PAGE_SIZE);

  async function handleAddFromInbox(skillId: string) {
    setError(null);
    const result = await bridge.addSkill(collection.name, skillId);
    if (!result.ok) {
      setError(statusLine('add'));
      return;
    }
    onChange();
  }

  async function handleRemoveSkill(skillId: string) {
    setError(null);
    const result = await bridge.removeSkillFromCollection(collection.name, skillId);
    if (!result.ok) {
      setError(statusLine('delete'));
      return;
    }
    onChange();
  }

  async function handleToggle() {
    setError(null);
    setToggling(true);
    const result = await bridge.setCommandEnabled(collection.name, !collection.enabled);
    setToggling(false);
    if (!result.ok) {
      setError(
        isCommandNameCollision(result)
          ? `Can't turn on /${collection.name}: ${conflictLabels(result).join(', ')} already exists and isn't ours to manage.`
          : statusLine('enable')
      );
      return;
    }
    onChange();
  }

  async function handleDelete() {
    setError(null);
    const result = await bridge.deleteCollection(collection.name);
    if (!result.ok) {
      setError(statusLine('delete'));
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    onDeleted();
  }

  return (
    <section className="detail-panel panel-section" aria-label={`Command ${collection.name} details`}>
      <div className="detail-header">
        <div>
          <p className="eyebrow">Command</p>
          <h2>/{collection.name}</h2>
          <p className="muted-copy">
            {collection.skills.length === 1 ? '1 skill' : `${collection.skills.length} skills`}
          </p>
        </div>
        <div className="detail-actions">
          <CommandToggle collection={collection} busy={toggling} onToggle={() => void handleToggle()} />
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${collection.name}`}
            className={`delete-card detail-delete ${FOCUS_RING}`}
          >
            <Trash size={16} weight="regular" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="active-skills">
        <div className="subheading">
          <span>Included skills</span>
          <span className="count-pill">{collection.skills.length}</span>
        </div>
        {collection.skills.length === 0 && <p className="muted-copy">No skills in this command yet</p>}
        {collection.skills.map((skillId) => (
          <div className="included-skill" key={skillId}>
            <span>{skillId}</span>
            {usageCounts[skillId] !== undefined && (
              <span className="muted-copy">{usageCounts[skillId]} reads</span>
            )}
            <div className="skill-actions">
              <button
                type="button"
                onClick={() => handleRemoveSkill(skillId)}
                aria-label={`Remove ${skillId}`}
                className={FOCUS_RING}
              >
                <X size={14} weight="regular" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {inbox.length > 0 && (
        <div className="active-skills inbox-picker">
          <button
            type="button"
            className={`inbox-toggle ${FOCUS_RING}`}
            aria-expanded={inboxOpen}
            aria-controls={inboxPickerId}
            aria-label={`From Skills, ${inbox.length === 1 ? '1 skill' : `${inbox.length} skills`}`}
            onClick={() => setInboxOpen((open) => !open)}
          >
            <span>From Skills</span>
            <span className="count-pill">{inbox.length}</span>
            <CaretDown className="inbox-caret" size={14} weight="regular" aria-hidden="true" />
          </button>
          <div id={inboxPickerId} hidden={!inboxOpen} className="inbox-picker-list">
            <label className="search-box inbox-filter" htmlFor={`inbox-filter-${collection.name}`}>
              <span className="sr-only">Filter skills</span>
              <input
                id={`inbox-filter-${collection.name}`}
                value={inboxQuery}
                onChange={(event) => {
                  setInboxQuery(event.target.value);
                  setInboxPage(0);
                }}
                placeholder="Filter skills"
              />
            </label>
            {visibleInbox.length === 0 ? (
              <p className="muted-copy">No matching skills</p>
            ) : (
              visibleInbox.map((skillId) => {
                const added = collection.skills.includes(skillId);
                return (
                  <div className="library-skill" key={skillId}>
                    <div className="skill-info">
                      <div className="skill-name">{skillId}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAddFromInbox(skillId)}
                      aria-label={added ? `Added ${skillId}` : `Add ${skillId} to ${collection.name}`}
                      aria-pressed={added}
                      className={`add-icon-button ${FOCUS_RING}`}
                    >
                      {added ? (
                        <Check size={16} weight="regular" aria-hidden="true" />
                      ) : (
                        <Plus size={16} weight="regular" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
            {inboxPageCount > 1 && (
              <nav aria-label="Skills pages" className="page-row">
                <button
                  type="button"
                  aria-label="Previous skills page"
                  disabled={safeInboxPage === 0}
                  onClick={() => setInboxPage(safeInboxPage - 1)}
                  className={`filter ${FOCUS_RING}`}
                >
                  <CaretLeft size={14} weight="regular" aria-hidden="true" />
                </button>
                <span className="page-status">
                  Page {safeInboxPage + 1} of {inboxPageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next skills page"
                  disabled={safeInboxPage === inboxPageCount - 1}
                  onClick={() => setInboxPage(safeInboxPage + 1)}
                  className={`filter ${FOCUS_RING}`}
                >
                  <CaretRight size={14} weight="regular" aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConfirmDelete(false)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-collection-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Commands</p>
            <h2 id="delete-collection-title">Delete {collection.name}?</h2>
            <p className="muted-copy">This cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => void handleDelete()}>
                Delete command
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function selectCollection(event: KeyboardEvent<HTMLLIElement>, name: string, onSelect: (name: string) => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(name);
  }
}

function CollectionsPanel({ children }: { children: ReactNode }) {
  return (
    <section className="collections-panel panel-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Commands</h1>
          <p className="workspace-lede">
            Named SDLC knobs. File Skills onto them, then toggle a command on to write it as a human-only skill in
            both live trees.
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function CollectionList({
  children,
}: {
  children?: ReactNode;
  /** No-op: commands no longer bind a project folder to write. Kept so callers don't need to change. */
  onProjectBound?: (root: string) => void;
}) {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [inbox, setInbox] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    const [nextSkills, next] = await Promise.all([bridge.listSkills(), bridge.listCollections()]);
    if (id !== refreshId.current) return;
    setInbox(nextSkills.map((skill) => skill.id));
    setCollections(next);
    setSelectedName((current) => {
      if (current && next.some((collection) => collection.name === current)) return current;
      return next[0]?.name ?? null;
    });
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return bridge.onScan(() => {
      void refresh();
    });
  }, [bridge, refresh]);

  async function handleListToggle(collection: Collection) {
    setTogglingName(collection.name);
    await bridge.setCommandEnabled(collection.name, !collection.enabled);
    setTogglingName(null);
    await refresh();
  }

  const createSlot = isValidElement(children)
    ? cloneElement(children as ReactElement<{ onCreated?: (collection: Collection) => void }>, {
        onCreated: () => {
          void refresh();
        },
      })
    : children;

  const selected = collections ? (collections.find((collection) => collection.name === selectedName) ?? null) : null;

  return (
    <>
      <CollectionsPanel>
        {collections === null ? null : collections.length === 0 ? (
          <p className="muted-copy">No commands yet</p>
        ) : (
          <div className="command-stages">
            {groupCommandsByStage(collections).map((stage) => (
              <div className="command-stage" key={stage.key}>
                {stage.label && <p className="stage-label">{stage.label}</p>}
                <ul className="collection-list">
                  {stage.commands.map((collection) => (
                    <li
                      key={collection.name}
                      aria-label={`Command ${collection.name}`}
                      aria-current={collection.name === selectedName ? 'true' : undefined}
                      className={`collection-card ${collection.name === selectedName ? 'selected' : ''}`}
                      tabIndex={0}
                      onClick={() => setSelectedName(collection.name)}
                      onKeyDown={(event) => selectCollection(event, collection.name, setSelectedName)}
                    >
                      <div className="card-title">
                        <span>/{collection.name}</span>
                      </div>
                      <div className="skill-count">
                        <span>
                          {collection.skills.length} {collection.skills.length === 1 ? 'skill' : 'skills'}
                        </span>
                      </div>
                      <CommandToggle
                        collection={collection}
                        busy={togglingName === collection.name}
                        onToggle={() => void handleListToggle(collection)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {createSlot}
      </CollectionsPanel>
      {selected && (
        <CollectionDetail
          key={selected.name}
          collection={selected}
          inbox={inbox}
          onChange={refresh}
          onDeleted={refresh}
        />
      )}
    </>
  );
}
