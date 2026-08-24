import { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise, Folder, MagnifyingGlass, Moon, Question, Sun, Tray } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { useBridge } from './bridge-context';
import { FOCUS_RING } from './lib/focus-ring';
import { Logo } from './components/Logo';
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

function ConfigPanel({ root, onPick }: { root: string | null; onPick: () => void }) {
  const connected = Boolean(root);
  return (
    <section className="config-panel panel-section">
      <p className="eyebrow">Workspace</p>
      <h1>Sync</h1>
      <p className="workspace-lede">
        A snapshot of the last read-only scan of your project. Re-scan after editing the repo to refresh
        everything below.
      </p>

      <div className="config-card">
        <span className="connect-icon" aria-hidden="true">
          <Folder size={20} weight="regular" />
        </span>
        <div>
          <h2>Project folder</h2>
          <p className="sync-status">
            <span className={`sync-status-dot ${connected ? 'connected' : 'disconnected'}`} />
            {connected ? 'Connected' : 'No project connected'}
          </p>
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
          <p className="muted-copy">
            Connect a folder to read and write that project&apos;s .skil state. Skip this if you just want to
            sketch commands or browse skills.
          </p>
          <button
            type="button"
            className={`primary-button empty-pick-button ${FOCUS_RING}`}
            aria-label={root ? 'Change folder' : 'Pick folder'}
            onClick={onPick}
          >
            {root ? 'Change folder' : 'Pick folder'}
          </button>
        </div>
      </div>

      <div className="config-card">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2>Config is in dev</h2>
          <p className="muted-copy">Workspace sync and IDE configuration are coming soon.</p>
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
  const rootLoadId = useRef(0);
  // Remounting CollectionList via key is the simplest way to refresh it
  // after a mutation elsewhere (create) or after the engine is rebuilt
  // against a newly picked folder.
  const [collectionsVersion, setCollectionsVersion] = useState(0);

  useEffect(() => {
    const id = ++rootLoadId.current;
    void bridge.getProjectRoot().then((root) => {
      if (id === rootLoadId.current) setProjectRoot(root);
    });
  }, [bridge]);

  async function handlePickFolder() {
    const picked = await bridge.pickProjectFolder();
    rootLoadId.current += 1;
    if (picked === null) return;
    await bridge.scan();
    setProjectRoot(picked);
    setCollectionsVersion((version) => version + 1);
  }

  const boundRoot = typeof projectRoot === 'string' ? projectRoot : null;

  return (
    <div className={`app-shell ${theme === 'dark' ? 'dark-shell' : 'light-shell'}`}>
      <header className="topbar glass-nav">
        <div className="brand-mark">
          <Logo />
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

        {tab === 'config' && <ConfigPanel root={boundRoot} onPick={() => void handlePickFolder()} />}

        {tab === 'search' && <SkillSearch />}

        {tab === 'inbox' && <InboxPanel key={`${boundRoot ?? 'session'}:${collectionsVersion}`} />}

        {tab === 'collections' && (
          <CollectionList key={`${boundRoot ?? 'session'}:${collectionsVersion}`}>
            <CreateCollectionForm onCreated={() => setCollectionsVersion((version) => version + 1)} />
          </CollectionList>
        )}
      </div>

      <footer className="footer-bar">
        <span>
          <span className="live-dot" aria-hidden="true" /> Config is in dev
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
