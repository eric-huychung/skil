'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, GitBranch, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import {
  fetchBrowse,
  fetchCreator,
  fetchCreators,
  fetchPreview,
  fetchShelves,
  searchMarket,
  type BrowseView,
  type CreatorCard,
  type CreatorDetail,
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
  const [creatorsActive, setCreatorsActive] = useState(false)
  const [creators, setCreators] = useState<CreatorCard[] | null>(null)
  const [isLoadingCreators, setIsLoadingCreators] = useState(false)
  const [creatorsError, setCreatorsError] = useState(false)
  const [creatorSlug, setCreatorSlug] = useState<string | null>(null)

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
    setCreatorsActive(false)
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

  /** Creators fail on their own: a failed fetch shows retry here only, other tabs keep working. */
  async function loadCreators() {
    setCreatorsActive(true)
    setBrowseView(null)
    setBrowseError(false)
    setCreatorSlug(null)
    setCreatorsError(false)
    if (creators) return

    setIsLoadingCreators(true)
    try {
      setCreators(await fetchCreators())
    } catch {
      setCreatorsError(true)
    } finally {
      setIsLoadingCreators(false)
    }
  }

  function handleRoleSelect(r: ShelfRole) {
    setCreatorsActive(false)
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
  const showCreators = creatorsActive && searchResults === null && !searchError && !isSearching
  const fieldLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const r of roles ?? []) for (const f of r.fields) labels.set(f.slug, f.label)
    return labels
  }, [roles])

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
              <button
                type="button"
                role="tab"
                aria-selected={creatorsActive}
                onClick={() => void loadCreators()}
                className={cn(
                  'chip-hover rounded-[var(--radius-hover)] border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  creatorsActive
                    ? 'border-transparent bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]'
                    : 'border-[rgb(var(--glass-border))] text-muted-foreground'
                )}
              >
                Creators
              </button>
              {roles.map((r) => (
                <button
                  key={r.slug}
                  type="button"
                  role="tab"
                  aria-selected={browseView === null && !creatorsActive && r.slug === activeRole}
                  onClick={() => handleRoleSelect(r)}
                  className={cn(
                    'chip-hover rounded-[var(--radius-hover)] border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    browseView === null && !creatorsActive && r.slug === activeRole
                      ? 'border-transparent bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]'
                      : 'border-[rgb(var(--glass-border))] text-muted-foreground'
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {role && browseView === null && !creatorsActive && (
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

        {showCreators && !showSkeleton && (
          <CreatorsView
            creators={creators}
            loading={isLoadingCreators}
            error={creatorsError}
            onRetry={() => void loadCreators()}
            slug={creatorSlug}
            onSelect={setCreatorSlug}
            fieldLabels={fieldLabels}
            onPreview={openPreview}
          />
        )}

        {roles !== null && !showSkeleton && !catalogError && !showCreators && (
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

function CreatorsView({
  creators,
  loading,
  error,
  onRetry,
  slug,
  onSelect,
  fieldLabels,
  onPreview,
}: {
  creators: CreatorCard[] | null
  loading: boolean
  error: boolean
  onRetry: () => void
  slug: string | null
  onSelect: (slug: string | null) => void
  fieldLabels: Map<string, string>
  onPreview: (id: string) => void
}) {
  if (loading) return <StatusSkeleton variant="cards" />
  if (error) return <StatusNotice kind="load" onRetry={onRetry} />
  if (slug) {
    return (
      <CreatorDetailView
        key={slug}
        slug={slug}
        onBack={() => onSelect(null)}
        fieldLabels={fieldLabels}
        onPreview={onPreview}
      />
    )
  }
  if (!creators || creators.length === 0) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">No creators found.</p>
  }

  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {creators.map((creator) => (
        <li key={creator.slug}>
          <button
            type="button"
            onClick={() => onSelect(creator.slug)}
            aria-label={`Skills by ${creator.label}`}
            className="chip-hover flex h-full w-full flex-col gap-2 rounded-[var(--radius-hover)] border border-[rgb(var(--glass-border))] p-4 text-left transition-colors"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{creator.label}</span>
              {creator.official && <OfficialBadge />}
            </span>
            <span className="text-sm text-muted-foreground">
              {creator.skillCount} {creator.skillCount === 1 ? 'skill' : 'skills'} ·{' '}
              {formatInstalls(creator.totalInstalls)} installs
            </span>
            <span className="text-xs text-muted-foreground">installs, skills.sh</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function OfficialBadge() {
  return (
    <span className="audit-badge bg-sky-500/15 text-sky-500">
      Official on skills.sh
    </span>
  )
}

/** Mirrors `toSkillsAddSource` in `src/backend/skills-add-source.ts` (web can't import `src/`). */
function skillsAddSource(skillId: string): string {
  const parts = skillId.split('/').filter(Boolean)
  return parts.length >= 3 ? `${parts[0]}/${parts[1]}@${parts[parts.length - 1]}` : skillId
}

function CreatorDetailView({
  slug,
  onBack,
  fieldLabels,
  onPreview,
}: {
  slug: string
  onBack: () => void
  fieldLabels: Map<string, string>
  onPreview: (id: string) => void
}) {
  const [detail, setDetail] = useState<CreatorDetail | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError(false)
    void fetchCreator(slug)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [slug, reloadKey])

  async function handleCopy(id: string) {
    await navigator.clipboard.writeText(`npx skills add ${skillsAddSource(id)}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onBack}
        className="chip-hover inline-flex items-center gap-1 rounded-[var(--radius-hover)] px-2 py-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        All creators
      </button>
      {error && <StatusNotice kind="load" onRetry={() => setReloadKey((key) => key + 1)} />}
      {!error && !detail && <StatusSkeleton />}
      {detail && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-xl font-semibold tracking-tight">{detail.label}</h3>
            {detail.official && <OfficialBadge />}
          </div>
          {detail.repos.map((repo) => (
            <div key={repo.source} className="mt-6">
              <p className="eyebrow">{repo.source}</p>
              <ul className="skill-list">
                {repo.skills.map((skill) => {
                  const topics = skill.topics.map((topic) => fieldLabels.get(topic) ?? topic)
                  return (
                    <li
                      key={skill.id}
                      className="library-skill library-skill-interactive"
                      onClick={() => onPreview(skill.id)}
                    >
                      <button
                        type="button"
                        className="library-skill-hit"
                        onClick={() => onPreview(skill.id)}
                        aria-haspopup="dialog"
                        aria-label={`Details for ${skill.name}`}
                      />
                      <span className="skill-info flex flex-wrap items-center gap-2">
                        <span className="skill-name">{skill.name}</span>
                        {topics.map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {topic}
                          </span>
                        ))}
                      </span>
                      <span className="skill-actions ml-auto">
                        <span className="skill-installs">{formatInstalls(skill.installs)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleCopy(skill.id)
                        }}
                        aria-label={`Copy install command for ${skill.name}`}
                        className="primary-button skill-copy-button relative z-[2]"
                      >
                        {copiedId === skill.id ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                        {copiedId === skill.id ? 'Copied' : 'Copy'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
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
