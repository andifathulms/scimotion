import Link from 'next/link'
import type { Metadata } from 'next'
import { getTopicCounts } from '@/lib/articles'
import { TOPIC_DESCRIPTIONS, topicToSlug } from '@/lib/topics'
import { TopicBadge } from '@/components/TopicBadge'

export const metadata: Metadata = {
  title: 'Topics — Scimotion',
  description: 'Browse interactive science articles by field — mathematics, physics, chemistry, biology, earth & climate, computer science and medicine.',
}

export default async function TopicsPage() {
  const counts = await getTopicCounts()

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-2xl font-bold text-text-primary mb-1" style={{ letterSpacing: '-0.3px' }}>
        Browse by field
      </h1>
      <p className="text-text-secondary text-sm mb-8">
        {counts.length} fields · {counts.reduce((n, t) => n + t.count, 0)} articles
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {counts.map(({ topic, count }) => (
          <Link
            key={topic}
            href={`/topics/${topicToSlug(topic)}`}
            className="group block bg-bg-surface border border-border rounded-2xl p-5 hover:border-border-hover hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <TopicBadge topic={topic} />
              <span className="text-xs text-text-muted">
                {count} {count === 1 ? 'article' : 'articles'}
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{TOPIC_DESCRIPTIONS[topic]}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
