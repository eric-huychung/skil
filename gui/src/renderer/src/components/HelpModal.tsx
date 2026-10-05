import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bug,
  Folder,
  GithubLogo,
  Globe,
  Heart,
  Lightbulb,
  LinkedinLogo,
  MagnifyingGlass,
  Stethoscope,
} from '@phosphor-icons/react';
import { version as APP_VERSION } from '../../../../package.json';
import { useBridge } from '../bridge-context';
import { FOCUS_RING } from '../lib/focus-ring';
import { PRODUCT_LINKS } from '../../../shared/app-update';

export type HelpTab = 'faq' | 'instructions' | 'about';

const TABS: { id: HelpTab; label: string; title: string; lede: string }[] = [
  {
    id: 'instructions',
    label: 'How it works',
    title: 'Three problems. One map.',
    lede: "Skil doesn't invent a new format. It reads what your agents already use and gives it structure.",
  },
  {
    id: 'faq',
    label: 'FAQs',
    title: 'FAQs',
    lede: 'Short answers. More later.',
  },
  {
    id: 'about',
    label: 'About',
    title: 'About Skil',
    lede: 'Find skills, organize them, and kill the dead ones.',
  },
];

/** Keep in sync with web/app/faq/page.tsx */
const FAQ = [
  {
    q: 'What is Skil?',
    a: 'A local catalog for agent skills. Find them, file them onto workflows like /build, and see which ones still earn their tokens. macOS app + CLI. No login.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. No account. Catalog is .skil/state.json in that folder. Discover fetches listings (skills.sh via skil.website). The website uses Vercel Analytics. Scan, toggles, doctor stay local.',
  },
  {
    q: 'I turned a skill off. Is it gone?',
    a: 'No. Off parks it under .skil/parked. Not deleted. Toggle on restores the live pair in .agents and .claude.',
  },
  {
    q: "What's the difference between Discover and Skills?",
    a: "Discover is the market (skills.sh rankings). Skills is what's already in this project.",
  },
  {
    q: 'What is a command?',
    a: 'A workflow like /build. Filing a skill onto a command does not turn the skill on. The toggle does.',
  },
  {
    q: 'macOS blocked the app. Now what?',
    a: 'Unsigned on purpose — no Apple tax. System Settings → Privacy & Security → Open Anyway. Once is enough. Or curl the .dmg so it never gets the browser quarantine stamp. Steps are on the App page.',
  },
] as const;

/** Keep in sync with web/components/landing/how-it-works.tsx */
const STEPS = [
  {
    tag: 'Discovery',
    where: 'Discover',
    problem: 'Too many skills to pick from.',
    body: "Browse skills.sh's leaderboard (Top or Trending), or search by name — no API key. Suggest picks from this project's package.json.",
    Icon: MagnifyingGlass,
  },
  {
    tag: 'Management',
    where: 'Skills + Commands',
    problem: 'Skills pile up, scattered across tools.',
    body: 'Sync reads .cursor, .claude, .codex, and .agents into one catalog. File skills onto commands like /build, then toggle on — it writes .agents + .claude at once. Toggle off parks it; nothing is deleted.',
    Icon: Folder,
  },
  {
    tag: 'Evaluation',
    where: 'Doctor',
    problem: 'No idea which skills still earn their spot.',
    body: 'Doctor flags idle-cost, fat bodies, conflicts, and dead skills. Usage shows whether a skill actually got read. Open it from the health banner on Skills, Commands, or Rules.',
    Icon: Stethoscope,
  },
] as const;

const ABOUT_LINKS = [
  { href: PRODUCT_LINKS.website, label: 'Website', Icon: Globe },
  { href: PRODUCT_LINKS.github, label: 'GitHub', Icon: GithubLogo },
  { href: PRODUCT_LINKS.linkedin, label: 'LinkedIn', Icon: LinkedinLogo },
  { href: PRODUCT_LINKS.bugReport, label: 'Report a bug', Icon: Bug },
  { href: PRODUCT_LINKS.featureRequest, label: 'Suggest an idea', Icon: Lightbulb },
  { href: PRODUCT_LINKS.venmo, label: 'Donate', meta: '@echung03', Icon: Heart },
] as const;

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'newer'; latest: string; url: string }
  | { kind: 'error' };

export default function HelpModal({
  onClose,
  initialTab = 'instructions',
}: {
  onClose: () => void;
  initialTab?: HelpTab;
}) {
  const bridge = useBridge();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<HelpTab>(initialTab);
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

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

  async function checkForUpdate(): Promise<void> {
    setCheck({ kind: 'checking' });
    const result = await bridge.checkAppUpdate();
    if (!result.ok) {
      setCheck({ kind: 'error' });
      return;
    }
    if (result.value.newer) {
      setCheck({ kind: 'newer', latest: result.value.latest, url: result.value.url });
      return;
    }
    setCheck({ kind: 'current' });
  }

  return createPortal(
    <div className="skill-details-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="skill-details-modal help-about-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={`modal-close ${FOCUS_RING}`} aria-label="Close help" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <div role="tablist" aria-label="Help" className="filter-row role-tabs help-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`help-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`help-panel-${item.id}`}
              onClick={() => setTab(item.id)}
              className={`filter ${tab === item.id ? 'active-filter' : ''} ${FOCUS_RING}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="skill-preview-head">
          <div>
            <h2 id="help-title">{active.title}</h2>
            <p className="muted-copy">{active.lede}</p>
          </div>
        </div>
        {tab === 'instructions' ? (
          <div
            className="help-tab-panel"
            role="tabpanel"
            id="help-panel-instructions"
            aria-labelledby="help-tab-instructions"
          >
            <ol className="help-steps">
              {STEPS.map((step) => (
                <li key={step.tag} className="help-step glass-panel">
                  <span className="help-step-icon" aria-hidden="true">
                    <step.Icon size={18} weight="regular" />
                  </span>
                  <div>
                    <p className="help-step-tag">
                      {step.tag}
                      <span aria-hidden="true"> · </span>
                      {step.where}
                    </p>
                    <h3>{step.problem}</h3>
                    <p className="help-step-body">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {tab === 'faq' ? (
          <div
            className="help-tab-panel"
            role="tabpanel"
            id="help-panel-faq"
            aria-labelledby="help-tab-faq"
          >
            <dl className="help-faq">
              {FAQ.map((item) => (
                <div key={item.q} className="help-faq-item">
                  <dt>{item.q}</dt>
                  <dd>{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {tab === 'about' ? (
          <div
            className="help-tab-panel"
            role="tabpanel"
            id="help-panel-about"
            aria-labelledby="help-tab-about"
          >
            <p className="help-about-note">
              Open source. macOS app + CLI. No login. State lives in <code>.skil/state.json</code>.
            </p>
            <div className="help-about-meta">
              <p className="help-version">Skil {APP_VERSION}</p>
              <button
                type="button"
                className={`outline-button ${FOCUS_RING}`}
                aria-busy={check.kind === 'checking' || undefined}
                disabled={check.kind === 'checking'}
                onClick={() => void checkForUpdate()}
              >
                Check for update
              </button>
              {check.kind === 'checking' ? <p role="status">Checking…</p> : null}
              {check.kind === 'current' ? <p role="status">You&apos;re on the latest.</p> : null}
              {check.kind === 'newer' ? (
                <p role="status">
                  {check.latest} is out.{' '}
                  <a href={check.url} target="_blank" rel="noopener noreferrer" className={`skill-details-link ${FOCUS_RING}`}>
                    Download
                  </a>
                </p>
              ) : null}
              {check.kind === 'error' ? <p role="status">Couldn&apos;t check. Try GitHub.</p> : null}
            </div>
            <nav className="help-links" aria-label="skil links">
              {ABOUT_LINKS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`help-link ${FOCUS_RING}`}
                >
                  <item.Icon size={16} weight="regular" aria-hidden="true" />
                  <span>{item.label}</span>
                  {'meta' in item ? <span className="help-link-meta">{item.meta}</span> : null}
                </a>
              ))}
            </nav>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
