import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, GitBranch } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { formatInstalls } from '../lib/format-installs';
import type { MarketPreviewData, OriginStatus } from '../../../shared/ipc';

/** Strips SKILL.md's YAML frontmatter (`name` / `description`) — the dialog
 * title above already shows the name, and raw frontmatter reads as garbled
 * text if rendered as markdown body. */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

const AUDIT_LABEL: Record<MarketPreviewData['audit']['status'], string> = {
  pass: 'Audit passed',
  warn: 'Audit warning',
  fail: 'Audit failed',
  none: 'No audit',
};

/** Same pass/warn/fail/none → color mapping as the landing preview dialog's
 * `AUDIT_STYLES` (`web/components/landing/discover.tsx`), kept in sync so
 * Discover and Inbox read the same way. */
const AUDIT_BADGE_CLASS: Record<MarketPreviewData['audit']['status'], string> = {
  pass: 'bg-emerald-500/15 text-emerald-500',
  warn: 'bg-amber-500/15 text-amber-500',
  fail: 'bg-destructive/15 text-destructive',
  none: 'bg-secondary text-muted-foreground',
};

export default function SkillPreviewDialog({
  id,
  onClose,
  source,
  paths = [],
  originStatus,
  onReset,
}: {
  id: string;
  onClose: () => void;
  source: 'market' | 'local';
  paths?: string[];
  originStatus?: OriginStatus;
  onReset?: () => void;
}) {
  const bridge = useBridge();
  const [preview, setPreview] = useState<MarketPreviewData | null>(null);
  const [localMd, setLocalMd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setLocalMd(null);
    setError(null);

    const load =
      source === 'local'
        ? bridge.readSkillMd(id).then((result) => {
            if (cancelled) return;
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            setLocalMd(result.value);
          })
        : bridge.marketPreview(id).then((result) => {
            if (cancelled) return;
            if (!result.ok) {
              setError(result.error.message);
              return;
            }
            setPreview(result.value);
          });

    void load;
    return () => {
      cancelled = true;
    };
  }, [bridge, id, source]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleCopy() {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const title = preview?.name ?? id;
  const markdown = source === 'local' ? localMd : preview?.skillMd ?? null;
  const loading = !error && (source === 'local' ? localMd === null : preview === null);

  return createPortal(
    <div className="skill-details-backdrop" role="presentation" onClick={onClose}>
      <div
        className="skill-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label="Close details" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <p className="eyebrow">Skill</p>
        <h2 id="skill-preview-title">{title}</h2>
        {error && (
          <p role="alert" className="muted-copy text-destructive">
            {error}
          </p>
        )}
        {loading && (
          <p role="status" className="muted-copy">
            Loading&hellip;
          </p>
        )}
        {preview && (
          <div className="skill-meta-row">
            <span className={`audit-badge ${AUDIT_BADGE_CLASS[preview.audit.status]}`}>
              {AUDIT_LABEL[preview.audit.status]}
            </span>
            <span className="skill-installs">{formatInstalls(preview.installs)} installs</span>
            {preview.installUrl && (
              <a href={preview.installUrl} target="_blank" rel="noreferrer" className={`skill-details-link ${FOCUS_RING}`}>
                <GitBranch size={14} weight="regular" aria-hidden="true" />
                <span>Repository</span>
              </a>
            )}
          </div>
        )}
        {source === 'local' && paths.length > 0 && (
          <ul className="skill-delete-paths">
            {paths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        )}
        {originStatus === 'edited' && onReset && (
          <div className="skill-origin-row">
            <p className="muted-copy">This no longer matches the market copy.</p>
            <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={onReset}>
              Reset to market
            </button>
          </div>
        )}
        {markdown && (
          <div className="skill-md-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(markdown)}</ReactMarkdown>
          </div>
        )}
        {preview && (
          <div className="skill-copy-bar">
            <code className="skill-copy-command">{preview.installCommand}</code>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`primary-button skill-copy-button ${FOCUS_RING}`}
            >
              {copied ? <Check size={14} weight="regular" aria-hidden="true" /> : <Copy size={14} weight="regular" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
