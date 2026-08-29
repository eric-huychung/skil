/**
 * Thin client for Discover reads (`api/market/*` + live `api/skills` browse).
 * Web is a static export on the same Vercel project as `api/`, so these are
 * same-origin, unauthenticated — no OIDC, no `src/` import. Types are a
 * local mirror of the JSON shapes those handlers already return.
 */

export type BrowseView = 'all-time' | 'trending'

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

export interface BrowseHit {
  id: string
  name?: string
  installs?: number
}

export function fetchBrowse(view: BrowseView): Promise<BrowseHit[]> {
  const params = new URLSearchParams({ view })
  return getJson<BrowseHit[]>(`/api/skills?${params.toString()}`)
}

export function searchMarket(query: string, limit = 25): Promise<MarketSearchRow[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return getJson<MarketSearchRow[]>(`/api/market/search?${params.toString()}`)
}

export function fetchPreview(id: string): Promise<MarketPreview> {
  const params = new URLSearchParams({ id })
  return getJson<MarketPreview>(`/api/market/preview?${params.toString()}`)
}
