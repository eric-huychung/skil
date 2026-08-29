import { statusCopy, type StatusKind } from '../../src/core/status-copy';

/** Friendly failure. `inline` is for row-level actions; default is a block with optional retry. */
export function StatusNotice({
  kind,
  onRetry,
  layout = 'block',
}: {
  kind: StatusKind;
  onRetry?: () => void;
  layout?: 'block' | 'inline';
}) {
  const { title, detail } = statusCopy(kind);
  if (layout === 'inline') {
    return (
      <span role="alert" className="status-notice-inline">
        {title}
      </span>
    );
  }

  return (
    <div className="status-notice" role="alert">
      <p className="status-notice-title">{title}</p>
      <p className="status-notice-copy">{detail}</p>
      {onRetry && (
        <button type="button" className="status-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
