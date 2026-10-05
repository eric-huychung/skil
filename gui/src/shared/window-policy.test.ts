import { describe, expect, it } from 'vitest';
import { isAppNavigationUrl, isSafeExternalUrl } from './window-policy.js';

describe('isSafeExternalUrl', () => {
  it('allows http and https', () => {
    expect(isSafeExternalUrl('https://github.com/eric-huychung/skil')).toBe(true);
    expect(isSafeExternalUrl('http://localhost:3000/docs')).toBe(true);
  });

  it('drops file, javascript, and custom schemes', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('skil://reveal-key')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });

  it('drops urls with embedded credentials', () => {
    expect(isSafeExternalUrl('https://user:secret@example.com')).toBe(false);
  });
});

describe('isAppNavigationUrl', () => {
  const rendererFilePrefix = 'file:///Applications/Skil.app/Contents/Resources/app.asar/out/renderer/';

  it('allows the packaged renderer and the dev server origin', () => {
    expect(isAppNavigationUrl(`${rendererFilePrefix}index.html`, { rendererFilePrefix })).toBe(true);
    expect(
      isAppNavigationUrl('http://localhost:5173/src/main.tsx', { devServerUrl: 'http://localhost:5173' }),
    ).toBe(true);
  });

  it('blocks other files and other origins', () => {
    expect(isAppNavigationUrl('file:///etc/passwd', { rendererFilePrefix })).toBe(false);
    expect(
      isAppNavigationUrl('https://evil.example', { devServerUrl: 'http://localhost:5173', rendererFilePrefix }),
    ).toBe(false);
  });
});
