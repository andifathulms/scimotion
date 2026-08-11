import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from './site'

/**
 * One place that turns a page's own title and description into the full set of
 * head tags: canonical, Open Graph and Twitter.
 *
 * Only /articles/[slug] had any of these. Every other route — the homepage
 * included — shipped a title and a description and nothing else, so sharing the
 * thing anyone would actually link produced a bare URL with no card. Ten routes
 * were affected.
 *
 * The point of a helper rather than ten hand-written blocks is that the OG
 * description cannot drift from the page's own description: both come from the
 * single `description` argument, which each route derives from the same data it
 * renders (TOPIC_DESCRIPTIONS for a field, path.description for a path, the live
 * article count for the homepage). A preview that disagrees with the page is
 * worse than no preview.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  /** Page title WITHOUT the site suffix — this adds it. */
  title: string
  description: string
  /** Route path with a leading slash, or '' for the homepage. */
  path: string
}): Metadata {
  const url = `${SITE_URL}${path}`
  const full = path === '' ? title : `${title} — ${SITE_NAME}`

  return {
    title: full,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: full,
      description,
      url,
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: full,
      description,
    },
  }
}
