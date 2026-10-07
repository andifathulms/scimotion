import { learningPaths, getPath, dominantTopic } from '@/lib/paths'
import { getAllArticles } from '@/lib/articles'
import { topicVar } from '@/lib/topics'
import { TopicBadge } from '@/components/TopicBadge'
import { PageHeader } from '@/components/PageHeader'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'

type Props = { params: Promise<{ path: string }> }

export async function generateStaticParams() {
  return learningPaths.map(p => ({ path: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  const p = getPath(path)
  if (!p) return {}
  return pageMetadata({ title: p.title, description: p.description, path: `/learn/${path}` })
}

export default async function PathPage({ params }: Props) {
  const { path } = await params
  const p = getPath(path)
  if (!p) notFound()

  const articles = await getAllArticles()
  const items = p.articleSlugs
    .map(slug => articles.find(a => a.slug === slug))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
  const topic = dominantTopic(items)
  const accent = topic ? topicVar(topic) : 'var(--color-accent-gold)'
  const minutes = items.reduce((n, a) => n + a.readTime, 0)

  return (
    <div className="max-w-[820px] mx-auto px-5 py-14" style={{ '--t': accent } as React.CSSProperties}>
      <PageHeader
        back={{ href: '/learn', label: 'All paths' }}
        eyebrow={`Learning path · ${items.length} parts`}
        title={p.title}
        description={p.description}
        meta={`About ${Math.round(minutes / 60) || 1} ${Math.round(minutes / 60) === 1 ? 'hour' : 'hours'} of reading · ${items.reduce((n, a) => n + a.widgets, 0)} widgets`}
        accent={accent}
      />

      {items[0] && (
        <Link
          href={`/articles/${items[0].slug}`}
          className="mb-12 inline-flex items-center gap-2 rounded-control bg-(--t) px-5 py-3 text-sm font-semibold text-bg-base transition-[filter] hover:brightness-110"
        >
          Start with {items[0].title}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}

      {/* A route, drawn: the rule is the line the stops sit on. */}
      <ol className="relative ml-4 border-l-2 border-bg-raised">
        {items.map((a, i) => (
          <li key={a.slug} className="relative pb-6 pl-9 last:pb-0">
            <span
              aria-hidden="true"
              className="absolute -left-[15px] top-4 flex size-7 items-center justify-center rounded-full border-2 border-(--t) bg-bg-base font-mono text-xs font-medium text-(--t)"
            >
              {i + 1}
            </span>
            <Link
              href={`/articles/${a.slug}`}
              className="group block rounded-card border border-border bg-bg-surface p-5 transition-colors hover:border-[color-mix(in_srgb,var(--t)_45%,var(--color-border))]"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <TopicBadge topic={a.topic} />
                <span className="font-mono text-xs text-text-muted">{a.readTime} min</span>
              </div>
              <h2 className="font-display text-lg font-semibold text-text-primary transition-colors group-hover:text-(--t)">
                <span className="sr-only">Part {i + 1}: </span>
                {a.title}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">{a.description}</p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
