import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { landingApiRewrites } from './lib/landing-api-rewrites.mjs'

const isDev = process.env.NODE_ENV === 'development'
const website = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/config/website.json'), 'utf8')
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export is prod-only. `output: 'export'` drops rewrites, and
  // `next dev` does not serve the repo-root Vercel functions in `api/`.
  ...(isDev ? {} : { output: 'export' }),
  images: {
    unoptimized: true,
  },
  experimental: {
    externalDir: true,
  },
  ...(isDev
    ? {
        async rewrites() {
          return landingApiRewrites(true, website.apiBaseUrl)
        },
      }
    : {}),
}

export default nextConfig
