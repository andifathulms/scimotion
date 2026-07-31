'use client'
import { useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { ArticleCard } from './ArticleCard'
import type { ArticleMeta } from '@/lib/articles'
import { TOPICS, type Topic } from '@/lib/topics'

// Every article used to render at once — 171 cards, each inlining a full SVG
// visual, for 929 KB of HTML before a visitor had filtered anything. A page of
// 24 covers well past the first scroll and cuts that by roughly 80%; the rest
// mount on demand. Articles stay crawlable through the sitemap and the topic
// and tag indexes.
const PAGE_SIZE = 24

const gridVariants: Variants = {
  // 0.07 was fine when nothing past the third row was ever looked at. Against a
  // bounded page it is the difference between the last card arriving at 1.7s and
  // at 0.7s, so the stagger reads as one motion rather than a queue.
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function HomepageGrid({ articles }: { articles: ArticleMeta[] }) {
  const [filter, setFilter] = useState<Topic | 'All'>('All')
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Switching topics starts a new list, so the page count has to start over too
  // — otherwise picking a topic after several "Load more" presses would dump
  // every article in it at once.
  const selectFilter = (topic: Topic | 'All') => {
    setFilter(topic)
    setVisible(PAGE_SIZE)
  }

  const filtered = filter === 'All' ? articles : articles.filter(a => a.topic === filter)
  const featured = filtered.find(a => a.featured)
  const rest = filtered.filter(a => !a.featured)
  const firstTwo = rest.slice(0, 2)
  const remaining = rest.slice(2)

  // The featured card and the two-up row are part of the page, not extra to it.
  const leadCount = (featured ? 1 : 0) + firstTwo.length
  const remainingVisible = remaining.slice(0, Math.max(0, visible - leadCount))
  const shown = leadCount + remainingVisible.length
  const hasMore = shown < filtered.length

  return (
    <div>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {(['All', ...TOPICS] as const).map(t => (
          <button
            key={t}
            onClick={() => selectFilter(t)}
            className={`relative px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filter === t
                ? 'bg-accent-gold border-accent-gold text-bg-base'
                : 'border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {filtered.length === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-text-muted text-center py-16"
          >
            No articles yet in this topic — check back soon.
          </motion.p>
        ) : (
          <motion.div
            key={filter}
            className="space-y-4"
            variants={gridVariants}
            initial="hidden"
            animate="visible"
          >
            {featured && (
              <motion.div variants={cardVariants}>
                <ArticleCard article={featured} featured />
              </motion.div>
            )}
            {firstTwo.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {firstTwo.map(a => (
                  <motion.div key={a.slug} variants={cardVariants}>
                    <ArticleCard article={a} />
                  </motion.div>
                ))}
              </div>
            )}
            {remainingVisible.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {remainingVisible.map(a => (
                  <motion.div key={a.slug} variants={cardVariants}>
                    <ArticleCard article={a} />
                  </motion.div>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="flex flex-col items-center gap-3 pt-6">
                <p className="text-xs text-text-muted" aria-live="polite">
                  Showing {shown} of {filtered.length} articles
                </p>
                <button
                  onClick={() => setVisible(v => v + PAGE_SIZE)}
                  className="px-5 py-2 rounded-full border border-border text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
                >
                  Load more
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
