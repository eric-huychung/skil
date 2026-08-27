'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, GitBranch, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fetchPreview,
  fetchShelves,
  searchMarket,
  type MarketPreview,
  type MarketSearchRow,
  type ShelfRole,
} from '@/lib/market-api'

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
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MarketSearchRow[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchShelves()
      .then((data) => {
        if (cancelled) return
        setRoles(data)
        setActiveRole(data[0]?.slug ?? null)
        setActiveField(data[0]?.fields[0]?.slug ?? null)
      })
      .catch(() => {
        if (!cancelled) setRoles([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const role = roles?.find((r) => r.slug === activeRole) ?? null
  const field = role?.fields.find((f) => f.slug === activeField) ?? role?.fields[0] ?? null

  const rows: Row[] = useMemo(() => {
    if (searchResults !== null) return searchResults
    return field?.skills ?? []
  }, [searchResults, field])

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setSearchResults(null)
      return
    }
    setIsSearching(true)
    try {
      const results = await searchMarket(trimmed)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  function clearSearch() {
    setQuery('')
    setSearchResults(null)
  }

  // Hide the section entirely until the index has data — matches the GUI's
  // "keep the existing experience until shelves have data" rule. Web has no
  // prior live browse to fall back to, so an empty/error state is just no
  // section rather than a broken-looking one.
  if (roles !== null && roles.length === 0) {
    return null
  }

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

        <form onSubmit={handleSearch} className="glass-panel mt-8 flex items-center gap-2 rounded-full px-4 py-2.5">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all skills"
            aria-label="Search skills"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        {searchResults === null && roles && roles.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Role">
              {roles.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  role="tab"
                  aria-selected={r.slug === activeRole}
                  onClick={() => {
                    setActiveRole(r.slug)
                    setActiveField(r.fields[0]?.slug ?? null)
                  }}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    r.slug === activeRole
                      ? 'border-transparent bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]'
                      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {role && (
              <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Category">
                {role.fields.map((f) => (
                  <button
                    key={f.slug}
                    type="button"
                    role="tab"
                    aria-selected={f.slug === activeField}
                    onClick={() => setActiveField(f.slug)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      f.slug === activeField
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {isSearching && (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            Searching&hellip;
          </p>
        )}

        {!isSearching && (
          <ul className="glass-panel mt-6 divide-y divide-[var(--glass-border)] overflow-hidden rounded-3xl">
            {rows.length === 0 && (
              <li className="px-5 py-6 text-sm text-muted-foreground">No skills found.</li>
            )}
            {rows.map((skill, index) => (
              <li key={skill.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(skill.id)}
                  className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-[var(--hover)]"
                >
                  <span className="w-6 shrink-0 text-sm text-muted-foreground">
                    {skill.rank ?? index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{skill.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatInstalls(skill.installs)} installs
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

function PreviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [preview, setPreview] = useState<MarketPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setError(null)
    void fetchPreview(id)
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [id])

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
        className="glass-panel-strong flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl"
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !preview && <p className="text-sm text-muted-foreground">Loading&hellip;</p>}
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
                <pre className="max-h-64 overflow-auto rounded-2xl bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {preview.skillMd}
                </pre>
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
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--accent-blue)] px-3 py-2 text-xs font-medium text-[var(--accent-blue-foreground)] hover:bg-[var(--accent-blue)]/90"
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
