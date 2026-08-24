import { useEffect, useRef, useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';
import { FOCUS_RING } from '../lib/focus-ring';
import type { IDE } from '../../../shared/ipc';
import { IDE_OPTIONS } from './InstallSkill';

export const FORMAT_LABELS: Record<IDE, string> = {
  cursor: 'Cursor',
  claude: 'Claude Code',
  windsurf: 'Windsurf',
  agents: 'Agents',
};

export function FormatSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: IDE;
  disabled?: boolean;
  onChange: (ide: IDE) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="format-select" ref={rootRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`format-trigger ${FOCUS_RING}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{FORMAT_LABELS[value]}</span>
        <CaretDown size={16} weight="regular" aria-hidden="true" />
      </button>
      {open && (
        <div className="format-menu" role="listbox" aria-label={label}>
          {IDE_OPTIONS.map((ide) => (
            <button
              key={ide}
              type="button"
              role="option"
              aria-selected={ide === value}
              className={`format-option ${FOCUS_RING}`}
              onClick={() => {
                onChange(ide);
                setOpen(false);
              }}
            >
              <span>{FORMAT_LABELS[ide]}</span>
              {ide === value && <Check size={14} weight="regular" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
