import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'
import { getArticlesByTopic } from '@/lib/articles'
import { TOPICS, TOPIC_DESCRIPTIONS, topicToSlug, slugToTopic, topicVar } from '@/lib/topics'
import { PageHeader } from '@/components/PageHeader'
import { TopicGlyph } from '@/components/TopicGlyph'
import { ArticleCard } from '@/components/ArticleCard'

type Props = { params: Promise<{ topic: string }> }

export async function generateStaticParams() {
  return TOPICS.map(topic => ({ topic: topicToSlug(topic) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic: slug } = await params
  const topic = slugToTopic(slug)
  if (!topic) return {}
  // Same string the page renders in its standfirst — see lib/metadata.
  return pageMetadata({
    title: topic,
    description: TOPIC_DESCRIPTIONS[topic],
    path: `/topics/${slug}`,
  })
}

export default async function TopicPage({ params }: Props) {
  const { topic: slug } = await params
  const topic = slugToTopic(slug)
  if (!topic) notFound()

  const articles = await getArticlesByTopic(topic)

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-14">
      <PageHeader
        back={{ href: '/topics', label: 'All fields' }}
        eyebrow="Field"
        title={topic}
        icon={<TopicGlyph topic={topic} size={34} />}
        description={TOPIC_DESCRIPTIONS[topic]}
        meta={`${articles.length} ${articles.length === 1 ? 'article' : 'articles'} · ${articles.reduce((n, a) => n + a.widgets, 0)} widgets`}
        accent={topicVar(topic)}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map(a => (
          <ArticleCard key={a.slug} article={a} />
        ))}
      </div>
    </div>
  )
}
