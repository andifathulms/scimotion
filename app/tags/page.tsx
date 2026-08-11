import { getAllTags } from '@/lib/articles'
import Link from 'next/link'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Tags',
  description: 'Browse interactive science articles by tag.',
  path: '/tags',
})

// A tag used more than once connects articles; a tag used once is a label on a
// single article and cannot lead anywhere else. 367 of the 471 tags are in the
// second group, so a flat wall gave 471 equally-important-looking choices when
// roughly a hundred of them can actually be browsed.
//
// getAllTags already sorts by count, so the useful tags were always first — but
// every pill carried identical weight, which made that ordering invisible. The
// split and the weighting are presentational only: same tags, same order, same
// destinations.
const RECURRING = 2

export default async function TagsPage() {
  const tags = await getAllTags()
  const recurring = tags.filter(t => t.count >= RECURRING)
  const singles = tags.filter(t => t.count < RECURRING)

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-3xl font-bold text-text-primary mb-2">Browse by tag</h1>
      <p className="text-base text-text-secondary mb-10">
        {tags.length} tags across the library. {recurring.length} of them join two or
        more articles.
      </p>

      <section aria-labelledby="recurring-tags" className="mb-12">
        <h2
          id="recurring-tags"
          className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4"
        >
          Tags that connect articles
        </h2>
        <div className="flex flex-wrap gap-2.5">
          {recurring.map(({ tag, count }) => (
            <Link
              key={tag}
              href={`/tags/${encodeURIComponent(tag)}`}
              className="flex items-center gap-1.5 rounded-pill border border-border-hover bg-bg-surface px-3.5 py-1.5 text-sm text-text-primary transition-colors hover:border-accent-gold hover:text-accent-gold"
            >
              #{tag}
              <span className="text-text-muted tabular-nums">{count}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="single-tags">
        <h2
          id="single-tags"
          className="text-xs font-medium uppercase tracking-wider text-text-muted mb-4"
        >
          Used once — {singles.length}
        </h2>
        {/* Smaller, quieter, and without the count, which is 1 for every one of
            them and so carries no information here. Still full-contrast enough
            to read: --text-secondary clears AA on every surface. */}
        <div className="flex flex-wrap gap-2">
          {singles.map(({ tag }) => (
            <Link
              key={tag}
              href={`/tags/${encodeURIComponent(tag)}`}
              className="rounded-pill border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-accent-gold"
            >
              #{tag}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
