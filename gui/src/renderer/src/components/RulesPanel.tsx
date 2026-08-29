import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, CircleNotch, DownloadSimple, ToggleLeft, ToggleRight } from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { conflictLabels, isRuleExportConflict } from '../lib/command-conflicts';
import { groupRulesByFolder, ruleFileName } from '../lib/rule-folders';
import type { IDE, RuleRecord } from '../../../shared/ipc';
import { StatusNotice, StatusSkeleton, statusLine } from '../../../../../shared/status';
import { StatusDialog } from './StatusDialog';
import { FORMAT_LABELS, folderName } from './format-context';

const DEST_DOCKS: IDE[] = ['cursor', 'claude', 'codex', 'copilot', 'agents'];

type PushOutcome =
  | { status: 'loading'; ide: IDE; dest?: string }
  | { status: 'success'; ide: IDE; dest?: string; path?: string }
  | { status: 'error'; ide: IDE; dest?: string; message: string; summary?: string };

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function dockPhrase(dock: IDE, dest?: string | null): string {
  return dest ? `${FORMAT_LABELS[dock]} in ${folderName(dest)}` : FORMAT_LABELS[dock];
}

function FormatPicker({ destDock, onDestDock }: { destDock: IDE; onDestDock: (dock: IDE) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="format-picker" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Pick format: ${FORMAT_LABELS[destDock]}`}
        className={`format-picker-trigger ${FOCUS_RING}`}
      >
        <span>{FORMAT_LABELS[destDock]}</span>
        <CaretDown size={12} weight="regular" aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Pick format" className="skill-install-menu import-copy-menu">
          {DEST_DOCKS.map((dock) => (
            <button
              key={dock}
              type="button"
              role="menuitemradio"
              aria-checked={dock === destDock}
              className={FOCUS_RING}
              onClick={() => {
                onDestDock(dock);
                setOpen(false);
              }}
            >
              {FORMAT_LABELS[dock]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlwaysOnToggle({
  rule,
  onToggle,
}: {
  rule: RuleRecord;
  onToggle: (rule: RuleRecord) => void;
}) {
  const canToggle = rule.canToggle;
  const icon = rule.alwaysApply ? (
    <ToggleRight size={18} weight="fill" aria-hidden="true" />
  ) : (
    <ToggleLeft size={18} weight="regular" aria-hidden="true" />
  );

  if (!canToggle) {
    if (!rule.alwaysApply) return null;
    return (
      <span className="always-on-toggle on">
        {icon}
        Always on
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`always-on-toggle ${rule.alwaysApply ? 'on' : 'off'} ${FOCUS_RING}`}
      aria-pressed={rule.alwaysApply}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(rule);
      }}
    >
      {icon}
      Always on
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
          {rule.path} · {FORMAT_LABELS[rule.dock]}
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

export default function RulesPanel({ onProjectBound }: { onProjectBound?: (root: string) => void }) {
  const bridge = useBridge();
  const [rules, setRules] = useState<RuleRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [destDock, setDestDock] = useState<IDE>('cursor');
  const [exportOutcome, setExportOutcome] = useState<PushOutcome | null>(null);
  const [conflict, setConflict] = useState<string[] | null>(null);
  const [exportDest, setExportDest] = useState<string | undefined>();
  const [toggleError, setToggleError] = useState(false);
  const refreshId = useRef(0);
  const isBusy = exportOutcome?.status === 'loading';

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

  async function bindPickedFolder(root: string | null, dest: string | undefined) {
    if (root || !dest) return;
    const bound = await bridge.bindProjectFolder(dest);
    if (!bound) return;
    onProjectBound?.(bound);
    await bridge.scan();
  }

  async function pickDest(
    replace: boolean,
    cached: string | undefined,
    setCached: (path: string) => void
  ): Promise<{ root: string | null; dest: string | undefined; target: string | undefined } | null> {
    const root = await bridge.getProjectRoot();
    let dest: string | undefined;
    if (!root) {
      dest = replace ? cached : undefined;
      if (dest === undefined) {
        const picked = await bridge.pickDestinationFolder();
        if (picked === null) return null;
        dest = picked;
        setCached(picked);
      }
    }
    return { root, dest, target: dest ?? root ?? undefined };
  }

  async function handleExport(replace?: boolean) {
    setConflict(null);
    const picked = await pickDest(replace === true, exportDest, setExportDest);
    if (!picked) return;
    const { root, dest, target } = picked;
    setExportOutcome({ status: 'loading', ide: destDock, dest: target });
    const result = await bridge.exportRules(destDock, {
      ...(replace ? { replace: true } : {}),
      ...(dest ? { dest } : {}),
    });

    if (!result.ok) {
      if (isRuleExportConflict(result)) {
        setExportOutcome(null);
        setConflict(conflictLabels(result));
        return;
      }
      setExportDest(undefined);
      setExportOutcome({ status: 'error', ide: destDock, dest: target, message: statusLine('export') });
      await bindPickedFolder(root, dest);
      return;
    }
    setExportDest(undefined);
    if (result.value.failures.length > 0 && result.value.succeeded.length === 0) {
      setExportOutcome({
        status: 'error',
        ide: destDock,
        dest: target,
        message: result.value.failures.join('\n'),
        summary: `Could not export rules to ${dockPhrase(destDock, target)}`,
      });
      await bindPickedFolder(root, dest);
      return;
    }
    if (result.value.failures.length > 0) {
      setExportOutcome({
        status: 'error',
        ide: destDock,
        dest: target,
        summary: `Exported some rules to ${dockPhrase(destDock, target)}`,
        message: result.value.failures.join('\n'),
      });
      await bindPickedFolder(root, dest);
      return;
    }
    if (result.value.succeeded.length === 0) {
      setExportOutcome({
        status: 'error',
        ide: destDock,
        dest: target,
        message: 'No rule files were written.',
        summary: `Could not export rules to ${dockPhrase(destDock, target)}`,
      });
      await bindPickedFolder(root, dest);
      return;
    }
    setExportOutcome({
      status: 'success',
      ide: destDock,
      dest: target,
      path: result.value.succeeded.join('\n'),
    });
    await bindPickedFolder(root, dest);
    await refresh();
  }

  async function handleToggle(rule: RuleRecord) {
    setToggleError(false);
    const result = await bridge.setAlwaysApply(rule.id, !rule.alwaysApply);
    if (!result.ok) {
      setToggleError(true);
      return;
    }
    await refresh();
  }

  const selected = rules?.find((rule) => rule.id === selectedId) ?? null;
  const hasRules = (rules?.length ?? 0) > 0;
  const groups = useMemo(() => groupRulesByFolder(rules ?? []), [rules]);

  return (
    <>
      <section className="rules-panel panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Rules</h1>
            <p className="workspace-lede">
              Every rule file in this project, including other formats. Export copies them into a dock.
            </p>
          </div>
          <div className="library-heading-actions">
            <FormatPicker destDock={destDock} onDestDock={setDestDock} />
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={!hasRules || isBusy}
              aria-busy={isBusy || undefined}
              className={`import-button ${FOCUS_RING}`}
            >
              {isBusy ? (
                <CircleNotch size={16} weight="regular" className="spin" aria-hidden="true" />
              ) : (
                <DownloadSimple size={16} weight="regular" aria-hidden="true" />
              )}
              Export
            </button>
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
                      <AlwaysOnToggle rule={rule} onToggle={(next) => void handleToggle(next)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {selected && <RulePreviewDialog key={selected.id} rule={selected} onClose={() => setSelectedId(null)} />}

      {exportOutcome && (
        <StatusDialog
          eyebrow="Export"
          title={
            exportOutcome.status === 'loading'
              ? 'Exporting…'
              : exportOutcome.status === 'success'
                ? 'Exported'
                : 'Export failed'
          }
          kind={exportOutcome.status}
          errorDetail={exportOutcome.status === 'error' ? exportOutcome.message : undefined}
          closeLabel="Close export status"
          onClose={() => setExportOutcome(null)}
        >
          {exportOutcome.status === 'loading' && (
            <p role="status" className="muted-copy">
              Exporting rules to {dockPhrase(exportOutcome.ide, exportOutcome.dest)}
            </p>
          )}
          {exportOutcome.status === 'success' && (
            <>
              <p className="status-copy-success">{`Exported rules to ${dockPhrase(exportOutcome.ide, exportOutcome.dest)}`}</p>
              {exportOutcome.path && <p className="status-path">{exportOutcome.path}</p>}
            </>
          )}
          {exportOutcome.status === 'error' && (
            <p role="alert" className="muted-copy text-destructive">
              {exportOutcome.summary ?? `Could not export rules to ${dockPhrase(exportOutcome.ide, exportOutcome.dest)}`}
            </p>
          )}
        </StatusDialog>
      )}

      {conflict && (
        <div className="modal-backdrop" role="presentation" onClick={() => setConflict(null)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-conflict-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Sync</p>
            <h2 id="rule-conflict-title">Replace existing rules?</h2>
            <p className="muted-copy">
              These rule files already exist in the dest dock. Replace overwrites them with the copies from this
              project.
            </p>
            {conflict.length > 0 && (
              <ul className="conflict-list" aria-label="Conflicting rules">
                {conflict.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={() => setConflict(null)}>
                Cancel
              </button>
              <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => void handleExport(true)}>
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
