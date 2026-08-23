import { useEffect, useRef, useState } from 'react';
import { Check, CircleNotch, DownloadSimple } from '@phosphor-icons/react';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import type { IDE } from '../../../shared/ipc';
import { StatusDialog } from './StatusDialog';

const IDE_OPTIONS: IDE[] = ['cursor', 'claude', 'windsurf', 'agents'];

export function ideLabel(ide: IDE): string {
  return ide.charAt(0).toUpperCase() + ide.slice(1);
}

export function folderName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? path;
}

export function targetPhrase(ide: IDE, dest?: string | null): string {
  return dest ? `${ideLabel(ide)} in ${folderName(dest)}` : ideLabel(ide);
}

export { IDE_OPTIONS };

type Outcome =
  | { status: 'loading'; ide: IDE; dest?: string }
  | { status: 'success'; ide: IDE; dest?: string; path?: string }
  | { status: 'error'; ide: IDE; dest?: string; message: string };

export function InstallSkill({
  skillId,
  instance,
}: {
  skillId: string;
  instance: string;
}) {
  const bridge = useBridge();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [lastSuccessIde, setLastSuccessIde] = useState<IDE | null>(null);
  const menuId = `install-ide-${instance}-${skillId}`;
  const busy = outcome?.status === 'loading';

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  async function handleInstall(ide: IDE) {
    setMenuOpen(false);
    const root = await bridge.getProjectRoot();
    let dest: string | undefined;
    if (root === null) {
      const picked = await bridge.pickDestinationFolder();
      if (picked === null) return;
      dest = picked;
    }
    const target = dest ?? root ?? undefined;
    setOutcome({ status: 'loading', ide, dest: target });
    const result = await bridge.install(skillId, ide, dest ? { dest } : undefined);
    if (!result.ok) {
      setOutcome({ status: 'error', ide, dest: target, message: result.error.message });
      return;
    }
    setLastSuccessIde(ide);
    setOutcome({
      status: 'success',
      ide,
      dest: target,
      path: result.value.deployedTo.at(-1)?.path,
    });
  }

  const buttonLabel = busy
    ? `Installing ${skillId}`
    : lastSuccessIde
      ? `Installed ${skillId}`
      : `Install ${skillId}`;

  return (
    <div className="skill-install" ref={rootRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        disabled={busy}
        aria-label={buttonLabel}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-busy={busy || undefined}
        aria-pressed={lastSuccessIde !== null}
        className={`add-icon-button ${FOCUS_RING}`}
      >
        {busy ? (
          <CircleNotch size={16} weight="regular" className="spin" aria-hidden="true" />
        ) : lastSuccessIde ? (
          <Check size={16} weight="regular" aria-hidden="true" />
        ) : (
          <DownloadSimple size={16} weight="regular" aria-hidden="true" />
        )}
      </button>
      {menuOpen && (
        <div id={menuId} role="menu" aria-label={`Install ${skillId} to`} className="skill-install-menu">
          {IDE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitem"
              className={FOCUS_RING}
              onClick={() => void handleInstall(option)}
            >
              {ideLabel(option)}
            </button>
          ))}
        </div>
      )}
      {outcome && (
        <InstallOutcomeDialog skillId={skillId} outcome={outcome} onClose={() => setOutcome(null)} />
      )}
    </div>
  );
}

function InstallOutcomeDialog({
  skillId,
  outcome,
  onClose,
}: {
  skillId: string;
  outcome: Outcome;
  onClose: () => void;
}) {
  const title =
    outcome.status === 'loading' ? 'Installing…' : outcome.status === 'success' ? 'Installed' : 'Install failed';

  return (
    <StatusDialog
      eyebrow="Install"
      title={title}
      kind={outcome.status}
      errorDetail={outcome.status === 'error' ? outcome.message : undefined}
      closeLabel="Close install status"
      onClose={onClose}
    >
      {outcome.status === 'loading' && (
        <p role="status" className="muted-copy">
          Installing {skillId} to {targetPhrase(outcome.ide, outcome.dest)}
        </p>
      )}
      {outcome.status === 'success' && (
        <>
          <p className="status-copy-success">
            Installed {skillId} to {targetPhrase(outcome.ide, outcome.dest)}
          </p>
          {outcome.path && <p className="status-path">{outcome.path}</p>}
        </>
      )}
      {outcome.status === 'error' && (
        <p role="alert" className="muted-copy text-destructive">
          {`Could not install ${skillId} to ${targetPhrase(outcome.ide, outcome.dest)}`}
        </p>
      )}
    </StatusDialog>
  );
}
