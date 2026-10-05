import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingLayout } from '@/components/landing/marketing-layout'
import { PageIntro } from '@/components/landing/page-intro'
import { GITHUB_REPO, LINKEDIN_PROFILE } from '@/lib/site-links'

export const metadata: Metadata = {
  title: 'Legal — MIT, unsigned app, what Skil collects',
  description:
    'MIT license. No login. Third-party skills are not ours. Unsigned macOS app. What the site and Discover collect.',
}

const sections = [
  {
    title: 'License',
    body: (
      <>
        Skil is MIT. Source is on{' '}
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline-offset-4 hover:underline"
        >
          GitHub
        </a>
        . You can use, copy, fork, and sell it. No warranty. It is provided as
        is.
      </>
    ),
  },
  {
    title: 'No login',
    body: (
      <>
        No accounts. Catalog state lives in{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
          .skil/state.json
        </code>{' '}
        in the folder you connect. We do not upload your repo.
      </>
    ),
  },
  {
    title: 'What talks to the network',
    body: (
      <>
        The website is hosted on Vercel. It uses Vercel Analytics for page
        views. Discover (app, CLI, and the leaderboard) fetches skill listings
        and SKILL.md previews through skil.website, which talks to skills.sh.
        Scan, toggles, park, doctor, and usage stay on disk.
      </>
    ),
  },
  {
    title: 'Third-party skills',
    body: (
      <>
        Market skills belong to their authors. We index skills.sh and link out
        (“See more at skills.sh”). We do not claim those files. Their license
        is theirs. Install copies that skill into your project when you ask.
      </>
    ),
  },
  {
    title: 'Unsigned app',
    body: (
      <>
        The macOS .dmg is unsigned on purpose. Gatekeeper will warn. That is us
        skipping Apple’s fee, not a promise the file is safe. You choose to
        open it. Steps are on the{' '}
        <Link href="/app" className="text-foreground underline-offset-4 hover:underline">
          App
        </Link>{' '}
        page.
      </>
    ),
  },
]

export default function LegalPage() {
  return (
    <MarketingLayout>
      <section className="px-4 pt-40 pb-24 sm:px-6 sm:pb-32">
        <div className="mx-auto max-w-6xl">
          <PageIntro kicker="Resources" title="Legal">
            <p>
              Short version. MIT. What talks to the network. What is not ours.
            </p>
          </PageIntro>

          <dl className="mt-14 max-w-3xl divide-y divide-[rgb(var(--glass-border))] border-t border-[rgb(var(--glass-border))]">
            {sections.map((item) => (
              <div key={item.title} className="py-6">
                <dt className="font-sans text-base font-semibold tracking-tight">
                  {item.title}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 max-w-2xl text-sm text-muted-foreground">
            Questions?{' '}
            <a
              href={`${GITHUB_REPO}/issues/new?template=bug.yml`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-4 hover:underline"
            >
              GitHub
            </a>
            {' '}or{' '}
            <a
              href={LINKEDIN_PROFILE}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-4 hover:underline"
            >
              LinkedIn
            </a>
            .
          </p>
        </div>
      </section>
    </MarketingLayout>
  )
}
