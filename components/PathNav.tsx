import Link from 'next/link'
import { ArrowLeft, ArrowRight, Route } from 'lucide-react'
import { getPathNav } from '@/lib/paths'
import type { ArticleMeta } from '@/lib/articles'

export function PathNav({ slug, allArticles }: { slug: string; allArticles: ArticleMeta[] }) {
  const nav = getPathNav(slug)
  if (!nav) return null

  const titleOf = (s: string) => allArticles.find(a => a.slug === s)?.title ?? s
  const { path, index, total, prevSlug, nextSlug } = nav

  return (
    <div className="my-10 rounded-2xl border border-border bg-bg-surface p-5">
      <Link
        href={`/learn/${path.slug}`}
        className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted hover:text-accent-gold transition-colors mb-4"
      >
        <Route size={13} />
        {path.title} · Part {index + 1} of {total}
      </Link>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {prevSlug ? (
          <Link
            href={`/articles/${prevSlug}`}
            className="group flex items-start gap-2.5 rounded-xl border border-border hover:border-border-hover p-3.5 transition-colors"
          >
            <ArrowLeft size={16} className="mt-0.5 shrink-0 text-text-muted group-hover:text-accent-gold transition-colors" />
            <span>
              <span className="block text-xs text-text-muted">Previous</span>
              <span className="block text-sm text-text-primary group-hover:text-accent-gold transition-colors">{titleOf(prevSlug)}</span>
            </span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {nextSlug && (
          <Link
            href={`/articles/${nextSlug}`}
            className="group flex items-start gap-2.5 rounded-xl border border-border hover:border-border-hover p-3.5 transition-colors sm:text-right sm:flex-row-reverse"
          >
            <ArrowRight size={16} className="mt-0.5 shrink-0 text-text-muted group-hover:text-accent-gold transition-colors" />
            <span>
              <span className="block text-xs text-text-muted">Next</span>
              <span className="block text-sm text-text-primary group-hover:text-accent-gold transition-colors">{titleOf(nextSlug)}</span>
            </span>
          </Link>
        )}
      </div>
    </div>
  )
}
