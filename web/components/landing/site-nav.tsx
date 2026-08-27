import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'

export function SiteNav() {
  return (
    <header className="glass-nav fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="wordmark">Skil</span>
          <Badge
            variant="secondary"
            className="hidden rounded-full text-[10px] font-medium tracking-wide sm:inline-flex"
          >
            BETA
          </Badge>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          <a
            href="#how-it-works"
            className="rounded-[var(--radius-hover)] px-3 py-1.5 transition-colors hover:bg-[var(--hover)] hover:text-[var(--hover-foreground)]"
          >
            How it works
          </a>
          <a
            href="#preview"
            className="rounded-[var(--radius-hover)] px-3 py-1.5 transition-colors hover:bg-[var(--hover)] hover:text-[var(--hover-foreground)]"
          >
            Product
          </a>
          <a
            href="#discover"
            className="rounded-[var(--radius-hover)] px-3 py-1.5 transition-colors hover:bg-[var(--hover)] hover:text-[var(--hover-foreground)]"
          >
            Discover
          </a>
          <a
            href="#features"
            className="rounded-[var(--radius-hover)] px-3 py-1.5 transition-colors hover:bg-[var(--hover)] hover:text-[var(--hover-foreground)]"
          >
            Features
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            nativeButton={false}
            className="rounded-full bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)] hover:bg-[var(--accent-blue)]/90"
            render={<a href="#download" />}
          >
            Open app
          </Button>
        </div>
      </div>
    </header>
  )
}
