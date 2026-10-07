import Link from 'next/link'
import { Play } from 'lucide-react'
import { TopicBadge } from './TopicBadge'
import { ArticleVisual } from './ArticleVisual'
import { ReadMark } from './ReadMark'
import { topicVar } from '@/lib/topics'
import type { ArticleMeta } from '@/lib/articles'

// The field colour drives the card through a local --t: a tint over the
// thumbnail, the hover border and the glow under the lift. Every card used to
// share one grey and one shape, with the field visible only in a 12px pill.
//
// Hover is CSS, not a Framer spring: a 2px lift with no scale (scaling a card
// resamples its text and makes it shimmer), and none at all under
// prefers-reduced-motion. The border and glow still change there — those are
// what say "this is a link", and they do not move anything.
export function ArticleCard({ article, featured = false }: { article: ArticleMeta; featured?: boolean }) {
  const date = new Date(article.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    // Every grid this card sits in stretches its items; the full-height chain
    // plus `mt-auto` on the meta row keeps rows flush at the bottom edge.
    <Link
      href={`/articles/${article.slug}`}
      style={{ '--t': topicVar(article.topic) } as React.CSSProperties}
      className={`article-card group flex h-full overflow-hidden rounded-card border border-border bg-bg-surface ${
        featured ? 'flex-col md:flex-row' : 'flex-col'
      }`}
    >
      <div
        className={`article-card-thumb relative shrink-0 overflow-hidden [&>svg]:absolute [&>svg]:inset-0 [&>svg]:h-full ${
          featured
            ? 'h-[200px] border-b border-border md:h-auto md:min-h-[260px] md:flex-[1.15] md:border-b-0 md:border-r'
            : 'h-[132px] border-b border-border'
        }`}
      >
        <ArticleVisual slug={article.slug} topic={article.topic} />
        <span
          aria-hidden="true"
          className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2 py-1 font-mono text-[0.6875rem] text-[#F3EEE6] opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:translate-y-1 motion-safe:group-hover:translate-y-0"
        >
          <Play size={10} fill="currentColor" />
          {article.widgets} {article.widgets === 1 ? 'widget' : 'widgets'}
        </span>
      </div>

      <div className={`flex flex-1 flex-col gap-2 ${featured ? 'p-5 md:justify-center md:p-8' : 'p-4'}`}>
        {featured && (
          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-accent-gold">Featured</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <TopicBadge topic={article.topic} />
        </div>
        {/* Clamped to two lines, with two lines reserved in em so a one-line
            title does not drag the summary up to meet it. */}
        <h3
          className={`font-display font-semibold text-text-primary line-clamp-2 transition-colors group-hover:text-(--t) ${
            featured ? 'text-2xl md:text-3xl' : 'min-h-[2.6em] text-[1.0625rem] leading-[1.3] tracking-[-0.012em]'
          }`}
        >
          {article.title}
        </h3>
        {/* --text-sm is the floor for a line anyone is expected to read. */}
        <p className={`text-text-secondary ${featured ? 'line-clamp-3 text-base' : 'line-clamp-2 text-sm'}`}>
          {article.description}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 font-mono text-xs text-text-muted">
          <span>{article.readTime} min</span>
          <span aria-hidden="true">·</span>
          <span>{date}</span>
          <ReadMark slug={article.slug} className="ml-auto" />
        </div>
      </div>
    </Link>
  )
}
