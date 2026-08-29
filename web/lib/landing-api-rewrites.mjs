/** Dev-only Next rewrites so `next dev` can reach Vercel `/api/*`. */

export function landingApiRewrites(isDev, apiBaseUrl) {
  if (!isDev) return []
  const base = String(apiBaseUrl).replace(/\/+$/, '')
  return [{ source: '/api/:path*', destination: `${base}/api/:path*` }]
}
