import Link from 'next/link'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/metadata'
import { getAllArticles, getTopicCounts } from '@/lib/articles'
import { learningPaths } from '@/lib/paths'
import { TOPIC_DESCRIPTIONS, topicToSlug } from '@/lib/topics'
import { TopicBadge } from '@/components/TopicBadge'

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description:
    'Scimotion explains science through motion and interaction — every concept built from first principles, then handed to you with the controls.',
  path: '/about',
})

export default async function AboutPage() {
  const [articles, counts] = await Promise.all([getAllArticles(), getTopicCounts()])
  const articleCount = articles.length
  const fieldCount = counts.filter(t => t.count > 0).length
  const pathCount = learningPaths.length

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-3xl font-bold text-text-primary mb-8">
        About Scimotion
      </h1>
      {/* The page frame matches the other nav routes; the prose keeps its own
          measure. At the full 1100px these paragraphs would run to roughly 110
          characters a line, well outside the 45-75 band the rest of the site
          sets its body copy to. */}
      <div className="max-w-[680px]">
      <p className="text-text-secondary text-base leading-relaxed mb-6">
        Science is often taught as a set of facts to memorize. Scimotion exists to change that — every concept here is explained the way it actually works: through motion, interaction, and visual intuition.
      </p>
      <p className="text-text-secondary text-base leading-relaxed mb-6">
        Each article builds from first principles, then hands you the controls. Drag a slider. Watch the pattern change. Push a parameter until the model breaks. That&apos;s when you actually understand.
      </p>
      <p className="text-text-secondary text-base leading-relaxed mb-12">
        There are{' '}
        <strong className="text-text-primary font-semibold">{articleCount} articles</strong> across{' '}
        <strong className="text-text-primary font-semibold">{fieldCount} fields</strong>, each with two hand-built
        interactive widgets, and{' '}
        <Link href="/learn" className="text-accent-gold hover:underline">{pathCount} learning paths</Link>{' '}
        that thread them into ordered sequences.
      </p>
      </div>

      <h2 className="text-xl font-semibold text-text-primary mb-6">What we cover</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {counts.map(({ topic, count }) => (
          <Link
            key={topic}
            href={`/topics/${topicToSlug(topic)}`}
            className="group block bg-bg-surface border border-border rounded-card p-5 hover:border-border-hover hover:bg-bg-hover transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <TopicBadge topic={topic} />
              <span className="text-xs text-text-muted">{count}</span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">{TOPIC_DESCRIPTIONS[topic]}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 max-w-[680px]">
        <Link
          href="/"
          className="flex-1 text-center py-3 rounded-pill bg-accent-gold text-on-accent font-medium hover:bg-accent-gold/90 transition-colors"
        >
          Start reading →
        </Link>
        <Link
          href="/learn"
          className="flex-1 text-center py-3 rounded-pill border border-border text-text-secondary font-medium hover:border-border-hover hover:text-text-primary transition-colors"
        >
          Follow a path
        </Link>
      </div>
    </div>
  )
}
