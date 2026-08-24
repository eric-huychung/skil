import { FolderGit2, ScanSearch, LayoutGrid, UploadCloud } from 'lucide-react'

const steps = [
  {
    icon: FolderGit2,
    title: 'Connect a repo',
    description:
      'Point Skil at a local project folder. No account, no OAuth, nothing to sign into.',
  },
  {
    icon: ScanSearch,
    title: 'Scan',
    description:
      'It reads .cursor, .claude, .windsurf, and .agents and lists every skill and slash command it finds.',
  },
  {
    icon: LayoutGrid,
    title: 'Organize',
    description:
      'Group commands under the SDLC stages you use — planning, build, testing, review — and file skills underneath.',
  },
  {
    icon: UploadCloud,
    title: 'Export',
    description:
      'Write the organized set back to the repo. Additive by default, with a warning before anything is overwritten.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            One flow, from scattered files to a shared playbook
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Skil doesn&apos;t invent a new format. It reads what your agents
            already use and gives it structure.
          </p>
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="glass-panel flex flex-col gap-4 rounded-3xl p-6"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--accent-blue)] text-[var(--accent-blue-foreground)]">
                  <step.icon className="size-5" />
                </span>
                <span className="text-sm text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <div>
                <h3 className="font-sans text-base font-semibold">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
