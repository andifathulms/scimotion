'use client'
import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useProgress } from '@/hooks/useProgress'
import { getPathNav } from '@/lib/paths'
import { topicVar } from '@/lib/topics'
import type { ArticleMeta } from '@/lib/articles'

// "Pick up where you left off", for a returning reader. If the last article was
// finished, it offers the next one in that article's path instead, so the strip
// always points forward. First-time visitors see nothing at all.
export function ContinueReading({ articles }: { articles: ArticleMeta[] }) {
  const { last, read } = useProgress()
  if (!last) return null

  const lastArticle = articles.find(a => a.slug === last.slug)
  if (!lastArticle) return null

  const nav = getPathNav(last.slug)
  const finished = !!read[last.slug]
  const nextSlug = finished ? nav?.nextSlug : null
  const target = nextSlug ? articles.find(a => a.slug === nextSlug) : finished ? null : lastArticle
  if (!target) return null

  const done = nav ? nav.path.articleSlugs.filter(s => read[s]).length : 0

  return (
    <Link
      href={`/articles/${target.slug}`}
      style={{ '--t': topicVar(target.topic) } as React.CSSProperties}
      className="card-rise group mb-10 flex items-center gap-4 rounded-card border border-border bg-bg-surface p-4 transition-colors hover:border-[color-mix(in_srgb,var(--t)_45%,var(--color-border))] sm:p-5"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--t)_14%,transparent)] text-(--t)">
        <BookOpen size={20} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs uppercase tracking-[0.12em] text-text-muted">
          {nextSlug ? 'Up next' : 'Continue reading'}
          {nav && ` · ${nav.path.title} · ${done} of ${nav.total} read`}
        </span>
        <span className="mt-1 block truncate font-display text-lg font-semibold text-text-primary group-hover:text-(--t)">
          {target.title}
        </span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-(--t)" aria-hidden="true" />
    </Link>
  )
}
