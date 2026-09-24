import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/landing/marketing-layout'
import { CliInstall } from '@/components/landing/cli-install'

export const metadata: Metadata = {
  title: 'Skil CLI — scan, toggle, and doctor from the terminal',
  description:
    'Clone the repo, build, run npx skil. Same scan / toggle / doctor loop. No login. No brew tap yet.',
}

const groups: {
  title: string
  note?: string
  commands: { cmd: string; desc: string }[]
}[] = [
  {
    title: 'Find',
    commands: [
      { cmd: 'skil search', desc: 'top 10 by installs' },
      { cmd: 'skil search --trending', desc: "what's hot" },
      { cmd: 'skil search <name>', desc: 'lookup by name' },
      { cmd: 'skil suggest', desc: 'picks for this repo' },
      { cmd: 'skil install <id>', desc: 'drop that skill in' },
    ],
  },
  {
    title: 'Skills',
    note: 'On = live pair. Off = parked, not deleted. Not skil enable — that one’s for commands.',
    commands: [
      { cmd: 'skil scan', desc: 'find SKILL.md folders. leftover-only copies into live pair.' },
      { cmd: 'skil skills', desc: 'catalog, on / off' },
      { cmd: 'skil skills enable <id>', desc: 'turn a skill on' },
      { cmd: 'skil skills disable <id>', desc: 'park it' },
    ],
  },
  {
    title: 'Commands',
    note: 'A command is a workflow (build → /build). Adding a skill doesn’t turn it on.',
    commands: [
      { cmd: 'skil create <name>', desc: 'make a command (starts off)' },
      { cmd: 'skil list', desc: "what's on the map" },
      { cmd: 'skil add <command> <skill>', desc: 'put a skill on a command' },
      { cmd: 'skil remove <command> <skill>', desc: 'take it off' },
      { cmd: 'skil enable <command>', desc: 'turn the command on' },
      { cmd: 'skil disable <command>', desc: 'park it' },
      { cmd: 'skil delete <command>', desc: 'drop the command' },
    ],
  },
  {
    title: 'Rules',
    commands: [
      { cmd: 'skil rules', desc: 'list shared AGENTS.md sections' },
      { cmd: 'skil rules enable <id>', desc: 'turn a section on' },
      { cmd: 'skil rules disable <id>', desc: 'turn it off' },
    ],
  },
  {
    title: 'Eval',
    commands: [
      { cmd: 'skil doctor', desc: 'checkup per command' },
      { cmd: 'skil doctor <command>', desc: "that command's findings" },
      { cmd: 'skil usage', desc: 'how often a skill actually got read' },
    ],
  },
]

export default function CliPage() {
  return (
    <MarketingLayout>
      <CliInstall />

      <section className="px-4 pb-24 sm:px-6 sm:pb-32">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
            Command reference
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Same groups as the README.{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              skil --help
            </code>{' '}
            if you get lost.
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <section key={group.title} className="glass-panel rounded-2xl p-5">
                <h3 className="font-sans text-sm font-semibold tracking-tight">
                  {group.title}
                </h3>
                {group.note ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {group.note}
                  </p>
                ) : null}
                <ul className="mt-4 flex flex-col">
                  {group.commands.map((item) => (
                    <li
                      key={item.cmd}
                      className="grid gap-1 border-b border-[rgb(var(--glass-border))] py-2.5 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(16rem,auto)_1fr] sm:items-baseline sm:gap-6"
                    >
                      <code className="font-mono text-[13px] font-medium text-[var(--accent-blue)]">
                        {item.cmd}
                      </code>
                      <span className="text-sm text-muted-foreground">
                        {item.desc}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
