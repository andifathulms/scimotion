'use client'
import { useMemo, useState } from 'react'
import { ArticleCard } from './ArticleCard'
import { TopicGlyph } from './TopicGlyph'
import type { ArticleMeta } from '@/lib/articles'
import { TOPICS, topicVar, type Topic } from '@/lib/topics'

// Every article used to render at once — 171 cards, each inlining a full SVG
// visual, for 929 KB of HTML before a visitor had filtered anything. A page of
// 24 covers well past the first scroll and cuts that by roughly 80%; the rest
// mount on demand. Articles stay crawlable through the sitemap and the topic
// and tag indexes.
const PAGE_SIZE = 24

// The card entrance is a CSS animation (`.card-rise`), staggered by an inline
// delay. It used to be a Framer variant whose initial state was opacity:0 — in
// the server-rendered HTML too, so the whole grid was invisible until hydration.
// Capped so the 24th card does not arrive a second after the first.
const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 8) * 30}ms` })

export function HomepageGrid({ articles }: { articles: ArticleMeta[] }) {
  const [filter, setFilter] = useState<Topic | 'All'>('All')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const counts = useMemo(() => {
    const m = new Map<Topic, number>()
    for (const a of articles) m.set(a.topic, (m.get(a.topic) ?? 0) + 1)
    return m
  }, [articles])

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

  // The featured card is part of the page, not extra to it.
  const leadCount = featured ? 1 : 0
  const restVisible = rest.slice(0, Math.max(0, visible - leadCount))
  const shown = leadCount + restVisible.length
  const hasMore = shown < filtered.length

  return (
    <section aria-labelledby="explore-heading">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <h2 id="explore-heading" className="font-display text-3xl font-bold text-text-primary">
            Explore the library
          </h2>
          <p className="mt-2 max-w-[600px] text-base text-text-secondary">
            Each explainer is written prose with interactive widgets built into
            it. Pick a field, or just start scrolling.
          </p>
        </div>
        {/* Always present: the count is the answer to "how much is here". */}
        <p className="font-mono text-xs text-text-muted" aria-live="polite">
          Showing {shown} of {filtered.length}
          {filter === 'All' ? '' : ` in ${filter}`}
        </p>
      </header>

      {/* Filter rail.
       *
       * One row at every width, scrolling sideways when it overflows: ten
       * wrapping pills used to cost two rows on desktop and three on a phone.
       * It sticks under the navbar while the grid scrolls, so changing field
       * never means scrolling back up. The negative margin lets it bleed to the
       * screen edge inside the page gutter, so a half-visible chip at the edge
       * signals there is more to scroll. */}
      <div className="sticky top-14 z-20 -mx-5 mb-6 border-b border-border bg-bg-base/85 px-5 py-3 backdrop-blur-md">
        <div
          role="group"
          aria-label="Filter by field"
          className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(['All', ...TOPICS] as const).map(t => {
            const active = filter === t
            const count = t === 'All' ? articles.length : counts.get(t) ?? 0
            return (
              <button
                key={t}
                onClick={() => selectFilter(t)}
                aria-pressed={active}
                style={t === 'All' ? undefined : ({ '--t': topicVar(t) } as React.CSSProperties)}
                className={`flex shrink-0 items-center gap-2 rounded-control border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-text-primary bg-text-primary text-bg-base'
                    : 'border-border bg-bg-surface text-text-secondary hover:border-border-hover hover:text-text-primary'
                }`}
              >
                {t !== 'All' && (
                  <span className={active ? '' : 'text-(--t)'}>
                    <TopicGlyph topic={t} size={13} />
                  </span>
                )}
                {t}
                <span className={`font-mono text-[0.6875rem] ${active ? 'opacity-60' : 'text-text-muted'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-text-muted">No articles yet in this topic. Check back soon.</p>
      ) : (
        // Keyed on the filter so a new field remounts and replays the entrance.
        <div key={filter} className="space-y-4">
          {featured && (
            <div className="card-rise">
              <ArticleCard article={featured} featured />
            </div>
          )}
          {restVisible.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {restVisible.map((a, i) => (
                <div key={a.slug} className="card-rise" style={stagger(i + leadCount)}>
                  <ArticleCard article={a} />
                </div>
              ))}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-6">
              <button
                onClick={() => setVisible(v => v + PAGE_SIZE)}
                className="rounded-control border border-border-hover bg-bg-surface px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover"
              >
                Load {Math.min(PAGE_SIZE, filtered.length - shown)} more
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
