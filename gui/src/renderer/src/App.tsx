import { useEffect, useRef, useState } from 'react';
import { Folder, GearSix, MagnifyingGlass, Moon, Question, Sparkle, Sun } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { useBridge } from './bridge-context';
import { FOCUS_RING } from './lib/focus-ring';
import CollectionList from './components/CollectionList';
import CreateCollectionForm from './components/CreateCollectionForm';
import SkillSearch from './components/SkillSearch';

type WorkspaceTab = 'config' | 'search' | 'collections';

const TABS: { id: WorkspaceTab; label: string; icon: typeof Folder }[] = [
  { id: 'config', label: 'Sync', icon: GearSix },
  { id: 'search', label: 'Discover', icon: MagnifyingGlass },
  { id: 'collections', label: 'Commands', icon: Folder },
];

function folderName(root: string): string {
  const parts = root.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.at(-1) ?? root;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`icon-button ${FOCUS_RING}`}
    >
      {theme === 'dark' ? <Sun size={17} weight="regular" /> : <Moon size={17} weight="regular" />}
    </button>
  );
}

function RailLabel({ tab }: { tab: (typeof TABS)[number] }) {
  return <span>{tab.label}</span>;
}

function ConfigPanel({ root, onPick }: { root: string | null; onPick: () => void }) {
  return (
    <section className="config-panel panel-section">
      <p className="eyebrow">Workspace</p>
      <h1>Sync</h1>

      <div className="config-card">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2>Project folder</h2>
          {root ? (
            <p className="project-folder-name" title={root}>
              {folderName(root)}
            </p>
          ) : (
            <p className="muted-copy">No project connected</p>
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
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-glyph" aria-hidden="true">
            <Sparkle size={15} weight="regular" />
          </span>
          <span>skil</span>
          <span className="beta-pill">BETA</span>
        </div>
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
                  <Icon size={17} weight="regular" aria-hidden="true" />
                  <RailLabel tab={item} />
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
            <Question size={17} weight="regular" aria-hidden="true" />
            <span>Help</span>
          </button>
        </nav>

        {tab === 'config' && <ConfigPanel root={boundRoot} onPick={() => void handlePickFolder()} />}

        {tab === 'search' && <SkillSearch />}

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
