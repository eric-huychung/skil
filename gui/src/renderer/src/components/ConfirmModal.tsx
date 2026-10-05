import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FOCUS_RING } from '../lib/focus-ring';

export default function ConfirmModal({
  eyebrow,
  title,
  titleId,
  onCancel,
  onConfirm,
  cancelLabel = 'Cancel',
  confirmLabel,
  confirmDisabled = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  titleId: string;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  children: ReactNode;
}) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="modal-actions">
          <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`primary-button ${FOCUS_RING}`}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
