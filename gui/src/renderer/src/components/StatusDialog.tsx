import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleNotch } from '@phosphor-icons/react';
import { FOCUS_RING } from '../lib/focus-ring';

export type StatusKind = 'loading' | 'success' | 'error';

export function StatusDialog({
  eyebrow,
  title,
  kind,
  children,
  errorDetail,
  closeLabel,
  onClose,
}: {
  eyebrow: string;
  title: string;
  kind: StatusKind;
  children: ReactNode;
  errorDetail?: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const canClose = kind !== 'loading';

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && canClose) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [canClose, onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (canClose) onClose();
      }}
    >
      <div
        className={`help-modal status-${kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={kind === 'loading' || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {canClose && (
          <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label={closeLabel} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        )}
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        {kind === 'loading' && (
          <div className="install-status">
            <CircleNotch size={22} weight="regular" className="spin" aria-hidden="true" />
            {children}
          </div>
        )}
        {kind === 'success' && children}
        {kind === 'error' && (
          <>
            {children}
            {errorDetail && (
              <details className="install-details">
                <summary className={FOCUS_RING}>Details</summary>
                <pre>{errorDetail}</pre>
              </details>
            )}
          </>
        )}
        {canClose && (
          <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
