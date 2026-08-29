/*
 * Regenerates every app icon from the Skil brand mark (the purple chip +
 * white hierarchy glyph used by web/components/brand/logo.tsx). Colors
 * mirror public/brand.css. Run after a rebrand:
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs:
 *   web/public/icon.svg              favicon (SVG, browsers that support it)
 *   web/public/icon-light-32x32.png  favicon fallback (light scheme)
 *   web/public/icon-dark-32x32.png   favicon fallback (dark scheme)
 *   web/public/apple-icon.png        apple-touch-icon, 180x180 full-bleed
 *   gui/resources/icon.png           Electron dock/window icon, 1024x1024
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// sharp already ships with the web app (Next.js image pipeline) — reuse it.
const require = createRequire(join(root, 'web', 'package.json'))
const sharp = require('sharp')

const BRAND = '#8b5cf6' // --color-brand in public/brand.css
const FOREGROUND = '#ffffff' // --color-brand-foreground

/** The hierarchy glyph from logo.tsx, in its native 24-unit space. */
function glyph() {
  return `
    <rect x="5" y="4" width="14" height="3.4" rx="1.7" fill="${FOREGROUND}"/>
    <path d="M7.4 7.4v6.5a2 2 0 0 0 2 2H10M7.4 10.8a2 2 0 0 0 2 2H10"
      stroke="${FOREGROUND}" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>
    <rect x="11" y="10.6" width="8" height="3" rx="1.5" fill="${FOREGROUND}" opacity="0.85"/>
    <rect x="11" y="15.9" width="8" height="3" rx="1.5" fill="${FOREGROUND}" opacity="0.7"/>`
}

/**
 * Purple chip with the glyph centered inside, like the footer logo.
 * chipSize/chipOffset let the macOS dock icon leave transparent margin
 * around the chip (Apple's icon grid), while favicons go full-canvas.
 */
function chipSvg({ canvas, chipOffset = 0, cornerRadius }) {
  const chipSize = canvas - chipOffset * 2
  const scale = chipSize / 32 // glyph art was authored on a 32px chip
  const pad = 4 * scale // (32 - 24) / 2 of glyph space
  return `<svg width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="${chipOffset}" y="${chipOffset}" width="${chipSize}" height="${chipSize}" rx="${cornerRadius}" fill="${BRAND}"/>
  <g transform="translate(${chipOffset + pad} ${chipOffset + pad}) scale(${scale})">${glyph()}
  </g>
</svg>
`
}

async function png(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath)
  console.log('wrote', outPath)
}

const webPublic = join(root, 'web', 'public')
const guiResources = join(root, 'gui', 'resources')
mkdirSync(guiResources, { recursive: true })

// Favicon: full-canvas chip, same look in both color schemes (the brand
// purple is identical in light and dark per brand.css).
const favicon = chipSvg({ canvas: 32, cornerRadius: 7 })
writeFileSync(join(webPublic, 'icon.svg'), favicon)
console.log('wrote', join(webPublic, 'icon.svg'))
await png(favicon, join(webPublic, 'icon-light-32x32.png'), 32)
await png(favicon, join(webPublic, 'icon-dark-32x32.png'), 32)

// Apple touch icon: full-bleed square, iOS rounds the corners itself.
await png(chipSvg({ canvas: 180, cornerRadius: 0 }), join(webPublic, 'apple-icon.png'), 180)

// Electron dock icon: macOS-style — rounded chip at ~80% of the canvas
// with transparent margin, so it sits well next to native app icons.
await png(
  chipSvg({ canvas: 1024, chipOffset: 100, cornerRadius: 185 }),
  join(guiResources, 'icon.png'),
  1024,
)
