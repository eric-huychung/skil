/**
 * Thin client for the skil market index read API (`api/market/*`). Web is a
 * static export deployed to the same Vercel project as `api/`, so these are
 * same-origin, unauthenticated reads — no OIDC, no service role, just
 * `fetch`. Types here are a local mirror of `src/backend/market-types.ts`,
 * not an import from it: `web/` has never depended on `src/` (see
 * `web/lib/preview-data.ts`), and these are just the JSON shapes the read
 * handlers already return.
 */

export interface ShelfSkill {
  id: string
  name: string
  installs: number
  rank: number
}

export interface ShelfField {
  slug: string
  label: string
  skills: ShelfSkill[]
}

export interface ShelfRole {
  slug: string
  label: string
  fields: ShelfField[]
}

export interface MarketSearchRow {
  id: string
  name: string
  installs: number
}

export interface MarketPreview {
  id: string
  name: string
  installs: number
  url: string
  installUrl: string | null
  installCommand: string
  skillMd: string | null
  audit: { status: 'pass' | 'warn' | 'fail' | 'none' }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with ${response.status}`)
  }
  const body = (await response.json()) as { data: T }
  return body.data
}

export function fetchShelves(): Promise<ShelfRole[]> {
  return getJson<ShelfRole[]>('/api/market/shelves')
}

export function searchMarket(query: string, limit = 25): Promise<MarketSearchRow[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return getJson<MarketSearchRow[]>(`/api/market/search?${params.toString()}`)
}

export function fetchPreview(id: string): Promise<MarketPreview> {
  const params = new URLSearchParams({ id })
  return getJson<MarketPreview>(`/api/market/preview?${params.toString()}`)
}
