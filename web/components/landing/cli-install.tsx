import { Terminal } from 'lucide-react'

const lines: { type: 'comment' | 'command' | 'output'; text: string }[] = [
  { type: 'comment', text: '# Install the CLI with Homebrew' },
  { type: 'command', text: 'brew install skil' },
  { type: 'comment', text: '# Scan the current repo for skills' },
  { type: 'command', text: 'skil scan .' },
  { type: 'output', text: '✓ Found 52 skills across 4 sources' },
  { type: 'comment', text: '# Export a command to your IDE' },
  { type: 'command', text: 'skil export /build --ide cursor' },
  { type: 'output', text: '✓ Wrote .cursor/commands/build.md' },
]

export function CliInstall() {
  return (
    <section id="cli" className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
        <div>
          <div className="glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
            <Terminal className="size-3.5" />
            Also on the command line
          </div>
          <h2 className="mt-5 text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            Prefer the terminal? There&apos;s a CLI for that
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            The same scan, organize, and export flow, scriptable for CI or a
            pre-commit hook. Everything the desktop app does, headless.
          </p>

          <ul className="mt-6 flex flex-col gap-3 text-sm">
            {[
              'No login or API key — it reads your local repo.',
              'Additive exports with a diff preview before writing.',
              'Pin skills per command so CI stays reproducible.',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent-blue)]" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* terminal */}
        <div className="glass-panel-strong overflow-hidden rounded-3xl">
          <div className="glass-hairline flex items-center gap-2 border-b px-4 py-3">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-[var(--accent-blue)]/50" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              zsh — skil
            </span>
          </div>
          <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-relaxed">
            <code className="flex flex-col gap-1">
              {lines.map((line, i) => {
                if (line.type === 'comment') {
                  return (
                    <span key={i} className="text-muted-foreground/70">
                      {line.text}
                    </span>
                  )
                }
                if (line.type === 'output') {
                  return (
                    <span key={i} className="text-emerald-500">
                      {line.text}
                    </span>
                  )
                }
                return (
                  <span key={i} className="text-foreground">
                    <span className="mr-2 text-[var(--accent-blue)]">$</span>
                    {line.text}
                  </span>
                )
              })}
            </code>
          </pre>
        </div>
      </div>
    </section>
  )
}
