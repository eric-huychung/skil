'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, GitBranch, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  fetchBrowse,
  fetchPreview,
  fetchShelves,
  searchMarket,
  type BrowseView,
  type MarketPreview,
  type MarketSearchRow,
  type ShelfRole,
} from '@/lib/market-api'
import { LeaderboardSourceNote } from '../../../shared/leaderboard-source-note'
import { StatusNotice, StatusSkeleton } from '../../../shared/status'

const BROWSE_TABS: Array<{ view: BrowseView; label: string }> = [
  { view: 'all-time', label: 'Top' },
  { view: 'trending', label: 'Trending' },
]

/** Same page size as the GUI Skills tab (`InboxPanel.tsx`). */
const PAGE_SIZE = 25

function formatInstalls(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

/** Kept in sync with `gui/.../SkillPreviewDialog.tsx` audit labels + colors. */
const AUDIT_LABEL: Record<MarketPreview['audit']['status'], string> = {
  pass: 'Audit passed',
  warn: 'Audit warning',
  fail: 'Audit failed',
  none: 'No audit',
}

const AUDIT_BADGE_CLASS: Record<MarketPreview['audit']['status'], string> = {
  pass: 'bg-emerald-500/15 text-emerald-500',
  warn: 'bg-amber-500/15 text-amber-500',
  fail: 'bg-destructive/15 text-destructive',
  none: 'bg-secondary text-muted-foreground',
}

type Row = { id: string; name: string; installs: number; rank?: number }

export function Discover() {
  const [roles, setRoles] = useState<ShelfRole[] | null>(null)
  const [activeRole, setActiveRole] = useState<string | null>(null)
  const [activeField, setActiveField] = useState<string | null>(null)
  const [browseView, setBrowseView] = useState<BrowseView | null>(null)
  const [browseRows, setBrowseRows] = useState<Row[] | null>(null)
  const [isBrowsing, setIsBrowsing] = useState(false)
  const [browseError, setBrowseError] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MarketSearchRow[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [previewSession, setPreviewSession] = useState<{ id: string; key: number } | null>(null)
  const [page, setPage] = useState(0)
  const browseCache = useRef<Partial<Record<BrowseView, Row[]>>>({})

  function openPreview(id: string) {
    setPreviewSession((current) => ({
      id,
      key: current?.id === id ? current.key + 1 : 0,
    }))
  }

  function closePreview() {
    setPreviewSession(null)
  }

  async function loadBrowse(view: BrowseView) {
    setBrowseView(view)
    setBrowseError(false)
    setPage(0)
    const cached = browseCache.current[view]
    if (cached) {
      setBrowseRows(cached)
      return
    }

    setIsBrowsing(true)
    try {
      const rows = (await fetchBrowse(view)).map((hit) => ({
        id: hit.id,
        name: hit.name ?? hit.id,
        installs: hit.installs ?? 0,
      }))
      browseCache.current[view] = rows
      setBrowseRows(rows)
    } catch {
      setBrowseError(true)
      setBrowseRows(null)
    } finally {
      setIsBrowsing(false)
    }
  }

  function applyShelves(data: ShelfRole[]) {
    setRoles(data)
    setActiveRole(data[0]?.slug ?? null)
    setActiveField(data[0]?.fields[0]?.slug ?? null)
    void loadBrowse('all-time')
  }

  function handleRoleSelect(r: ShelfRole) {
    setBrowseView(null)
    setBrowseError(false)
    setActiveRole(r.slug)
    setActiveField(r.fields[0]?.slug ?? null)
    setPage(0)
  }

  useEffect(() => {
    let cancelled = false
    void fetchShelves()
      .then((data) => {
        if (!cancelled) applyShelves(data)
      })
      .catch(() => {
        if (!cancelled) applyShelves([])
      })
    return () => {
      cancelled = true
    }
    // loadBrowse is session-cached; fetch shelves once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const role = roles?.find((r) => r.slug === activeRole) ?? null
  const field = role?.fields.find((f) => f.slug === activeField) ?? role?.fields[0] ?? null

  const rows: Row[] = useMemo(() => {
    if (searchResults !== null) return searchResults
    if (browseView) return browseRows ?? []
    return field?.skills ?? []
  }, [searchResults, browseView, browseRows, field])

  const pageCount = rows.length > 0 ? Math.ceil(rows.length / PAGE_SIZE) : 0
  const safePage = pageCount === 0 ? 0 : Math.min(page, pageCount - 1)
  const visibleStart = safePage * PAGE_SIZE
  const visibleRows = rows.slice(visibleStart, visibleStart + PAGE_SIZE)

  async function runSearch(trimmed: string) {
    setSearchError(false)
    setPage(0)
    if (trimmed.length === 0) {
      setSearchResults(null)
      return
    }
    setIsSearching(true)
    try {
      setSearchResults(await searchMarket(trimmed))
    } catch {
      setSearchError(true)
      setSearchResults(null)
    } finally {
      setIsSearching(false)
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    await runSearch(query.trim())
  }

  function retryFailedCatalog() {
    if (searchError) {
      void runSearch(query.trim())
      return
    }
    if (browseView) void loadBrowse(browseView)
  }

  const catalogError = searchError || (browseView ? browseError : false)
  const showSkeleton = roles === null || isSearching || isBrowsing

  return (
    <section id="discover" className="px-4 pt-40 pb-24 sm:px-6 sm:pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            The leaderboard
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Thousands of skills.sh skills, ranked by installs. Stop guessing
            which one is good — copy the install command and go.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mt-8">
          <label className="search-box" htmlFor="discover-search-query">
            <Search className="size-4" aria-hidden="true" />
            <span className="sr-only">Search skills</span>
            <input
              id="discover-search-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search all skills"
            />
            <button type="submit" className="search-submit" aria-label="Search">
              <ArrowRight className="size-4" />
            </button>
          </label>
        </form>

        <LeaderboardSourceNote linkClassName="leaderboard-source-link skill-details-link" />

        {searchResults === null && roles && (
          <>
            <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Role">
              {BROWSE_TABS.map((tab) => (
                <button
                  key={tab.view}
                  type="button"
                  role="tab"
                  aria-selected={browseView === tab.view}
                  onClick={() => void loadBrowse(tab.view)}
                  className={cn(
                    'chip-hover rounded-[var(--radius-hover)] border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    browseView === tab.view
                      ? 'border-transparent bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]'
                      : 'border-[rgb(var(--glass-border))] text-muted-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
              {roles.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  role="tab"
                  aria-selected={browseView === null && r.slug === activeRole}
                  onClick={() => handleRoleSelect(r)}
                  className={cn(
                    'chip-hover rounded-[var(--radius-hover)] border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    browseView === null && r.slug === activeRole
                      ? 'border-transparent bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]'
                      : 'border-[rgb(var(--glass-border))] text-muted-foreground'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {role && browseView === null && (
              <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Category">
                {role.fields.map((f) => (
                  <button
                    key={f.slug}
                    type="button"
                    role="tab"
                    aria-selected={f.slug === activeField}
                    onClick={() => {
                      setActiveField(f.slug)
                      setPage(0)
                    }}
                    className={cn(
                      'chip-hover rounded-[var(--radius-hover)] px-3 py-1 text-xs font-medium transition-colors',
                      f.slug === activeField
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {showSkeleton && <StatusSkeleton />}
        {catalogError && !showSkeleton && (
          <StatusNotice kind={searchError ? 'search' : 'load'} onRetry={() => void retryFailedCatalog()} />
        )}

        {roles !== null && !showSkeleton && !catalogError && (
          <>
            <ul className="skill-list">
              {rows.length === 0 && (
                <li className="px-1 py-6 text-sm text-muted-foreground">No skills found.</li>
              )}
              {visibleRows.map((skill, index) => (
                <li
                  key={skill.id}
                  className="library-skill library-skill-interactive"
                  onClick={() => openPreview(skill.id)}
                >
                  <button
                    type="button"
                    className="library-skill-hit"
                    onClick={() => openPreview(skill.id)}
                    aria-haspopup="dialog"
                    aria-label={`Details for ${skill.name}`}
                  />
                  <span className="skill-rank">{skill.rank ?? visibleStart + index + 1}</span>
                  <span className="skill-info block">
                    <span className="skill-name block">{skill.name}</span>
                  </span>
                  <span className="skill-actions">
                    <span className="skill-installs">{formatInstalls(skill.installs)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {pageCount > 1 && (
              <nav aria-label="Pages" className="page-row">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  className="page-nav-button"
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" />
                </button>
                <span className="page-status">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={safePage === pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                  className="page-nav-button"
                >
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </div>

      {previewSession && (
        <PreviewDialog
          key={previewSession.key}
          id={previewSession.id}
          onClose={closePreview}
        />
      )}
    </section>
  )
}

/** Strips SKILL.md's YAML frontmatter (`name` / `description`) so the preview
 * only renders the body — the header above already shows the name, and the
 * frontmatter block reads as garbled text if rendered as markdown. */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
}

function PreviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [preview, setPreview] = useState<MarketPreview | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setError(false)
    void fetchPreview(id)
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleCopy() {
    if (!preview) return
    await navigator.clipboard.writeText(preview.installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const title = preview?.name ?? id
  const loading = !error && !preview

  return createPortal(
    <div
      className="skill-details-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div
        className="skill-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="Close details" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
        <p className="eyebrow">Skill</p>
        <h2 id="skill-preview-title">{title}</h2>
        {error && <StatusNotice kind="preview" onRetry={() => setReloadKey((key) => key + 1)} />}
        {loading && <StatusSkeleton variant="preview" />}
        {preview && (
          <div className="skill-meta-row">
            <span className={`audit-badge ${AUDIT_BADGE_CLASS[preview.audit.status]}`}>
              {AUDIT_LABEL[preview.audit.status]}
            </span>
            <span className="skill-installs">{formatInstalls(preview.installs)} installs</span>
            {preview.installUrl && (
              <a
                href={preview.installUrl}
                target="_blank"
                rel="noreferrer"
                className="skill-details-link"
              >
                <GitBranch className="size-3.5" aria-hidden="true" />
                <span>Repository</span>
              </a>
            )}
          </div>
        )}
        {preview?.skillMd && (
          <div className="skill-md-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stripFrontmatter(preview.skillMd)}
            </ReactMarkdown>
          </div>
        )}
        {preview && (
          <div className="skill-copy-bar">
            <code className="skill-copy-command">{preview.installCommand}</code>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="primary-button skill-copy-button"
            >
              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
