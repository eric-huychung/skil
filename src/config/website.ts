import websiteJson from './website.json' with { type: 'json' };

export interface WebsiteConfig {
  /** Public origin of the skil Vercel API. */
  apiBaseUrl: string;
}

/** Defaults from `website.json`. Override with `SKIL_API_URL`, then `CONTEXTKIT_API_URL`. */
export const website: WebsiteConfig = websiteJson;

export function getApiBaseUrl(): string {
  return process.env.SKIL_API_URL ?? process.env.CONTEXTKIT_API_URL ?? website.apiBaseUrl;
}
