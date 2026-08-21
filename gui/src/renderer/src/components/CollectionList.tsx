import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, Check, X } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection, IDE } from '../../../shared/ipc';

const IDE_OPTIONS: IDE[] = ['cursor', 'claude', 'windsurf'];

type ExportState = { status: 'success'; ide: IDE } | { status: 'error'; message: string };

function CollectionDetail({ collection, onChange }: { collection: Collection; onChange: () => void }) {
  const bridge = useBridge();
  const [skillInput, setSkillInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [exportIde, setExportIde] = useState<IDE>('cursor');
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  async function handleAddSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const skillId = skillInput.trim();
    if (!skillId) return;

    setError(null);
    const result = await bridge.addSkillToCollection(collection.name, skillId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSkillInput('');
    onChange();
  }

  async function handleRemoveSkill(skillId: string) {
    setError(null);
    const result = await bridge.removeSkillFromCollection(collection.name, skillId);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onChange();
  }

  async function handleExport() {
    setError(null);
    setExportState(null);
    setIsExporting(true);
    const result = await bridge.exportCollections([collection.name], exportIde);
    setIsExporting(false);

    if (!result.ok) {
      setExportState({ status: 'error', message: result.error.message });
      return;
    }
    if (result.value.failures.length > 0) {
      setExportState({ status: 'error', message: result.value.failures.join('; ') });
      return;
    }
    setExportState({ status: 'success', ide: exportIde });
  }

  return (
    <section className="detail-panel panel-section" aria-label={`Collection ${collection.name} details`}>
      <div className="detail-header">
        <div>
          <p className="eyebrow">Collection / {collection.name}</p>
          <h2>{collection.name}</h2>
          <p className="muted-copy">
            {collection.skills.length === 1 ? '1 skill' : `${collection.skills.length} skills`}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="target-row">
        <span>Target IDE</span>
        <label htmlFor={`export-ide-${collection.name}`} className="sr-only">
          {`Export ${collection.name} to`}
        </label>
        <select
          id={`export-ide-${collection.name}`}
          value={exportIde}
          onChange={(event) => setExportIde(event.target.value as IDE)}
          className={FOCUS_RING}
        >
          {IDE_OPTIONS.map((ide) => (
            <option key={ide} value={ide}>
              {ide.charAt(0).toUpperCase() + ide.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="active-skills">
        <div className="subheading">
          <span>Included skills</span>
          <span className="count-pill">{collection.skills.length}</span>
        </div>
        {collection.skills.map((skillId) => (
          <div className="included-skill" key={skillId}>
            <span className="checkmark" aria-hidden="true">
              <Check size={11} weight="regular" />
            </span>
            <span>{skillId}</span>
            <button
              type="button"
              onClick={() => handleRemoveSkill(skillId)}
              aria-label={`Remove ${skillId}`}
              className={FOCUS_RING}
            >
              <X size={14} weight="regular" />
            </button>
          </div>
        ))}
        <form onSubmit={handleAddSkill} className="add-skill-form">
          <label htmlFor={`add-skill-${collection.name}`} className="sr-only">
            {`Add skill to ${collection.name}`}
          </label>
          <div className="search-box">
            <input
              id={`add-skill-${collection.name}`}
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
              placeholder="Add a skill id"
              className={FOCUS_RING}
            />
          </div>
        </form>
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={isExporting}
        aria-label={`Export ${collection.name}`}
        className={`primary-button export-button ${FOCUS_RING}`}
      >
        <ArrowDown size={16} weight="regular" />
        {isExporting ? 'Exporting…' : 'Export Collection'}
      </button>
      {!isExporting && exportState?.status === 'success' && (
        <p className="muted-copy">{`Exported to ${exportState.ide}`}</p>
      )}
      {!isExporting && exportState?.status === 'error' && (
        <p role="alert" className="muted-copy text-destructive">
          {exportState.message}
        </p>
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
          <h1>Collections</h1>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function CollectionList({ children }: { children?: ReactNode }) {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await bridge.listCollections();
    setCollections(next);
    setSelectedName((current) => {
      if (current && next.some((collection) => collection.name === current)) return current;
      return next[0]?.name ?? null;
    });
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const form = children ? <div className="create-collection">{children}</div> : null;

  if (collections === null) {
    return <CollectionsPanel>{form}</CollectionsPanel>;
  }

  const selected = collections.find((collection) => collection.name === selectedName) ?? null;

  return (
    <>
      <CollectionsPanel>
        {collections.length === 0 ? (
          <p className="muted-copy">No collections yet</p>
        ) : (
          <ul className="collection-list">
            {collections.map((collection) => (
              <li
                key={collection.name}
                aria-label={`Collection ${collection.name}`}
                aria-current={collection.name === selectedName ? 'true' : undefined}
                className={`collection-card ${collection.name === selectedName ? 'selected' : ''}`}
                tabIndex={0}
                onClick={() => setSelectedName(collection.name)}
                onKeyDown={(event) => selectCollection(event, collection.name, setSelectedName)}
              >
                <div className="card-title">
                  <span>{collection.name}</span>
                </div>
                <div className="skill-count">
                  <span>
                    {collection.skills.length} {collection.skills.length === 1 ? 'skill' : 'skills'}
                  </span>
                  <span className="mini-dot" aria-hidden="true" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {form}
      </CollectionsPanel>
      {selected && <CollectionDetail collection={selected} onChange={refresh} />}
    </>
  );
}
