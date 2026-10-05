export const GITHUB_REPO = 'https://github.com/eric-huychung/skil'
export const LINKEDIN_PROFILE = 'https://www.linkedin.com/in/huychung/'

export type FooterLinkItem = {
  href: string
  label: string
  external?: boolean
}

export type FooterSocialItem = {
  id: 'linkedin' | 'github'
  href: string
  label: string
}

export const FOOTER_PRODUCT: FooterLinkItem[] = [
  { href: '/about', label: 'About Skil' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/cli', label: 'CLI' },
  { href: '/app', label: 'App' },
]

export const FOOTER_RESOURCES: FooterLinkItem[] = [
  {
    href: `${GITHUB_REPO}/issues/new?template=bug.yml`,
    label: 'Report a bug',
    external: true,
  },
  {
    href: `${GITHUB_REPO}/issues/new?template=feature.yml`,
    label: 'Suggest an idea',
    external: true,
  },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQs' },
  { href: '/legal', label: 'Legal' },
]

export const FOOTER_SOCIAL: FooterSocialItem[] = [
  { id: 'linkedin', href: LINKEDIN_PROFILE, label: 'LinkedIn' },
  { id: 'github', href: GITHUB_REPO, label: 'GitHub' },
]
