/**
 * What the desktop window is allowed to load.
 * App pages stay in the window. http(s) links open outside it.
 * Anything else (file:, javascript:, custom schemes) is dropped.
 */

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username !== '' || parsed.password !== '') return false;
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isAppNavigationUrl(
  url: string,
  options: { devServerUrl?: string; rendererFilePrefix?: string },
): boolean {
  if (options.rendererFilePrefix && url.startsWith(options.rendererFilePrefix)) return true;
  if (!options.devServerUrl) return false;
  try {
    return new URL(url).origin === new URL(options.devServerUrl).origin;
  } catch {
    return false;
  }
}
