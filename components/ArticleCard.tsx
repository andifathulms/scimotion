'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { TopicBadge } from './TopicBadge'
import { ArticleVisual } from './ArticleVisual'
import type { ArticleMeta } from '@/lib/articles'

export function ArticleCard({ article, featured = false }: { article: ArticleMeta; featured?: boolean }) {
  const thumbHeight = featured ? 200 : 120
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
    <Link href={`/articles/${article.slug}`} className="block group">
      <div className="bg-bg-surface border border-border rounded-2xl overflow-hidden hover:border-border-hover hover:bg-bg-hover transition-colors duration-200">
        <div className="overflow-hidden" style={{ height: thumbHeight }}>
          <ArticleVisual slug={article.slug} topic={article.topic} />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TopicBadge topic={article.topic} />
            <span className="text-xs font-medium uppercase tracking-wider text-accent-gold border border-accent-gold/25 bg-accent-gold/10 px-2 py-0.5 rounded-full">
              Interactive
            </span>
          </div>
          <h3 className={`font-semibold text-text-primary leading-snug mb-1.5 group-hover:text-accent-gold transition-colors ${featured ? 'text-xl' : 'text-sm'}`}>
            {article.title}
          </h3>
          <p className="text-xs text-text-secondary line-clamp-2 mb-3">{article.description}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted">
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
