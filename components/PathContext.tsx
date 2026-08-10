import Link from 'next/link'
import { Route } from 'lucide-react'
import { getPathNav } from '@/lib/paths'
import type { ArticleMeta } from '@/lib/articles'

// How many preceding articles to name. Three is enough to signal "you have
// arrived mid-sequence" without reprinting the syllabus — PathNav at the foot of
// the article, and the path page itself, are where the full order lives.
const LOOKBACK = 3

/**
 * Shown at the top of an article that sits partway through a learning path.
 *
 * lib/paths.ts does not hold reading suggestions; it holds authored dependency
 * claims, with the reasoning in its comments ("kinetics and equilibrium come
 * before acids/bases — Ka is an equilibrium constant"). That ordering was only
 * ever visible to someone who opened /learn first. A reader arriving from a
 * search result — which is most of them — landed on article 13 of 18, hit prose
 * that assumed the previous twelve, and had no way to find out that was what had
 * happened. PathNav says the same thing, but it is at the bottom: it is
 * reachable only by the readers who did not need it.
 *
 * Deliberately worded as "comes after", not "requires". The paths encode a
 * teaching order, and some of that order is dependency while some is taste. The
 * data cannot tell the two apart, so the copy does not claim it can, and the
 * article stays readable on its own.
 */
export function PathContext({
  slug,
  allArticles,
  prerequisites = [],
}: {
  slug: string
  allArticles: ArticleMeta[]
  prerequisites?: string[]
}) {
  const nav = getPathNav(slug)
  const titleOf = (s: string) => allArticles.find(a => a.slug === s)?.title ?? s

  // Declared prerequisites come first: they are an explicit statement that this
  // article assumes something, and unlike path position they can point outside
  // the path. pendulum-motion opens its own path and so had no predecessor to
  // name, while assuming calculus that lives in a different one entirely — the
  // banner rendered nothing for exactly the reader who needed it most.
  const declared = prerequisites.filter(s => s !== slug).map(s => ({ slug: s, title: titleOf(s) }))

  // Nothing to say: no path position to report and no declared assumption.
  if ((!nav || nav.index === 0) && declared.length === 0) return null

  const preceding = nav
    ? nav.path.articleSlugs
        .slice(Math.max(0, nav.index - LOOKBACK), nav.index)
        .map(s => ({ slug: s, title: titleOf(s) }))
    : []
  const path = nav?.path
  const index = nav?.index ?? 0
  const total = nav?.total ?? 0

  return (
    <aside className="mt-6 rounded-card border border-border bg-bg-surface px-4 py-3.5">
      {path && (
        <Link
          href={`/learn/${path.slug}`}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted hover:text-accent-gold transition-colors"
        >
          <Route size={13} />
          Part {index + 1} of {total} · {path.title}
        </Link>
      )}

      {declared.length > 0 && (
        <p className={`text-sm text-text-secondary ${path ? 'mt-2' : ''}`}>
          Assumes you have met{' '}
          {declared.map((d, i) => (
            <span key={d.slug}>
              {i > 0 && <span className="text-text-muted"> · </span>}
              <Link
                href={`/articles/${d.slug}`}
                className="text-text-primary underline decoration-border-hover underline-offset-2 hover:decoration-accent-gold transition-colors"
              >
                {d.title}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
      {/* Separated by "·", not by commas and "and". A prose list breaks down
          here because the titles contain conjunctions of their own — "Phase
          Transitions and Reaction Rates and Catalysis" reads as one garden path
          rather than as two articles. */}
      {preceding.length > 0 && (
      <p className="mt-2 text-sm text-text-secondary">
        Reads on its own, but comes after{' '}
        {preceding.map((p, i) => (
          <span key={p.slug}>
            {i > 0 && <span className="text-text-muted"> · </span>}
            <Link
              href={`/articles/${p.slug}`}
              className="text-text-primary underline decoration-border-hover underline-offset-2 hover:decoration-accent-gold transition-colors"
            >
              {p.title}
            </Link>
          </span>
        ))}
        {index > LOOKBACK && (
          <span className="text-text-muted"> (+{index - LOOKBACK} earlier)</span>
        )}
      </p>
      )}
    </aside>
  )
}
