'use client'
import { useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { ArticleCard } from './ArticleCard'
import type { ArticleMeta } from '@/lib/articles'

type Topic = 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'
const TOPICS: Topic[] = ['Mathematics', 'Physics', 'Computer Science', 'Medicine']

const gridVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

export function HomepageGrid({ articles }: { articles: ArticleMeta[] }) {
  const [filter, setFilter] = useState<Topic | 'All'>('All')

  const filtered = filter === 'All' ? articles : articles.filter(a => a.topic === filter)
  const featured = filtered.find(a => a.featured)
  const rest = filtered.filter(a => !a.featured)
  const firstTwo = rest.slice(0, 2)
  const remaining = rest.slice(2)

  return (
    <div>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {(['All', ...TOPICS] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
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
            {remaining.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {remaining.map(a => (
                  <motion.div key={a.slug} variants={cardVariants}>
                    <ArticleCard article={a} />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
