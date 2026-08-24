import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, Clock, Cube, Folder, FolderOpen, MagnifyingGlass, Moon, Question, Sun, Tray } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { useBridge } from './bridge-context';
import { FOCUS_RING } from './lib/focus-ring';
import { countSkillsBySource, formatScannedAt } from './lib/skill-sources';
import type { SkillRecord } from '../../shared/ipc';
import CollectionList from './components/CollectionList';
import CreateCollectionForm from './components/CreateCollectionForm';
import InboxPanel from './components/InboxPanel';
import SkillSearch from './components/SkillSearch';

type WorkspaceTab = 'config' | 'search' | 'inbox' | 'collections';

const TABS: { id: WorkspaceTab; label: string; icon: typeof Folder }[] = [
  { id: 'config', label: 'Sync', icon: ArrowsClockwise },
  { id: 'search', label: 'Discover', icon: MagnifyingGlass },
  { id: 'inbox', label: 'Inbox', icon: Tray },
  { id: 'collections', label: 'Commands', icon: Folder },
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
  scanning,
  lastScannedAt,
  onPick,
  onRescan,
}: {
  root: string | null;
  scanning: boolean;
  lastScannedAt: Date | null;
  onPick: () => void;
  onRescan: () => void;
}) {
  const bridge = useBridge();
  const connected = Boolean(root);
  const [skills, setSkills] = useState<SkillRecord[]>([]);

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

  const bySource = countSkillsBySource(skills);
  const maxSourceCount = Math.max(...bySource.map((row) => row.count), 1);

  return (
    <section className="config-panel panel-section">
      <p className="eyebrow">Workspace</p>
      <h1>Sync</h1>
      <p className="workspace-lede">
        A snapshot of the last scan of your project. Disk edits refresh on their own. Re-scan if nothing on disk changed.
      </p>

      <div className="config-card">
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
            <div className="folder-actions">
              <button
                type="button"
                className={`icon-button ${FOCUS_RING}`}
                aria-label={root ? 'Change folder' : 'Pick folder'}
                title={root ? 'Change folder' : 'Pick folder'}
                onClick={onPick}
              >
                <FolderOpen size={16} weight="regular" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`icon-button ${FOCUS_RING}`}
                aria-label="Re-scan"
                title="Re-scan"
                disabled={!connected || scanning}
                onClick={onRescan}
              >
                <ArrowsClockwise
                  size={16}
                  weight="regular"
                  className={scanning ? 'spin' : undefined}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          {root ? (
            <p className="project-folder-name" title={root}>
              {root}
            </p>
          ) : (
            <p className="muted-copy">
              Point Skil at a project folder to read its .cursor, .claude, .windsurf, and .agents files. No
              login needed.
            </p>
          )}
          <p className="last-scanned">
            <Clock size={14} weight="regular" aria-hidden="true" />
            Last scanned {formatScannedAt(lastScannedAt)}
          </p>
        </div>
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
    void bridge.getProjectRoot().then((root) => {
      if (id === rootLoadId.current) setProjectRoot(root);
    });
  }, [bridge]);

  useEffect(() => {
    return bridge.onScan(() => {
      setLastScannedAt(new Date());
      setCollectionsVersion((version) => version + 1);
    });
  }, [bridge]);

  const boundRoot = typeof projectRoot === 'string' ? projectRoot : null;

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
          <span className="path-pill glass-panel" title={boundRoot}>
            {boundRoot}
          </span>
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
                  title={item.label}
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
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={`rail-item help-item ${FOCUS_RING}`}
            aria-label="Help"
            title="Help"
            onClick={() => setHelpOpen(true)}
          >
            <Question size={16} weight="regular" aria-hidden="true" />
          </button>
        </nav>

        {tab === 'config' && (
          <ConfigPanel
            root={boundRoot}
            scanning={scanning}
            lastScannedAt={lastScannedAt}
            onPick={() => void handlePickFolder()}
            onRescan={() => void handleRescan()}
          />
        )}

        {tab === 'search' && <SkillSearch />}

        {tab === 'inbox' && <InboxPanel key={boundRoot ?? 'session'} />}

        {tab === 'collections' && (
          <CollectionList key={`${boundRoot ?? 'session'}:${collectionsVersion}`}>
            <CreateCollectionForm />
          </CollectionList>
        )}
      </div>

      <footer className="footer-bar">
        <span>
          <span className="live-dot" aria-hidden="true" />
        </span>
        <span>skil 0.2.2</span>
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
          Sync, export, and search all run through the same engine the CLI uses. Config sync in the GUI is
          still in development.
        </p>
        <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
