import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getArticlesByTopic } from '@/lib/articles'
import { TOPICS, TOPIC_DESCRIPTIONS, topicToSlug, slugToTopic } from '@/lib/topics'
import { ArticleCard } from '@/components/ArticleCard'

type Props = { params: Promise<{ topic: string }> }

export async function generateStaticParams() {
  return TOPICS.map(topic => ({ topic: topicToSlug(topic) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic: slug } = await params
  const topic = slugToTopic(slug)
  if (!topic) return {}
  return {
    title: `${topic} — Scimotion`,
    description: TOPIC_DESCRIPTIONS[topic],
  }
}

export default async function TopicPage({ params }: Props) {
  const { topic: slug } = await params
  const topic = slugToTopic(slug)
  if (!topic) notFound()

  const articles = await getArticlesByTopic(topic)

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <Link href="/topics" className="text-xs text-text-muted hover:text-text-primary transition-colors">
        ← All fields
      </Link>
      <h1 className="text-2xl font-bold text-text-primary mt-3 mb-2">
        {topic}
      </h1>
      <p className="text-text-secondary text-sm leading-relaxed mb-1 max-w-[620px]">
        {TOPIC_DESCRIPTIONS[topic]}
      </p>
      <p className="text-text-muted text-xs mb-8">
        {articles.length} {articles.length === 1 ? 'article' : 'articles'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map(a => (
          <ArticleCard key={a.slug} article={a} />
        ))}
      </div>
    </div>
  )
}
