import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vitest.config.ts doesn't enable `test.globals`, so testing-library's
// automatic afterEach cleanup (which detects a global `afterEach`) never
// registers. Without this, rendered DOM from one `it` leaks into the next
// within the same test file.
afterEach(cleanup);

// Newer Node versions ship an experimental built-in `localStorage` that
// leaks onto jsdom's `window` without a backing file, shadowing jsdom's real
// Storage implementation (its methods are missing). theme.tsx reads
// localStorage on mount, so tests need a working in-memory stand-in.
{
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } satisfies Storage,
  });
}

// jsdom doesn't implement matchMedia; theme.tsx reads it to pick the initial
// light/dark mode, so tests need a stub or mounting throws.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
