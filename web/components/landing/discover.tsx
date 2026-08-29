'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, GitBranch, Search, X } from 'lucide-react'
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
import { StatusNotice, StatusSkeleton } from '../../../shared/status'

const BROWSE_TABS: Array<{ view: BrowseView; label: string }> = [
  { view: 'all-time', label: 'Top' },
  { view: 'trending', label: 'Trending' },
]

function formatInstalls(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

const AUDIT_STYLES: Record<MarketPreview['audit']['status'], string> = {
  pass: 'bg-emerald-500/15 text-emerald-500',
  warn: 'bg-amber-500/15 text-amber-500',
  fail: 'bg-destructive/15 text-destructive',
  none: 'bg-muted text-muted-foreground',
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const browseCache = useRef<Partial<Record<BrowseView, Row[]>>>({})

  async function loadBrowse(view: BrowseView) {
    setBrowseView(view)
    setBrowseError(false)
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
    if (data.length === 0) {
      void loadBrowse('all-time')
    }
  }

  function handleRoleSelect(r: ShelfRole) {
    setBrowseView(null)
    setBrowseError(false)
    setActiveRole(r.slug)
    setActiveField(r.fields[0]?.slug ?? null)
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

  async function runSearch(trimmed: string) {
    setSearchError(false)
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
    <section id="discover" className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            Browse the skill index
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Thousands of skills.sh skills, ranked by installs and sorted by
            role. Find one, then copy the install command.
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
                    onClick={() => setActiveField(f.slug)}
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
          <ul className="skill-list">
            {rows.length === 0 && (
              <li className="px-1 py-6 text-sm text-muted-foreground">No skills found.</li>
            )}
            {rows.map((skill, index) => (
              <li key={skill.id} className="library-skill library-skill-interactive">
                <button
                  type="button"
                  onClick={() => setSelectedId(skill.id)}
                  className="flex w-full items-center gap-2.5 text-left"
                >
                  <span className="skill-rank">{skill.rank ?? index + 1}</span>
                  <span className="skill-info block">
                    <span className="skill-name block">{skill.name}</span>
                  </span>
                  <span className="skill-actions">
                    <span className="skill-installs">{formatInstalls(skill.installs)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedId && <PreviewDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </section>
  )
}

/** Strips SKILL.md's YAML frontmatter (`name` / `description`) so the preview
 * only renders the body — the header above already shows the name, and the
 * frontmatter block reads as garbled text if rendered as markdown. */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
}

function SkillMarkdown({ content }: { content: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className="font-sans text-base font-semibold">{children}</h3>
          ),
          h2: ({ children }) => (
            <h4 className="mt-1 font-sans text-sm font-semibold">{children}</h4>
          ),
          h3: ({ children }) => (
            <h5 className="font-sans text-sm font-semibold">{children}</h5>
          ),
          p: ({ children }) => <p className="text-foreground/90">{children}</p>,
          ul: ({ children }) => (
            <ul className="ml-4 list-disc space-y-1 text-foreground/90">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-4 list-decimal space-y-1 text-foreground/90">{children}</ol>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent-blue)] hover:underline"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-auto rounded-xl bg-background p-3 font-mono text-xs leading-relaxed">
              {children}
            </pre>
          ),
          hr: () => <hr className="border-[var(--glass-border)]" />,
        }}
      >
        {stripFrontmatter(content)}
      </ReactMarkdown>
    </div>
  )
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
      if (event.key === 'Escape') onClose()
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={preview?.name ?? id}
        onClick={(event) => event.stopPropagation()}
        className="glass-modal flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-4">
          <p className="font-sans text-lg font-semibold">{preview?.name ?? id}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <StatusNotice kind="preview" onRetry={() => setReloadKey((key) => key + 1)} />}
          {!error && !preview && <StatusSkeleton variant="preview" />}
          {preview && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={cn('rounded-full px-2.5 py-1 font-medium', AUDIT_STYLES[preview.audit.status])}>
                  Audit: {preview.audit.status}
                </span>
                <span className="text-muted-foreground">{formatInstalls(preview.installs)} installs</span>
                {preview.installUrl && (
                  <a
                    href={preview.installUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--accent-blue)] hover:underline"
                  >
                    <GitBranch className="size-3.5" /> Repository
                  </a>
                )}
              </div>

              {preview.skillMd && (
                <div className="max-h-64 overflow-auto rounded-2xl bg-muted p-4">
                  <SkillMarkdown content={preview.skillMd} />
                </div>
              )}
            </div>
          )}
        </div>

        {preview && (
          <div className="flex items-center gap-2 border-t border-[var(--glass-border)] px-5 py-4">
            <code className="flex-1 truncate rounded-xl bg-muted px-3 py-2 font-mono text-xs">
              {preview.installCommand}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="primary-button skill-copy-button"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
