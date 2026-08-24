import { Bot } from 'lucide-react'

type Tool = {
  name: string
  folder: string
  /** Path to a monochrome SVG used as a CSS mask, or null to use the fallback icon. */
  logo: string | null
}

const tools: Tool[] = [
  { name: 'Cursor', folder: '.cursor', logo: '/logos/cursor.svg' },
  { name: 'Claude Code', folder: '.claude', logo: '/logos/claude.svg' },
  { name: 'Windsurf', folder: '.windsurf', logo: '/logos/windsurf.svg' },
  { name: 'Agents', folder: '.agents', logo: null },
]

export function SupportedTools() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            Works with the agents you already use
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Skil reads and writes the config folders your tools already
            create — no new format, no migration.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="glass-panel flex flex-col items-center gap-3 rounded-3xl px-4 py-8 text-center"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                {tool.logo ? (
                  <span
                    aria-hidden="true"
                    className="size-6 bg-[var(--accent-blue)]"
                    style={{
                      maskImage: `url(${tool.logo})`,
                      WebkitMaskImage: `url(${tool.logo})`,
                      maskSize: 'contain',
                      WebkitMaskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      WebkitMaskRepeat: 'no-repeat',
                      maskPosition: 'center',
                      WebkitMaskPosition: 'center',
                    }}
                  />
                ) : (
                  <Bot className="size-6" />
                )}
              </span>
              <div>
                <p className="font-sans text-sm font-semibold">{tool.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {tool.folder}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
