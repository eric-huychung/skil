import { useState, type ReactNode } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';
import { useTheme } from './theme';
import CollectionList from './components/CollectionList';
import CreateCollectionForm from './components/CreateCollectionForm';
import SkillSearch from './components/SkillSearch';

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
  // Remounting CollectionList via key is the simplest way to refresh it
  // after a mutation elsewhere (create) without a shared state store.
  const [collectionsVersion, setCollectionsVersion] = useState(0);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h1 className="text-sm font-medium">ContextKit</h1>
        <ThemeToggle />
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-10">
          <Section title="Collections">
            <CollectionList key={collectionsVersion} />
          </Section>
          <Section title="New collection">
            <CreateCollectionForm onCreated={() => setCollectionsVersion((version) => version + 1)} />
          </Section>
          <Section title="Find skills">
            <SkillSearch />
          </Section>
        </div>
      </main>
    </div>
  );
}
