import Link from 'next/link'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'
import { getAllArticles } from '@/lib/articles'
import { TOPICS, TOPIC_DESCRIPTIONS, topicToSlug, topicVar } from '@/lib/topics'
import { PageHeader } from '@/components/PageHeader'
import { TopicGlyph } from '@/components/TopicGlyph'
import { ArticleVisual } from '@/components/ArticleVisual'

export const metadata: Metadata = pageMetadata({
  title: 'Topics',
  description:
    'Browse interactive science articles by field — mathematics, physics, chemistry, biology, earth & climate, computer science and medicine.',
  path: '/topics',
})

// Each field is shown by one of its own diagrams and three of its titles, which
// answer "what would I learn here?" faster than a sentence can. The tiles used
// to be nine text boxes and a pill. The diagram is the server-rendered SVG the
// cards already use, so the gallery costs no client JavaScript.
export default async function TopicsPage() {
  const articles = await getAllArticles()
  const fields = TOPICS.map(topic => ({ topic, items: articles.filter(a => a.topic === topic) })).filter(f => f.items.length)

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-14">
      <PageHeader
        eyebrow="Fields"
        title="Browse by field"
        description="Nine fields, each with its own corner of the library. Pick one to see every explainer in it."
        meta={`${fields.length} fields · ${articles.length} articles`}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(({ topic, items }) => {
          const cover = items.find(a => a.featured) ?? items[0]
          return (
            <Link
              key={topic}
              href={`/topics/${topicToSlug(topic)}`}
              style={{ '--t': topicVar(topic) } as React.CSSProperties}
              className="article-card group flex flex-col overflow-hidden rounded-[1.125rem] border border-border bg-bg-surface"
            >
              <div className="article-card-thumb relative h-[140px] shrink-0 overflow-hidden border-b border-border [&>svg]:absolute [&>svg]:inset-0 [&>svg]:h-full">
                <ArticleVisual slug={cover.slug} topic={topic} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <h2 className="flex items-baseline justify-between gap-3 font-display text-xl font-semibold text-text-primary">
                  <span className="flex items-center gap-2">
                    <span className="text-(--t)"><TopicGlyph topic={topic} size={16} /></span>
                    {topic}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-normal text-text-muted">{items.length}</span>
                </h2>
                <p className="text-sm text-text-secondary">{TOPIC_DESCRIPTIONS[topic]}</p>
                <ul className="mt-auto flex flex-wrap gap-1.5 pt-2" aria-label={`Examples in ${topic}`}>
                  {items.slice(0, 3).map(a => (
                    <li key={a.slug} className="max-w-full truncate rounded-md bg-bg-hover px-2 py-1 text-xs text-text-secondary">
                      {a.title.split(':')[0]}
                    </li>
                  ))}
                </ul>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
