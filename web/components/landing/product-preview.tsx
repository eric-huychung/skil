import { Inbox, Search, FolderKanban, RefreshCw } from 'lucide-react'
import { commands, inboxSkills } from '@/lib/preview-data'

export function ProductPreview() {
  const previewCommand = commands[1]
  const previewSkills = inboxSkills.slice(0, 4)

  return (
    <section id="preview" className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            The workspace, at a glance
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Commands on the left, the skills that back them on the right.
            Nothing is hidden three menus deep.
          </p>
        </div>

        <div className="glass-panel-strong relative mt-14 overflow-hidden rounded-3xl p-2 sm:p-3">
          {/* window chrome */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="size-2.5 rounded-full bg-destructive/70" />
            <span className="size-2.5 rounded-full bg-[var(--accent-blue)]/50" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <div className="glass-panel ml-3 flex-1 rounded-full px-3 py-1 text-center text-xs text-muted-foreground">
              skil — desktop app
            </div>
          </div>

          <div className="grid grid-cols-[64px_1fr] gap-3 sm:grid-cols-[72px_260px_1fr]">
            {/* rail */}
            <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl py-4">
              {[RefreshCw, Search, Inbox, FolderKanban].map((Icon, i) => (
                <span
                  key={i}
                  className={`flex size-9 items-center justify-center rounded-xl ${
                    i === 3
                      ? 'bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]'
                      : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="size-4" />
                </span>
              ))}
            </div>

            {/* command list */}
            <div className="glass-panel hidden flex-col gap-2 rounded-2xl p-3 sm:flex">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Commands
              </p>
              {commands.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl px-3 py-2.5 text-sm ${
                    c.id === previewCommand.id
                      ? 'glass-panel-strong font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {c.name}
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    {c.skillIds.length} skills
                  </p>
                </div>
              ))}
            </div>

            {/* detail */}
            <div className="glass-panel flex flex-col gap-4 rounded-2xl p-4 sm:p-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Command
                </p>
                <p className="mt-1 font-sans text-xl font-semibold">
                  {previewCommand.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  From inbox
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {previewSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="glass-panel flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                    >
                      <span>{skill.name}</span>
                      <span className="rounded-full bg-[var(--accent-blue)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-blue)]">
                        {skill.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
