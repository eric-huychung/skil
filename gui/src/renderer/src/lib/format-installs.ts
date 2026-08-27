/** Shared install-count formatter for Discover lists (`1200` -> `1.2k`). */
export function formatInstalls(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}
