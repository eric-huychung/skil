import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ToggleLeft, ToggleRight } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { groupRulesByFolder, ruleFileName } from '../lib/rule-folders';
import type { RuleRecord } from '../../../shared/ipc';
import { StatusNotice, StatusSkeleton } from '../../../../../shared/status';

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function SharedRuleToggle({
  rule,
  onToggle,
}: {
  rule: RuleRecord;
  onToggle: (rule: RuleRecord) => void;
}) {
  if (rule.kind === 'glob') {
    return <span className="always-on-toggle read-only">Path-scoped</span>;
  }

  const enabled = rule.enabled !== false;
  const icon = enabled ? (
    <ToggleRight size={18} weight="fill" aria-hidden="true" />
  ) : (
    <ToggleLeft size={18} weight="regular" aria-hidden="true" />
  );

  return (
    <button
      type="button"
      className={`always-on-toggle ${enabled ? 'on' : 'off'} ${FOCUS_RING}`}
      aria-pressed={enabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(rule);
      }}
    >
      {icon}
      {enabled ? 'On' : 'Off'}
    </button>
  );
}

function RulePreviewDialog({ rule, onClose }: { rule: RuleRecord; onClose: () => void }) {
  const bridge = useBridge();
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    setError(false);
    void bridge
      .readRule(rule.id)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(true);
          return;
        }
        setBody(result.value);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, rule.id, reloadKey]);

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

  return createPortal(
    <div className="skill-details-backdrop" role="presentation" onClick={onClose}>
      <div
        className="skill-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label="Close details" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <p className="eyebrow">Rule</p>
        <h2 id="rule-preview-title">{rule.name}</h2>
        <p className="muted-copy">
          {rule.path} · {rule.kind === 'shared' ? 'Shared law' : 'Path-scoped'}
        </p>
        {error && <StatusNotice kind="rule" onRetry={() => setReloadKey((key) => key + 1)} />}
        {body === null && !error && <StatusSkeleton variant="preview" label="Loading rule" />}
        {body !== null && (
          <div className="skill-md-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(body)}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function RulesPanel({ onProjectBound: _onProjectBound }: { onProjectBound?: (root: string) => void }) {
  const bridge = useBridge();
  const [rules, setRules] = useState<RuleRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState(false);
  const refreshId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    const next = await bridge.listRules();
    if (id !== refreshId.current) return;
    setRules(next);
    setSelectedId((current) => (current && next.some((rule) => rule.id === current) ? current : null));
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return bridge.onScan(() => {
      void refresh();
    });
  }, [bridge, refresh]);

  async function handleToggle(rule: RuleRecord) {
    setToggleError(false);
    const result = await bridge.setSharedRuleEnabled(rule.id, !(rule.enabled !== false));
    if (!result.ok) {
      setToggleError(true);
      return;
    }
    await refresh();
  }

  const selected = rules?.find((rule) => rule.id === selectedId) ?? null;
  const groups = useMemo(() => groupRulesByFolder(rules ?? []), [rules]);

  return (
    <>
      <section className="rules-panel panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Rules</h1>
            <p className="workspace-lede">
              Shared law lives in AGENTS.md — toggle a section on/off. Path-scoped rule files stay on disk as-is.
            </p>
          </div>
        </div>

        {toggleError && <StatusNotice kind="toggle" />}

        {rules === null ? (
          <StatusSkeleton variant="cards" />
        ) : rules.length === 0 ? (
          <p className="muted-copy">No rules yet</p>
        ) : (
          <div className="command-stages">
            {groups.map((group) => (
              <div className="command-stage" key={group.key || 'root'}>
                {group.label && <p className="stage-label">{group.label}</p>}
                <ul className="rules-grid">
                  {group.rules.map((rule) => (
                    <li key={rule.id} aria-label={`Rule ${rule.name}`} className="rule-card">
                      <button
                        type="button"
                        className={`library-skill-hit ${FOCUS_RING}`}
                        onClick={() => setSelectedId(rule.id)}
                        aria-haspopup="dialog"
                        aria-label={`Details for ${rule.name}`}
                      />
                      <span className="rule-card-name">{ruleFileName(rule.name)}</span>
                      <SharedRuleToggle rule={rule} onToggle={(next) => void handleToggle(next)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {selected && <RulePreviewDialog key={selected.id} rule={selected} onClose={() => setSelectedId(null)} />}
    </>
  );
}
