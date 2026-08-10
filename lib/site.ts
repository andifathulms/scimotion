// Absolute base for canonical URLs, OG tags, the sitemap and the RSS feed.
// Must include the /scimotion subpath — this is a GitHub Pages project site.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://andifathulms.github.io/scimotion'

export const SITE_NAME = 'Scimotion'
// Kept in step with the hero, and deliberately free of an article count: this
// string is baked into the feed and the web manifest, where a number would go
// stale the next time an article lands. The homepage counts from the content
// directory instead.
export const SITE_DESCRIPTION =
  'Interactive science explainers. Read the concept, then drag the sliders and watch the model respond — every article ships with two hand-built widgets.'
