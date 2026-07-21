// Absolute base for canonical URLs, OG tags, the sitemap and the RSS feed.
// Must include the /scimotion subpath — this is a GitHub Pages project site.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://andifathulms.github.io/scimotion'

export const SITE_NAME = 'Scimotion'
export const SITE_DESCRIPTION =
  'A science blog where every concept is explained with interactive, controllable animations.'
