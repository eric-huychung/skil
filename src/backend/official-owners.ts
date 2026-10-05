import { err, ok, type Result } from '../core/result.js';

/**
 * skills.sh's `/official` page is the only source for the "Official on skills.sh" badge.
 * It is server-rendered with one link per owner (`/anthropics`); repos are `/owner/repo`.
 * Used by the creators report only, never on the read path (design §4.7).
 */
export const OFFICIAL_URL = 'https://skills.sh/official';

// Site routes that look like single-segment owner links.
const RESERVED = new Set([
  'about',
  'api',
  'audits',
  'docs',
  'hot',
  'official',
  'privacy',
  'search',
  'terms',
  'trending',
]);

const ANCHOR_HREF = /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gi;
// `/owner`, `/owner/`, or the absolute skills.sh form. GitHub owners plus dotted ones like `open.feishu.cn`.
const OWNER_PATH = /^(?:https?:\/\/(?:www\.)?skills\.sh)?\/([a-z0-9][a-z0-9._-]*)\/?$/i;

/** Owner slugs linked from the `/official` page, lowercased, deduped, in page order. */
export function parseOfficialOwners(html: string): string[] {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  const body = main ? main[1] : html;
  const owners: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(ANCHOR_HREF)) {
    const path = OWNER_PATH.exec(match[2].trim());
    if (!path) continue;
    const owner = path[1].toLowerCase();
    if (RESERVED.has(owner) || seen.has(owner)) continue;
    seen.add(owner);
    owners.push(owner);
  }
  return owners;
}

/** Fetches and parses the page. An empty parse is an error: the layout changed, so keep the saved list. */
export async function fetchOfficialOwners(fetchImpl: typeof fetch): Promise<Result<string[]>> {
  let response: Response;
  try {
    response = await fetchImpl(OFFICIAL_URL, { headers: { Accept: 'text/html' } });
  } catch (error) {
    return err(new Error(`official owners fetch failed: ${(error as Error).message}`));
  }
  if (!response.ok) {
    return err(new Error(`official owners fetch failed: HTTP ${response.status}`));
  }
  const owners = parseOfficialOwners(await response.text());
  if (owners.length === 0) {
    return err(new Error('official owners page has no owner links (layout changed?)'));
  }
  return ok(owners);
}
