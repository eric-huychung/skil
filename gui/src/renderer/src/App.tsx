import { useState } from 'react';
import { Folder, GearSix, MagnifyingGlass, Moon, Question, Sparkle, Sun } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { FOCUS_RING } from './lib/focus-ring';
import CollectionList from './components/CollectionList';
import CreateCollectionForm from './components/CreateCollectionForm';
import SkillSearch from './components/SkillSearch';

type WorkspaceTab = 'config' | 'search' | 'collections';

const TABS: { id: WorkspaceTab; label: string; icon: typeof Folder }[] = [
  { id: 'config', label: 'Sync & Config', icon: GearSix },
  { id: 'search', label: 'Search & Install', icon: MagnifyingGlass },
  { id: 'collections', label: 'Collections', icon: Folder },
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
      {theme === 'dark' ? <Sun size={17} weight="regular" /> : <Moon size={17} weight="regular" />}
    </button>
  );
}

function RailLabel({ tab }: { tab: (typeof TABS)[number] }) {
  if (tab.id === 'config') {
    return (
      <span>
        Sync &<br />
        Config
      </span>
    );
  }
  if (tab.id === 'search') {
    return (
      <span>
        Search &<br />
        Install
      </span>
    );
  }
  return <span>Collections</span>;
}

function ConfigPanel() {
  return (
    <section className="config-panel panel-section">
      <p className="eyebrow">Workspace</p>
      <h1>Sync &amp; Config</h1>
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
  const [tab, setTab] = useState<WorkspaceTab>('collections');
  const [helpOpen, setHelpOpen] = useState(false);
  // Remounting CollectionList via key is the simplest way to refresh it
  // after a mutation elsewhere (create) without a shared state store.
  const [collectionsVersion, setCollectionsVersion] = useState(0);

  return (
    <div className={`app-shell ${theme === 'dark' ? 'dark-shell' : 'light-shell'}`}>
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-glyph" aria-hidden="true">
            <Sparkle size={15} weight="regular" />
          </span>
          <span>ContextKit</span>
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

        {tab === 'config' && <ConfigPanel />}

        {tab === 'search' && <SkillSearch />}

        {tab === 'collections' && (
          <CollectionList key={collectionsVersion}>
            <CreateCollectionForm onCreated={() => setCollectionsVersion((version) => version + 1)} />
          </CollectionList>
        )}
      </div>

      <footer className="footer-bar">
        <span>
          <span className="live-dot" aria-hidden="true" /> Config is in dev
        </span>
        <span>ContextKit 0.2.2</span>
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
          Sync, export, and search all run through the same CollectionEngine the CLI uses. Config sync in the GUI is
          still in development.
        </p>
        <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
