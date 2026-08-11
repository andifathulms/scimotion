'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search as SearchIcon, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { ArticleCard } from './ArticleCard'
import type { ArticleMeta } from '@/lib/articles'

// The homepage learned this in 9c3bb6d: rendering every article at once meant
// every article's inline hero SVG went into the HTML. Search never got the same
// treatment, so an empty query — the state the page loads in — shipped all 171
// cards and 570 KB of SVG for results nobody had asked for. Same page size as
// the homepage, for the same reason.
const PAGE_SIZE = 24

export function SearchClient({ articles }: { articles: ArticleMeta[] }) {
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  // A new query is a new list, so the page count restarts with it — otherwise
  // typing after several "Show more" presses would dump the whole match set.
  const onQuery = (v: string) => {
    setQuery(v)
    setVisible(PAGE_SIZE)
  }

  const trimmed = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!trimmed) return articles
    const terms = trimmed.split(/\s+/)
    return articles.filter(a => {
      const haystack = `${a.title} ${a.subtitle} ${a.topic} ${a.description}`.toLowerCase()
      return terms.every(t => haystack.includes(t))
    })
  }, [articles, trimmed])

  const shown = results.slice(0, visible)

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-12">
      <h1 className="text-3xl font-bold text-text-primary mb-6">
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
          onChange={e => onQuery(e.target.value)}
          autoFocus
          placeholder="Search by title, topic, or keyword…"
          className="w-full pl-11 pr-11 py-3 rounded-pill bg-bg-surface border border-border text-text-primary placeholder:text-text-muted focus:border-border-hover transition-colors"
          aria-label="Search articles"
        />
        {query && (
          <button
            onClick={() => onQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <p className="text-xs text-text-muted uppercase tracking-wider mb-6" aria-live="polite">
        {trimmed
          ? `Showing ${shown.length} of ${results.length} ${results.length === 1 ? 'result' : 'results'} for “${query.trim()}”`
          : `Showing ${shown.length} of ${articles.length} articles`}
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
          {shown.map(a => (
            <ArticleCard key={a.slug} article={a} />
          ))}
        </motion.div>
      )}

      {shown.length < results.length && (
        <div className="flex justify-center pt-6">
          <button
            onClick={() => setVisible(v => v + PAGE_SIZE)}
            className="px-5 py-2 rounded-pill border border-border text-sm font-medium text-text-secondary hover:border-border-hover hover:text-text-primary transition-colors"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
