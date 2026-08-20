import { useEffect, useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { useBridge } from './bridge-context';
import type { Collection } from '../../shared/ipc';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-accent"
    >
      {theme === 'dark' ? <Sun size={16} weight="regular" /> : <Moon size={16} weight="regular" />}
    </button>
  );
}

export default function App() {
  const bridge = useBridge();
  const [collections, setCollections] = useState<Collection[] | null>(null);

  useEffect(() => {
    bridge.listCollections().then(setCollections);
  }, [bridge]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-medium">ContextKit</h1>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">
          {collections === null
            ? 'Loading collections\u2026'
            : collections.length === 0
              ? 'No collections yet'
              : `${collections.length} collection${collections.length === 1 ? '' : 's'}`}
        </p>
      </main>
    </div>
  );
}
