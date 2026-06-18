'use client'
import { useState } from 'react'
import { ArticleCard } from './ArticleCard'
import type { ArticleMeta } from '@/lib/articles'

type Topic = 'Mathematics' | 'Physics' | 'Computer Science' | 'Medicine'
const TOPICS: Topic[] = ['Mathematics', 'Physics', 'Computer Science', 'Medicine']

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
      <div className="flex flex-wrap gap-2 mb-8" id="topics">
        {(['All', ...TOPICS] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filter === t
                ? 'bg-accent-blue border-accent-blue text-white'
                : 'border-border text-text-secondary hover:border-border-hover hover:text-text-primary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-text-muted text-center py-16">No articles yet in this topic — check back soon.</p>
      )}

      {/* Magazine grid */}
      <div className="space-y-4">
        {featured && (
          <div>
            <ArticleCard article={featured} featured />
          </div>
        )}
        {firstTwo.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {firstTwo.map(a => <ArticleCard key={a.slug} article={a} />)}
          </div>
        )}
        {remaining.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {remaining.map(a => <ArticleCard key={a.slug} article={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}
