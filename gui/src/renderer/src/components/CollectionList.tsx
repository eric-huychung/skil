import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection, IDE } from '../../../shared/ipc';

const IDE_OPTIONS: IDE[] = ['cursor', 'claude', 'windsurf'];

type ExportState = { status: 'success'; ide: IDE } | { status: 'error'; message: string };

function CollectionRow({ collection, onChange }: { collection: Collection; onChange: () => void }) {
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
    <li
      aria-label={`Collection ${collection.name}`}
      className="flex flex-col gap-2 rounded-md border border-border px-3 py-2"
    >
      <span className="text-sm font-medium">{collection.name}</span>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ul className="flex flex-wrap items-center gap-2">
        {collection.skills.map((skillId) => (
          <li
            key={skillId}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
          >
            {skillId}
            <button
              type="button"
              onClick={() => handleRemoveSkill(skillId)}
              aria-label={`Remove ${skillId}`}
              className={`rounded-sm text-muted-foreground hover:text-foreground ${FOCUS_RING}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAddSkill} className="flex items-center gap-2">
        <label htmlFor={`add-skill-${collection.name}`} className="sr-only">
          {`Add skill to ${collection.name}`}
        </label>
        <input
          id={`add-skill-${collection.name}`}
          value={skillInput}
          onChange={(event) => setSkillInput(event.target.value)}
          placeholder="Add a skill id"
          className={`flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs ${FOCUS_RING}`}
        />
      </form>

      <div className="flex items-center gap-2">
        <label htmlFor={`export-ide-${collection.name}`} className="sr-only">
          {`Export ${collection.name} to`}
        </label>
        <select
          id={`export-ide-${collection.name}`}
          value={exportIde}
          onChange={(event) => setExportIde(event.target.value as IDE)}
          className={`rounded-md border border-input bg-transparent px-2 py-1 text-xs ${FOCUS_RING}`}
        >
          {IDE_OPTIONS.map((ide) => (
            <option key={ide} value={ide}>
              {ide}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          aria-label={`Export ${collection.name}`}
          className={`rounded-md border border-input px-2 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50 ${FOCUS_RING}`}
        >
          Export
        </button>
        {isExporting && <span className="text-xs text-muted-foreground">Exporting&hellip;</span>}
        {!isExporting && exportState?.status === 'success' && (
          <span className="text-xs text-foreground">{`Exported to ${exportState.ide}`}</span>
        )}
        {!isExporting && exportState?.status === 'error' && (
          <span role="alert" className="text-xs text-destructive">
            {exportState.message}
          </span>
        )}
      </div>
    </li>
  );
}

export default function CollectionList() {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);

  const refresh = useCallback(async () => {
    setCollections(await bridge.listCollections());
  }, [bridge]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (collections === null) {
    return null;
  }

  if (collections.length === 0) {
    return <p className="text-sm text-muted-foreground">No collections yet</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {collections.map((collection) => (
        <CollectionRow key={collection.name} collection={collection} onChange={refresh} />
      ))}
    </ul>
  );
}
