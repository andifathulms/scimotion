'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search as SearchIcon, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { ArticleCard } from './ArticleCard'
import type { ArticleMeta } from '@/lib/articles'

export function SearchClient({ articles }: { articles: ArticleMeta[] }) {
  const [query, setQuery] = useState('')

  const trimmed = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!trimmed) return articles
    const terms = trimmed.split(/\s+/)
    return articles.filter(a => {
      const haystack = `${a.title} ${a.subtitle} ${a.topic} ${a.description}`.toLowerCase()
      return terms.every(t => haystack.includes(t))
    })
  }, [articles, trimmed])

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        Search
      </h1>

      <div className="relative mb-8">
        <SearchIcon
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          placeholder="Search by title, topic, or keyword…"
          className="w-full pl-11 pr-11 py-3 rounded-pill bg-bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover transition-colors"
          aria-label="Search articles"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <p className="text-xs text-text-muted uppercase tracking-wider mb-6">
        {trimmed
          ? `${results.length} ${results.length === 1 ? 'result' : 'results'} for “${query.trim()}”`
          : `${articles.length} articles`}
      </p>

      {results.length === 0 ? (
        <p className="text-text-secondary text-center py-16">
          No articles match that search. Try a broader term or browse all articles on the{' '}
          <Link href="/" className="text-accent-gold hover:underline">homepage</Link>.
        </p>
      ) : (
        <motion.div
          key={trimmed}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {results.map(a => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </motion.div>
      )}
    </div>
  )
}
