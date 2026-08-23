import { afterEach, describe, expect, it } from 'vitest';
import { getApiBaseUrl, website } from './website.js';

describe('website config', () => {
  const originalSkil = process.env.SKIL_API_URL;
  const originalLegacy = process.env.CONTEXTKIT_API_URL;

  afterEach(() => {
    restoreEnv('SKIL_API_URL', originalSkil);
    restoreEnv('CONTEXTKIT_API_URL', originalLegacy);
  });

  it('defaults the API origin to website.json', () => {
    delete process.env.SKIL_API_URL;
    delete process.env.CONTEXTKIT_API_URL;
    expect(website.apiBaseUrl).toMatch(/^https:\/\//);
    expect(getApiBaseUrl()).toBe(website.apiBaseUrl);
  });

  it('uses SKIL_API_URL when set', () => {
    process.env.SKIL_API_URL = 'https://skil.example';
    delete process.env.CONTEXTKIT_API_URL;
    expect(getApiBaseUrl()).toBe('https://skil.example');
  });

  it('falls back to CONTEXTKIT_API_URL when SKIL_API_URL is unset', () => {
    delete process.env.SKIL_API_URL;
    process.env.CONTEXTKIT_API_URL = 'https://backend.example';
    expect(getApiBaseUrl()).toBe('https://backend.example');
  });

  it('prefers SKIL_API_URL when both env vars are set', () => {
    process.env.SKIL_API_URL = 'https://skil.example';
    process.env.CONTEXTKIT_API_URL = 'https://backend.example';
    expect(getApiBaseUrl()).toBe('https://skil.example');
  });
});

function restoreEnv(name: 'SKIL_API_URL' | 'CONTEXTKIT_API_URL', original: string | undefined): void {
  if (original === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = original;
  }
}
