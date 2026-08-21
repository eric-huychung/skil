import websiteJson from './website.json' with { type: 'json' };

export interface WebsiteConfig {
  /** Public origin of the ContextKit Vercel API. */
  apiBaseUrl: string;
}

/** Defaults from `website.json`. Override the API origin with `CONTEXTKIT_API_URL`. */
export const website: WebsiteConfig = websiteJson;

export function getApiBaseUrl(): string {
  return process.env.CONTEXTKIT_API_URL ?? website.apiBaseUrl;
}
