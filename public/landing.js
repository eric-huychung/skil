(function () {
  const root = document.documentElement;
  const storageKey = 'skil-theme';

  function theme() {
    return root.classList.contains('dark') ? 'dark' : 'light';
  }

  function setTheme(next) {
    root.classList.toggle('dark', next === 'dark');
    window.localStorage.setItem(storageKey, next);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute(
        'aria-label',
        next === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      );
    }
  }

  const stored = window.localStorage.getItem(storageKey);
  setTheme(stored === 'light' || stored === 'dark' ? stored : 'dark');

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    setTheme(theme() === 'dark' ? 'light' : 'dark');
  });

  const labels = {
    silicon: 'Download for Apple Silicon',
    intel: 'Download for Intel',
  };

  function selectArch(arch) {
    document.querySelectorAll('[data-arch]').forEach((button) => {
      const selected = button.getAttribute('data-arch') === arch;
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
    const download = document.getElementById('download-label');
    if (download) download.textContent = labels[arch] ?? labels.silicon;
  }

  document.querySelectorAll('[data-arch]').forEach((button) => {
    button.addEventListener('click', () => selectArch(button.getAttribute('data-arch')));
  });
})();
