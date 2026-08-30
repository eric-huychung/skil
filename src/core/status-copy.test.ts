import { describe, expect, it } from 'vitest';
import { statusCopy, statusLine } from './status-copy.js';

describe('statusCopy', () => {
  it('returns fixed copy for each kind and never echoes a raw failure', () => {
    expect(statusCopy('load')).toEqual({
      title: "Couldn't load skills",
      detail: 'The catalog is temporarily unavailable. Try again in a moment.',
    });
    expect(statusCopy('search')).toEqual({
      title: "Search didn't go through",
      detail: 'Check your connection and try again.',
    });
    expect(statusLine('search')).toBe("Search didn't go through. Check your connection and try again.");
    expect(statusLine('load')).toBe(
      "Couldn't load skills. The catalog is temporarily unavailable. Try again in a moment.",
    );
    expect(statusCopy('adopt')).toEqual({
      title: "Couldn't adopt those leftovers",
      detail: 'Try again in a moment.',
    });
    expect(statusLine('adopt')).toBe("Couldn't adopt those leftovers. Try again in a moment.");
  });
});
