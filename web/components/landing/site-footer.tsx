import Link from 'next/link'
import { Logo } from '@/components/brand/logo'

export function SiteFooter() {
  return (
    <footer className="glass-hairline border-t px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Link href="/" className="flex items-center gap-2">
          <Logo
            chipClassName="size-6 rounded-md"
            markClassName="size-4"
            wordmarkClassName="text-[1.15rem] [-webkit-text-stroke-width:1.15px]"
          />
        </Link>
        <p className="text-sm text-muted-foreground">
          Reads your repo. Doesn&apos;t phone home.
        </p>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#download" className="transition-colors hover:text-foreground">
            Open app
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </a>
        </nav>
      </div>
    </footer>
  )
}
