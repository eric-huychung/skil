import { afterEach, describe, expect, it } from 'vitest';
import { getApiBaseUrl, website } from './website.js';

describe('website config', () => {
  const original = process.env.CONTEXTKIT_API_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CONTEXTKIT_API_URL;
    } else {
      process.env.CONTEXTKIT_API_URL = original;
    }
  });

  it('defaults the API origin to website.json', () => {
    delete process.env.CONTEXTKIT_API_URL;
    expect(website.apiBaseUrl).toMatch(/^https:\/\//);
    expect(getApiBaseUrl()).toBe(website.apiBaseUrl);
  });

  it('uses CONTEXTKIT_API_URL when set', () => {
    process.env.CONTEXTKIT_API_URL = 'https://backend.example';
    expect(getApiBaseUrl()).toBe('https://backend.example');
  });
});
