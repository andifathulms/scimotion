import Link from 'next/link'
import { ArrowRight, Search } from 'lucide-react'
import { HeroDemo } from './HeroDemo'

// The hero is the demo. The headline makes the promise on the left and the
// instrument on the right keeps it, already moving, in the same first screen —
// the pendulum used to sit below 450px of decorative constellation, and the
// headline above it shipped at opacity:0 until Framer Motion ran, so slow
// connections, no-JS readers and link unfurlers saw neither.
//
// This is a server component now. The entrance is CSS (`.hero-rise` in
// globals.css), which runs without JavaScript and is dropped entirely under a
// reduced-motion preference. Counts are read from the content directory by the
// page, so they cannot drift out of date.
export function Hero({
  articleCount,
  widgetCount,
  fieldCount,
  pathCount,
}: {
  articleCount: number
  widgetCount: number
  fieldCount: number
  pathCount: number
}) {
  const stats = [
    { value: articleCount, label: 'explainers' },
    { value: widgetCount, label: 'live widgets' },
    { value: fieldCount, label: 'fields' },
    { value: pathCount, label: 'learning paths' },
  ]

  return (
    <div className="hero relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:py-20">
      <div className="hero-rise relative z-10 min-w-0">
        <span className="inline-block font-mono text-xs uppercase tracking-[0.14em] text-accent-gold">
          Interactive science explainers
        </span>

        <h1 className="mt-5 font-display text-display font-bold text-text-primary">
          Science you can{' '}
          <span className="relative whitespace-nowrap text-accent-gold">
            play
            {/* A sine wave for an underline: the site's subject, at the size of
                a flourish. Decorative, so hidden from assistive tech. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 120 10"
              preserveAspectRatio="none"
              className="absolute inset-x-0 -bottom-[0.14em] h-[0.2em] w-full overflow-visible"
            >
              <path
                d="M0 5 Q 7.5 -1 15 5 T 30 5 T 45 5 T 60 5 T 75 5 T 90 5 T 105 5 T 120 5"
                stroke="currentColor"
                strokeWidth="2.4"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </span>{' '}
          with.
        </h1>

        <p className="mt-6 max-w-[34rem] text-lg text-text-secondary">
          Read the explanation, then grab the controls and watch the model
          respond: pendulums, Fourier transforms, Bayes&apos; theorem, black
          holes. Every article ships with hand-built widgets you can break on
          purpose.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {/* next/link, not a raw anchor: basePath is only applied by next/link,
              so a bare href="/learn" would point at the domain root on the
              GitHub Pages subpath. "Browse all" is a same-page hash and is
              correct as a plain anchor. */}
          <Link
            href="/learn"
            className="inline-flex items-center gap-2 rounded-control bg-accent-gold px-5 py-3 text-sm font-semibold text-on-accent shadow-[0_10px_28px_-12px_var(--color-accent-gold)] transition-[filter,transform] duration-200 hover:brightness-110 motion-safe:active:scale-[0.98]"
          >
            Start a learning path
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <a
            href="#explore"
            className="inline-flex items-center gap-2 rounded-control border border-border-hover bg-bg-surface px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-hover"
          >
            Browse all {articleCount}
          </a>
          <Link
            href="/search"
            data-search-trigger
            className="hidden items-center gap-2 rounded-control px-3 py-3 text-sm text-text-secondary sm:inline-flex transition-colors hover:text-text-primary"
          >
            <Search size={15} aria-hidden="true" />
            Search
            <kbd className="rounded-[5px] border border-border bg-bg-hover px-1.5 py-0.5 font-mono text-[0.6875rem] text-text-muted">
              ⌘K
            </kbd>
          </Link>
        </div>

        {/* The scale of the library is the most persuasive fact the site has;
            it belongs above the fold. */}
        <ul
          aria-label="The library at a glance"
          className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-6"
        >
          {stats.map(({ value, label }) => (
            <li key={label} className="flex flex-col gap-1">
              <span className="font-display text-2xl font-bold tabular-nums text-text-primary">{value}</span>
              <span className="text-xs text-text-muted">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="hero-rise hero-rise-late relative z-10 min-w-0">
        <HeroDemo />
      </div>
    </div>
  )
}
