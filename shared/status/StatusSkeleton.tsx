export type StatusSkeletonVariant = 'list' | 'cards' | 'preview';

const ROWS = 6;

const DEFAULT_LABEL: Record<StatusSkeletonVariant, string> = {
  list: 'Loading skills',
  cards: 'Loading rules',
  preview: 'Loading skill',
};

/** Loading templates. Callers pick a variant — markup and pulse stay here. */
export function StatusSkeleton({
  variant = 'list',
  label,
}: {
  variant?: StatusSkeletonVariant;
  label?: string;
}) {
  const name = label ?? DEFAULT_LABEL[variant];
  return (
    <div role="status" aria-busy="true" aria-label={name}>
      {variant === 'preview' ? (
        <PreviewTemplate />
      ) : variant === 'cards' ? (
        <CardTemplate />
      ) : (
        <ListTemplate />
      )}
    </div>
  );
}

function ListTemplate() {
  return (
    <ul className="skill-list status-skeleton" aria-hidden="true">
      {Array.from({ length: ROWS }, (_, index) => (
        <li key={index} className="library-skill status-skeleton-row">
          <span className="status-bar status-bar-rank" />
          <span className="status-bar status-bar-name" />
          <span className="status-bar status-bar-meta" />
        </li>
      ))}
    </ul>
  );
}

function CardTemplate() {
  return (
    <ul className="rules-grid status-skeleton status-skeleton-cards" aria-hidden="true">
      {Array.from({ length: ROWS }, (_, index) => (
        <li key={index} className="rule-card status-skeleton-card">
          <span className="status-bar status-bar-name" />
        </li>
      ))}
    </ul>
  );
}

function PreviewTemplate() {
  return (
    <div className="status-skeleton-preview" aria-hidden="true">
      <span className="status-bar status-bar-line" />
      <span className="status-bar status-bar-line wide" />
      <span className="status-bar status-bar-block" />
    </div>
  );
}
