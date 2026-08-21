import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { Collection } from '../../../shared/ipc';

export default function CreateCollectionForm({ onCreated }: { onCreated?: (collection: Collection) => void }) {
  const bridge = useBridge();
  const [name, setName] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);

  function addSkillFromInput() {
    const trimmed = skillInput.trim();
    if (trimmed && !skillIds.includes(trimmed)) {
      setSkillIds((current) => [...current, trimmed]);
    }
    setSkillInput('');
  }

  function handleSkillKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addSkillFromInput();
    }
  }

  function removeSkill(skillId: string) {
    setSkillIds((current) => current.filter((id) => id !== skillId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);

    const result = await bridge.createCollection(name, skillIds);
    if (!result.ok) {
      setNameError(result.error.message);
      return;
    }

    setName('');
    setSkillIds([]);
    setSkillInput('');
    onCreated?.(result.value);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="collection-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="collection-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'collection-name-error' : undefined}
          className={`rounded-md border border-input bg-transparent px-3 py-2 text-sm ${FOCUS_RING}`}
        />
        {nameError && (
          <p id="collection-name-error" role="alert" className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="collection-skills" className="text-sm font-medium">
          Skills
        </label>
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-transparent px-2 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
          {skillIds.map((skillId) => (
            <span
              key={skillId}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
            >
              {skillId}
              <button
                type="button"
                onClick={() => removeSkill(skillId)}
                aria-label={`Remove ${skillId}`}
                className={`rounded-sm text-muted-foreground hover:text-foreground ${FOCUS_RING}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="collection-skills"
            value={skillInput}
            onChange={(event) => setSkillInput(event.target.value)}
            onKeyDown={handleSkillKeyDown}
            onBlur={addSkillFromInput}
            placeholder="Add a skill id and press Enter"
            className="min-w-40 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      <button
        type="submit"
        className={`self-start primary-button ${FOCUS_RING}`}
      >
        Create collection
      </button>
    </form>
  );
}
