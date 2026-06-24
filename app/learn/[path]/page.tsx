import { learningPaths, getPath } from '@/lib/paths'
import { getAllArticles } from '@/lib/articles'
import { TopicBadge } from '@/components/TopicBadge'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

type Props = { params: Promise<{ path: string }> }

export async function generateStaticParams() {
  return learningPaths.map(p => ({ path: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  const p = getPath(path)
  if (!p) return {}
  return { title: `${p.title} — Scimotion`, description: p.description }
}

export default async function PathPage({ params }: Props) {
  const { path } = await params
  const p = getPath(path)
  if (!p) notFound()

  const articles = await getAllArticles()
  const items = p.articleSlugs
    .map(slug => articles.find(a => a.slug === slug))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))

  return (
    <div className="max-w-[760px] mx-auto px-5 py-12">
      <Link href="/learn" className="text-xs text-text-muted hover:text-text-primary transition-colors">
        ← All paths
      </Link>
      <h1 className="text-2xl font-bold text-text-primary mt-3 mb-2" style={{ letterSpacing: '-0.3px' }}>
        {p.title}
      </h1>
      <p className="text-text-secondary text-base mb-2">{p.description}</p>
      <p className="text-xs text-text-muted uppercase tracking-wider mb-10">{items.length} articles</p>

      <ol className="relative border-l border-border ml-3">
        {items.map((a, i) => (
          <li key={a.slug} className="relative pl-8 pb-8 last:pb-0">
            <span className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-bg-surface border border-border-hover flex items-center justify-center text-xs text-text-secondary">
              {i + 1}
            </span>
            <Link href={`/articles/${a.slug}`} className="group block">
              <div className="flex items-center gap-2 mb-1">
                <TopicBadge topic={a.topic} />
                <span className="text-xs text-text-muted">{a.readTime} min</span>
              </div>
              <h2 className="text-base font-semibold text-text-primary group-hover:text-accent-gold transition-colors">
                {a.title}
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed mt-1">{a.description}</p>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
