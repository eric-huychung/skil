import { GitBranch } from 'lucide-react'
import { DownloadCta } from '@/components/landing/download-cta'

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-40 pb-24 sm:pt-48 sm:pb-32">
      <div
        aria-hidden="true"
        className="ambient-glow pointer-events-none absolute left-1/2 top-0 -z-10 h-[560px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
      />

      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <div className="glass-panel mx-auto mb-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <GitBranch className="size-3.5" />
          Native macOS app. Read your repo, organize, export.
        </div>

        <h1 className="text-balance font-sans text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
          Give your agent skills a{' '}
          <span className="text-[var(--accent-blue)]">home</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Point the Skil desktop app at a repo and it scans .cursor, .claude,
          .windsurf, and .agents for skills and slash commands, then organizes
          them into the SDLC stages your team already follows.
        </p>

        <div className="mt-10 flex justify-center">
          <DownloadCta variant="compact" />
        </div>
      </div>
    </section>
  )
}
