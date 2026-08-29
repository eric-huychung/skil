'use client'

import * as React from 'react'
import { Download, Apple } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Arch = 'silicon' | 'intel'

const archOptions: { key: Arch; label: string; sub: string }[] = [
  { key: 'silicon', label: 'Apple Silicon', sub: 'M1 · M2 · M3 · M4' },
  { key: 'intel', label: 'Intel', sub: 'Core i5 · i7 · i9' },
]

type DownloadCtaProps = {
  /** Center the control (hero) vs. left-align (inline sections). */
  align?: 'center' | 'start'
  /**
   * "compact" renders just the two primary buttons (hero) and links the
   * download button down to the full chip picker. "detailed" renders the
   * chip picker inline (closing CTA).
   */
  variant?: 'compact' | 'detailed'
}

/**
 * macOS download control. In "detailed" mode it includes an Apple Silicon /
 * Intel chip selector and the download button label updates with the
 * selection. In "compact" mode (the hero) it's just the two buttons, and
 * the download button anchors down to the detailed picker in the closing
 * CTA section.
 */
export function DownloadCta({
  align = 'center',
  variant = 'detailed',
}: DownloadCtaProps) {
  const [arch, setArch] = React.useState<Arch>('silicon')
  const active = archOptions.find((a) => a.key === arch)!
  const isDetailed = variant === 'detailed'

  return (
    <div
      className={`flex flex-col gap-5 ${
        align === 'center' ? 'items-center' : 'items-start'
      }`}
    >
      {isDetailed && (
        <div
          role="radiogroup"
          aria-label="Choose your Mac chip"
          className="grid w-full grid-cols-2 gap-2.5 sm:w-[380px]"
        >
          {archOptions.map((option) => {
            const selected = option.key === arch
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setArch(option.key)}
                className={`relative flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-[var(--accent-blue)]/60 bg-[var(--accent-blue)]/10'
                    : 'border-border/60 bg-transparent hover:border-border hover:bg-muted/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute right-3 top-3 flex size-4 items-center justify-center rounded-full border transition-colors ${
                    selected
                      ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]'
                      : 'border-border'
                  }`}
                >
                  {selected && (
                    <span className="size-1.5 rounded-full bg-[var(--accent-blue-foreground)]" />
                  )}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.sub}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div
        className={`flex flex-col gap-3 sm:flex-row ${
          align === 'center' ? 'items-center' : 'items-start'
        }`}
      >
        <Button
          size="lg"
          nativeButton={false}
          className="primary-button px-6"
          render={<a href="#download" />}
        >
          <Apple className="size-4" />
          {isDetailed ? `Download for ${active.label}` : 'Download for Mac'}
        </Button>
        <Button
          size="lg"
          nativeButton={false}
          className="outline-button px-6"
          render={
            <a
              href="https://github.com/eric-huychung/skil"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <Download className="size-4" />
          View source
        </Button>
      </div>

      {isDetailed && (
        <p className="text-xs text-muted-foreground">
          macOS 12 Monterey or later · Universal .dmg also available
        </p>
      )}
    </div>
  )
}
