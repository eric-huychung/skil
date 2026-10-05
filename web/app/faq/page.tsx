import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingLayout } from '@/components/landing/marketing-layout'
import { PageIntro } from '@/components/landing/page-intro'
import { GITHUB_REPO } from '@/lib/site-links'

export const metadata: Metadata = {
  title: 'Skil FAQs — unsigned app, parking, commands',
  description:
    'No login. Off parks a skill, it is not deleted. macOS will yell at the unsigned app. Answers to the questions we get first.',
}

const faqs = [
  {
    q: 'What is Skil?',
    a: 'A local catalog for agent skills. Find them, file them onto workflows like /build, and see which ones still earn their tokens. macOS app + CLI. No login.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. No account. Catalog is .skil/state.json in that folder. Discover fetches listings (skills.sh via skil.website). The website uses Vercel Analytics. Scan, toggles, doctor stay local.',
  },
  {
    q: 'I turned a skill off. Is it gone?',
    a: 'No. Off parks it under .skil/parked. Not deleted. Toggle on restores the live pair in .agents and .claude.',
  },
  {
    q: 'What’s the difference between Discover and Skills?',
    a: 'Discover is the market (skills.sh rankings). Skills is what’s already in this project.',
  },
  {
    q: 'What is a command?',
    a: 'A workflow like /build. Filing a skill onto a command does not turn the skill on. The toggle does.',
  },
  {
    q: 'macOS blocked the app. Now what?',
    a: 'Unsigned on purpose — no Apple tax. System Settings → Privacy & Security → Open Anyway. Once is enough. Or curl the .dmg so it never gets the browser quarantine stamp. Steps are on the App page.',
  },
]

export default function FaqPage() {
  return (
    <MarketingLayout>
      <section className="px-4 pt-40 pb-24 sm:px-6 sm:pb-32">
        <div className="mx-auto max-w-6xl">
          <PageIntro kicker="Resources" title="FAQs">
            <p>
              Short answers. More later. If something’s actually broken,{' '}
              <a
                href={`${GITHUB_REPO}/issues/new?template=bug.yml`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline-offset-4 hover:underline"
              >
                report a bug
              </a>
              .
            </p>
          </PageIntro>

          <dl className="mt-14 max-w-3xl divide-y divide-[rgb(var(--glass-border))] border-t border-[rgb(var(--glass-border))]">
            {faqs.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="font-sans text-base font-semibold tracking-tight">
                  {item.q}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-10 max-w-2xl text-sm text-muted-foreground">
            Prefer the terminal?{' '}
            <Link href="/cli" className="text-foreground underline-offset-4 hover:underline">
              CLI install
            </Link>
            . Prefer a window?{' '}
            <Link href="/app" className="text-foreground underline-offset-4 hover:underline">
              Download the app
            </Link>
            . MIT, unsigned app, what we collect —{' '}
            <Link href="/legal" className="text-foreground underline-offset-4 hover:underline">
              Legal
            </Link>
            .
          </p>
        </div>
      </section>
    </MarketingLayout>
  )
}
