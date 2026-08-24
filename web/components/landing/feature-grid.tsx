import { ShieldCheck, KeyRound, Layers3, RefreshCcw } from 'lucide-react'

const features = [
  {
    icon: KeyRound,
    title: 'No login required',
    description:
      'Point Skil at a folder and start. There is no account to create.',
  },
  {
    icon: ShieldCheck,
    title: 'Additive by default',
    description:
      'Exports add files and warn before overwriting anything you already have.',
  },
  {
    icon: Layers3,
    title: 'Organized by SDLC stage',
    description:
      'Skills sit under the commands that use them, and commands sit under the stage they belong to.',
  },
  {
    icon: RefreshCcw,
    title: 'Re-scan anytime',
    description:
      'Refresh the view after editing the repo. It is a re-scan, not a live merge — you stay in control.',
  },
]

export function FeatureGrid() {
  return (
    <section id="features" className="px-4 py-24 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <h2 className="text-balance font-sans text-3xl font-semibold tracking-tight sm:text-4xl">
            Built to stay out of your way
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-panel flex items-start gap-4 rounded-3xl p-6"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]">
                <feature.icon className="size-5" />
              </span>
              <div>
                <h3 className="font-sans text-base font-semibold">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
