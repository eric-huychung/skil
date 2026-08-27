import { SiteNav } from '@/components/landing/site-nav'
import { Hero } from '@/components/landing/hero'
import { SupportedTools } from '@/components/landing/supported-tools'
import { HowItWorks } from '@/components/landing/how-it-works'
import { ProductPreview } from '@/components/landing/product-preview'
import { Discover } from '@/components/landing/discover'
import { FeatureGrid } from '@/components/landing/feature-grid'
import { CliInstall } from '@/components/landing/cli-install'
import { FooterCta } from '@/components/landing/footer-cta'
import { SiteFooter } from '@/components/landing/site-footer'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main>
        <Hero />
        <SupportedTools />
        <HowItWorks />
        <ProductPreview />
        <Discover />
        <FeatureGrid />
        <CliInstall />
        <FooterCta />
      </main>
      <SiteFooter />
    </div>
  )
}
