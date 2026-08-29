import { XCircle } from '@phosphor-icons/react';
import { useTheme } from '../theme';
import { FOCUS_RING } from '../lib/focus-ring';

/** Full-window fallback when `window.skil` never attached. Same card as status errors. */
export function BootFailure() {
  const { theme } = useTheme();

  return (
    <div className={`app-shell ${theme === 'dark' ? 'dark-shell' : 'light-shell'}`}>
      <main className="boot-failure" role="alert">
        <div className="help-modal status-error">
          <span className="status-icon status-icon-error" aria-hidden="true">
            <XCircle size={24} weight="regular" />
          </span>
          <p className="eyebrow">App</p>
          <h2>Couldn't start</h2>
          <p className="muted-copy">The app bridge didn&apos;t load. Reload and try again.</p>
          <button type="button" className={`primary-button ${FOCUS_RING}`} onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    </div>
  );
}
