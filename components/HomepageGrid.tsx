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
    <section aria-labelledby="explore-heading">
      {/* The grid used to begin with the pill row and nothing else: ten
          unlabelled buttons were the first interactive thing on the page, with
          no heading saying what they filtered or what they sat above. The
          document also went straight from the hero's h1 to 171 links with no
          intervening heading. This header names the section, restates the
          interactivity promise once (rather than 171 times on the cards, which
          is what the per-card "Interactive" pill was doing before it was
          dropped for being uninformative), and puts the library's size in front
          of the visitor while they are deciding whether to keep scrolling. */}
      <header className="mb-6">
        <h2 id="explore-heading" className="text-2xl font-semibold text-text-primary">
          Browse all {articles.length} explainers
        </h2>
        <p className="mt-2 max-w-[600px] text-base text-text-secondary">
          Each one is a written explanation with two interactive widgets built
          into it. Pick a field, or just start scrolling.
        </p>
      </header>

      {/* Filter pills.
       *
       * Ten pills at roughly four per row is three wrapped rows on a 375px
       * viewport — around 120px of the first screen spent on a control, on top
       * of a hero that grew when the stat strip landed, before a single article
       * is visible. Below `sm` they become one horizontally scrollable row:
       * same buttons, same order, same behaviour, one row tall.
       *
       * The negative margin and matching padding let the row bleed to the screen
       * edges inside the page's px-5 gutter, so a half-visible pill at the right
       * edge signals there is more to scroll. The fade is pointer-events-none
       * and hidden from assistive tech; it sits over the strip, not in it. */}
      <div className="relative -mx-5 sm:mx-0">
        <div
          role="group"
          aria-label="Filter by field"
          className="flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {(['All', ...TOPICS] as const).map(t => (
            <button
              key={t}
              onClick={() => selectFilter(t)}
              aria-pressed={filter === t}
              className={`relative shrink-0 px-4 py-1.5 rounded-pill text-sm font-medium border transition-all ${
                filter === t
                  ? 'bg-accent-gold border-accent-gold text-on-accent'
                  : 'border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-base to-transparent sm:hidden"
        />
      </div>

      {/* Always present, not only once "load more" is reachable. The count is
          the answer to "how much is here", and it was previously withheld until
          the visitor had already scrolled past 24 cards to find out. */}
      <p className="mt-4 mb-8 text-sm text-text-muted" aria-live="polite">
        Showing {shown} of {filtered.length}
        {filter === 'All' ? '' : ` in ${filter}`}
      </p>

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
              <div className="flex justify-center pt-6">
                <button
                  onClick={() => setVisible(v => v + PAGE_SIZE)}
                  className="px-5 py-2 rounded-pill border border-border text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
                >
                  Load more
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
