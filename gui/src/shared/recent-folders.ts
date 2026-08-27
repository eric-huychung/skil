export const MAX_RECENT_FOLDERS = 5;

export function rememberFolder(path: string, recents: readonly string[]): string[] {
  const next = path.trim();
  if (!next) return [...recents];
  return [next, ...recents.filter((item) => item !== next)].slice(0, MAX_RECENT_FOLDERS);
}

export function forgetFolder(path: string, recents: readonly string[]): string[] {
  return recents.filter((item) => item !== path);
}

export function parseRecentFolders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const path = item.trim();
    if (!path || unique.includes(path)) continue;
    unique.push(path);
    if (unique.length === MAX_RECENT_FOLDERS) break;
  }
  return unique;
}

export function folderLabel(path: string): string {
  const parts = pathSegments(path);
  return parts[parts.length - 1] ?? path;
}

export function folderPreview(path: string, segments = 3): string {
  const parts = pathSegments(path);
  if (parts.length === 0) return path;
  return parts.slice(-segments).join('/');
}

function pathSegments(path: string): string[] {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
}
