import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, BookOpen, Clock, Compass, Cube, Folder, Lightning, Moon, Question, Sun, Terminal, Trash, X } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { useBridge } from './bridge-context';
import { FOCUS_RING } from './lib/focus-ring';
import { countSkillsBySource, formatScannedAt } from './lib/skill-sources';
import { statusLine } from '../../../../shared/status';
import { folderLabel, folderPreview } from '../../shared/recent-folders';
import type { LeftoverRecord, SkillRecord } from '../../shared/ipc';
import CollectionList from './components/CollectionList';
import CreateCollectionForm from './components/CreateCollectionForm';
import InboxPanel from './components/InboxPanel';
import MarketDiscover from './components/MarketDiscover';
import RulesPanel from './components/RulesPanel';

type WorkspaceTab = 'config' | 'search' | 'inbox' | 'collections' | 'rules';

const TABS: { id: WorkspaceTab; label: string; icon: typeof Folder }[] = [
  { id: 'config', label: 'Sync', icon: ArrowsClockwise },
  { id: 'search', label: 'Discover', icon: Compass },
  { id: 'inbox', label: 'Skills', icon: Lightning },
  { id: 'collections', label: 'Commands', icon: Terminal },
  { id: 'rules', label: 'Rules', icon: BookOpen },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`icon-button ${FOCUS_RING}`}
    >
      {theme === 'dark' ? <Sun size={16} weight="regular" /> : <Moon size={16} weight="regular" />}
    </button>
  );
}

function ConfigPanel({
  root,
  lastScannedAt,
  onPick,
  onSwitch,
  onDisconnect,
}: {
  root: string | null;
  lastScannedAt: Date | null;
  onPick: () => void;
  onSwitch: (path: string) => void;
  onDisconnect: () => void;
}) {
  const bridge = useBridge();
  const connected = Boolean(root);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [leftovers, setLeftovers] = useState<LeftoverRecord[]>([]);
  const [adopting, setAdopting] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

  async function refreshLeftovers(): Promise<void> {
    if (!root) {
      setLeftovers([]);
      return;
    }
    const result = await bridge.listLeftovers();
    if (result.ok) setLeftovers(result.value);
  }

  async function handleAdoptLeftovers(): Promise<void> {
    setAdopting(true);
    setAdoptError(null);
    const result = await bridge.adoptLeftovers();
    setAdopting(false);
    if (!result.ok) {
      setAdoptError(statusLine('adopt'));
      return;
    }
    await refreshLeftovers();
  }

  useEffect(() => {
    if (!root) {
      setSkills([]);
      return;
    }
    let cancelled = false;
    void bridge.listSkills().then((next) => {
      if (!cancelled) setSkills(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, root, lastScannedAt]);

  useEffect(() => {
    let cancelled = false;
    void bridge.listRecentFolders().then((next) => {
      if (!cancelled) setRecents(next);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, root]);

  useEffect(() => {
    let cancelled = false;
    void bridge.listLeftovers().then((result) => {
      if (!cancelled && result.ok) setLeftovers(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, root, lastScannedAt]);

  const bySource = countSkillsBySource(skills);
  const maxSourceCount = Math.max(...bySource.map((row) => row.count), 1);

  return (
    <section className="config-panel panel-section">
      <div className="section-heading">
        <div>
          <h1>Sync</h1>
          <p className="workspace-lede">Last scan of this folder. Re-scan if nothing on disk changed.</p>
        </div>
      </div>

      {recents.length > 0 && (
        <section className="recent-folders" aria-labelledby="recent-folders-title">
          <h2 id="recent-folders-title">Recent folders</h2>
          <p className="muted-copy">Last five project folders. Click to switch, or remove from this list.</p>
          <div className="recent-list">
            {recents.map((path) => {
              const current = path === root;
              const name = folderLabel(path);
              const preview = folderPreview(path);
              return (
                <div className="recent-card-wrap" key={path}>
                  {current ? (
                    <div className="recent-card glass-panel" aria-current="true">
                      <span className="connect-icon" aria-hidden="true">
                        <Folder size={16} weight="regular" />
                      </span>
                      <div className="recent-card-body">
                        <p className="recent-card-name">
                          <span className="recent-card-label">{name}</span>
                          <span className="current-pill">Current</span>
                        </p>
                        <p className="recent-card-path" title={path}>
                          {preview}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`recent-card glass-panel ${FOCUS_RING}`}
                      aria-label={`Switch to ${path}`}
                      title={path}
                      onClick={() => setPendingSwitch(path)}
                    >
                      <span className="connect-icon" aria-hidden="true">
                        <Folder size={16} weight="regular" />
                      </span>
                      <div className="recent-card-body">
                        <p className="recent-card-name">
                          <span className="recent-card-label">{name}</span>
                        </p>
                        <p className="recent-card-path">{preview}</p>
                      </div>
                    </button>
                  )}
                  <button
                    type="button"
                    className={`recent-remove ${FOCUS_RING}`}
                    aria-label={`Remove ${path} from recents`}
                    title="Remove"
                    onClick={() => setPendingRemove(path)}
                  >
                    <X size={14} weight="regular" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="config-card-wrap">
        <button
          type="button"
          className={`config-card ${FOCUS_RING}`}
          aria-label={root ? 'Change folder' : 'Pick folder'}
          title={root ? 'Change folder' : 'Pick folder'}
          onClick={onPick}
        >
          <span className="connect-icon" aria-hidden="true">
            <Folder size={20} weight="regular" />
          </span>
          <div className="config-card-body">
            <div className="config-card-head">
              <div>
                <h2>Project folder</h2>
                <p className="sync-status">
                  <span className={`sync-status-dot ${connected ? 'connected' : 'disconnected'}`} />
                  {connected ? 'Connected' : 'No project connected'}
                </p>
              </div>
            </div>
            {root ? (
              <p className="project-folder-name" title={root}>
                {root}
              </p>
            ) : (
              <p className="muted-copy">
                Point Skil at a project folder to read its .cursor, .claude, .codex, .github, .agents, and
                .windsurf files. No login needed.
              </p>
            )}
            <p className="last-scanned">
              <Clock size={14} weight="regular" aria-hidden="true" />
              Last scanned {formatScannedAt(lastScannedAt)}
            </p>
          </div>
        </button>
      </div>

      <div className="sync-metrics">
        <div className="skills-found-card glass-panel">
          <Cube size={16} weight="regular" className="found-icon" aria-hidden="true" />
          <p className="found-value">{skills.length}</p>
          <p className="found-label">Skills found</p>
        </div>
        <div className="skills-source-card glass-panel">
          <h2>Skills by source</h2>
          <p className="muted-copy">Where each skill was discovered across your agent config folders.</p>
          <div className="source-list">
            {bySource.map(({ source, count }) => (
              <div className="source-row" key={source}>
                <span className="source-name">{source}</span>
                <div className="source-bar" aria-hidden="true">
                  <div
                    className="source-bar-fill"
                    style={{ width: `${(count / maxSourceCount) * 100}%` }}
                  />
                </div>
                <span className="source-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {connected && leftovers.length > 0 && (
        <section className="leftovers-card glass-panel" aria-labelledby="leftovers-title">
          <div className="section-heading">
            <div>
              <h2 id="leftovers-title">Leftovers</h2>
              <p className="muted-copy">
                Skill, command, and rule paths outside the two live trees. Not on/not off — just old homes we found.
              </p>
            </div>
            <button
              type="button"
              className={`import-button ${FOCUS_RING}`}
              disabled={adopting}
              onClick={() => void handleAdoptLeftovers()}
            >
              <Trash size={14} weight="regular" aria-hidden="true" />
              Use ours and remove leftovers
            </button>
          </div>
          {adoptError && (
            <p role="alert" className="muted-copy text-destructive">
              {adoptError}
            </p>
          )}
          <ul className="conflict-list" aria-label="Leftover paths">
            {leftovers.map((row) => (
              <li key={row.path}>
                <span className="leftover-kind">{row.kind}</span> {row.path}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendingSwitch && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingSwitch(null)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="switch-folder-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Workspace</p>
            <h2 id="switch-folder-title">Switch folder?</h2>
            <p className="muted-copy">
              Open {folderLabel(pendingSwitch)} instead. Sync, Skills, Commands, and Rules will reload from that
              project.
            </p>
            <p className="recent-card-path">{pendingSwitch}</p>
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={() => setPendingSwitch(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`primary-button ${FOCUS_RING}`}
                onClick={() => {
                  const next = pendingSwitch;
                  setPendingSwitch(null);
                  onSwitch(next);
                }}
              >
                Switch folder
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRemove && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingRemove(null)}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-folder-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Workspace</p>
            <h2 id="remove-folder-title">Remove folder?</h2>
            <p className="muted-copy">
              {pendingRemove === root
                ? `Forget ${folderLabel(pendingRemove)} and disconnect it. Files on disk stay.`
                : `Forget ${folderLabel(pendingRemove)} from this list. Files on disk stay.`}
            </p>
            <p className="recent-card-path">{pendingRemove}</p>
            <div className="modal-actions">
              <button type="button" className={`outline-button ${FOCUS_RING}`} onClick={() => setPendingRemove(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`primary-button ${FOCUS_RING}`}
                onClick={() => {
                  const path = pendingRemove;
                  setPendingRemove(null);
                  void bridge.removeRecentFolder(path).then((next) => {
                    setRecents(next);
                    if (path === root) onDisconnect();
                  });
                }}
              >
                Remove folder
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

export default function App() {
  const { theme } = useTheme();
  const bridge = useBridge();
  const [tab, setTab] = useState<WorkspaceTab>('collections');
  const [helpOpen, setHelpOpen] = useState(false);
  const [projectRoot, setProjectRoot] = useState<string | null | undefined>(undefined);
  const [lastScannedAt, setLastScannedAt] = useState<Date | null>(null);
  const [scanning, setScanning] = useState(false);
  const rootLoadId = useRef(0);
  // Remounting CollectionList via key refreshes it after a watcher scan
  // or after the engine is rebuilt against a newly picked folder.
  const [collectionsVersion, setCollectionsVersion] = useState(0);

  useEffect(() => {
    const id = ++rootLoadId.current;
    void bridge.getProjectRoot().then(async (root) => {
      if (id !== rootLoadId.current) return;
      setProjectRoot(root);
      if (!root) return;
      setScanning(true);
      await bridge.scan();
      if (id !== rootLoadId.current) return;
      setScanning(false);
      setLastScannedAt(new Date());
    });
  }, [bridge]);

  useEffect(() => {
    return bridge.onScan(() => {
      setLastScannedAt(new Date());
    });
  }, [bridge]);

  const boundRoot = typeof projectRoot === 'string' ? projectRoot : null;

  function handleProjectBound(root: string) {
    setProjectRoot(root);
  }

  async function handleBindFolder(path: string) {
    const bound = await bridge.bindProjectFolder(path);
    rootLoadId.current += 1;
    if (!bound) return;
    setScanning(true);
    await bridge.scan();
    setScanning(false);
    setLastScannedAt(new Date());
    setProjectRoot(bound);
    setCollectionsVersion((version) => version + 1);
  }

  async function handlePickFolder() {
    const picked = await bridge.pickProjectFolder();
    rootLoadId.current += 1;
    if (picked === null) return;
    setScanning(true);
    await bridge.scan();
    setScanning(false);
    setLastScannedAt(new Date());
    setProjectRoot(picked);
    setCollectionsVersion((version) => version + 1);
  }

  async function handleRescan() {
    if (!boundRoot) return;
    setScanning(true);
    await bridge.scan();
    setScanning(false);
  }

  return (
    <div className={`app-shell ${theme === 'dark' ? 'dark-shell' : 'light-shell'}`}>
      <header className="topbar glass-nav">
        <div className="brand-mark">
          <span className="wordmark">Skil</span>
          <span className="beta-pill">BETA</span>
        </div>
        {boundRoot && (
          <div className="path-cluster">
            <span className="path-pill glass-panel" title={boundRoot}>
              {boundRoot}
            </span>
            <button
              type="button"
              className={`icon-button ${FOCUS_RING}`}
              aria-label="Re-scan"
              title="Re-scan"
              disabled={scanning}
              onClick={() => void handleRescan()}
            >
              <ArrowsClockwise
                size={16}
                weight="regular"
                className={scanning ? 'spin' : undefined}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
        <div className="top-actions">
          <ThemeToggle />
        </div>
      </header>

      <div className={`workspace workspace-${tab}`}>
        <nav className="rail" aria-label="Workspace">
          <div role="tablist" aria-label="Workspace">
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-label={item.label}
                  aria-selected={selected}
                  className={`rail-item ${selected ? 'active' : ''} ${FOCUS_RING}`}
                  onClick={() => setTab(item.id)}
                >
                  <span className="rail-icon">
                    <Icon size={16} weight="regular" aria-hidden="true" />
                    {item.id === 'config' && (
                      <span
                        className={`sync-dot ${boundRoot ? 'connected' : 'disconnected'}`}
                        title={boundRoot ? 'Folder connected' : 'No folder connected'}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="rail-label" aria-hidden="true">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={`rail-item help-item ${FOCUS_RING}`}
            aria-label="Help"
            onClick={() => setHelpOpen(true)}
          >
            <Question size={16} weight="regular" aria-hidden="true" />
            <span className="rail-label" aria-hidden="true">
              Help
            </span>
          </button>
        </nav>

        {tab === 'config' && (
          <ConfigPanel
            root={boundRoot}
            lastScannedAt={lastScannedAt}
            onPick={() => void handlePickFolder()}
            onSwitch={(path) => void handleBindFolder(path)}
            onDisconnect={() => {
              setProjectRoot(null);
              setLastScannedAt(null);
              setCollectionsVersion((version) => version + 1);
            }}
          />
        )}

        {tab === 'search' && <MarketDiscover />}

        {tab === 'inbox' && <InboxPanel key={boundRoot ?? 'session'} />}

        {tab === 'collections' && (
          <CollectionList key={collectionsVersion} onProjectBound={handleProjectBound}>
            <CreateCollectionForm />
          </CollectionList>
        )}

        {tab === 'rules' && <RulesPanel key={collectionsVersion} onProjectBound={handleProjectBound} />}
      </div>

      <footer className="footer-bar">
        <span>
          <span className="live-dot" aria-hidden="true" />
        </span>
        <span>skil 0.3.0</span>
      </footer>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label="Close help" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <p className="eyebrow">Support</p>
        <h2 id="help-title">How can we help?</h2>
        <p className="muted-copy">
          Sync, export, and search all run through the same engine the CLI uses.
        </p>
        <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
