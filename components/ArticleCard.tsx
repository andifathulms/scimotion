'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { TopicBadge } from './TopicBadge'
import { ArticleVisual } from './ArticleVisual'
import type { ArticleMeta } from '@/lib/articles'

export function ArticleCard({ article, featured = false }: { article: ArticleMeta; featured?: boolean }) {
  const thumbHeight = featured ? 200 : 120
  return (
    // Every grid this card sits in stretches its items, but the height stopped
    // at this wrapper: the Link and the card below it sized to their content, so
    // a row of cards ended up with ragged bottoms wherever a title wrapped to a
    // second line or the badges wrapped to a second row. The full-height chain
    // plus `mt-auto` on the meta row keeps the card filling its row and the
    // dateline pinned to the bottom edge.
    <motion.div
      className="h-full"
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
    <Link href={`/articles/${article.slug}`} className="block h-full group">
      <div className="flex h-full flex-col bg-bg-surface border border-border rounded-2xl overflow-hidden hover:border-border-hover hover:bg-bg-hover transition-colors duration-200">
        <div className="shrink-0 overflow-hidden" style={{ height: thumbHeight }}>
          <ArticleVisual slug={article.slug} topic={article.topic} />
        </div>
        <div className="flex flex-1 flex-col p-4">
          {/* flex-wrap matters: long topic names like "Earth & Climate" used to
              push the Interactive pill past the card's overflow-hidden edge and
              clip it mid-word. */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <TopicBadge topic={article.topic} />
            <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wider text-accent-gold border border-accent-gold/25 bg-accent-gold/10 px-2 py-0.5 rounded-full">
              Interactive
            </span>
          </div>
          {/* The title was unclamped, so a long one could run to three lines and
              blow past its neighbours. Clamped to two, with two lines reserved
              in em (which tracks whichever of the two sizes is in play) so a
              one-line title does not drag the summary up to meet it. */}
          <h3
            className={`font-semibold text-text-primary leading-snug mb-1.5 line-clamp-2 min-h-[2.75em] group-hover:text-accent-gold transition-colors ${featured ? 'text-xl' : 'text-sm'}`}
          >
            {article.title}
          </h3>
          <p className="text-xs text-text-secondary line-clamp-2 mb-3">{article.description}</p>
          <div className="mt-auto flex items-center gap-2 text-xs text-text-muted">
            <span>{article.readTime} min read</span>
            <span>·</span>
            <span>{new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </Link>
    </motion.div>
  )
}
