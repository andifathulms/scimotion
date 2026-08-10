'use client'
import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { HeroCanvas } from './HeroCanvas'

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
}

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

// Reduced motion means no travel and no stagger — not a faster version of the
// same thing. Rendering the final state directly is the honest reading of the
// preference; a 24px rise is exactly the vestibular trigger it asks about.
const STILL: Variants = { hidden: { opacity: 1 }, visible: { opacity: 1 } }
const NO_STAGGER: Variants = { hidden: {}, visible: {} }

// Counts are read from the content directory by the page and passed in, rather
// than written here as prose. The old copy made an unverifiable claim ("hands
// you the controls") and named nothing; a first-time visitor had to click into
// an article to find out whether any of it was true. A real number and four
// named concepts do that work in the time it takes to read one line — and they
// cannot drift out of date, because adding an article updates them.
export function Hero({
  articleCount,
  fieldCount,
  pathCount,
}: {
  articleCount: number
  fieldCount: number
  pathCount: number
}) {
  const reduce = useReducedMotion()
  const c = reduce ? NO_STAGGER : container
  const i = reduce ? STILL : item

  const stats = [
    { value: articleCount, label: 'explainers' },
    { value: fieldCount, label: 'fields' },
    { value: pathCount, label: 'learning paths' },
  ]

  return (
    <div
      className="relative overflow-hidden flex items-center py-16 sm:py-24"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--color-accent-gold) 8%, transparent) 0%, transparent 65%)',
      }}
    >
      <HeroCanvas />
      <motion.div
        className="relative z-10 max-w-[680px]"
        variants={c}
        initial="hidden"
        animate="visible"
      >
        {/* Full-strength accent, not a 0.6 alpha of it. The faded version
            measured 3.9:1 — the least readable text on the landing view was the
            line whose job was to say what the site is. */}
        <motion.span
          variants={i}
          className="inline-block text-xs font-mono uppercase tracking-widest text-accent-gold mb-4"
        >
          Interactive science explainers
        </motion.span>

        <motion.h1
          variants={i}
          className="text-display font-bold text-balance text-text-primary mb-5"
        >
          Science you can{' '}
          <span
            style={{
              backgroundImage:
                'linear-gradient(90deg, var(--color-accent-gold), var(--color-accent-orange))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            play with.
          </span>
        </motion.h1>

        <motion.p
          variants={i}
          className="text-text-secondary text-lg mb-8 max-w-[560px]"
        >
          Read the explanation, then drag the sliders and watch the model
          respond — pendulums, Fourier transforms, Bayes&apos; theorem, black
          holes. Every article ships with two hand-built widgets you can break
          on purpose.
        </motion.p>

        <motion.div variants={i} className="flex flex-wrap items-center gap-3">
          <a
            href="#explore"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-pill bg-accent-gold text-on-accent text-sm font-semibold transition-opacity duration-200 hover:opacity-90"
          >
            Browse all {articleCount}
          </a>
          {/* next/link, not a raw anchor: basePath is only applied by next/link,
              so `href="/about"` shipped as-is and the deployed button pointed at
              the domain root instead of /scimotion/about. The "Browse all" link
              above is a same-page hash and is correct as a plain anchor. */}
          <Link
            href="/learn"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-pill border border-border text-text-secondary text-sm font-semibold hover:border-border-hover hover:text-text-primary transition-colors"
          >
            Follow a path
          </Link>
          <Link
            href="/about"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors sm:ml-2"
          >
            About →
          </Link>
        </motion.div>

        {/* The scale of the library was previously visible only on the About
            page, which a first-time visitor never opens, and inside the "load
            more" branch of the grid, 24 cards down. It is the most persuasive
            fact the site has; it belongs above the fold. */}
        <motion.ul
          variants={i}
          aria-label="The library at a glance"
          className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-3"
        >
          {stats.map(({ value, label }) => (
            <li key={label} className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-text-primary tabular-nums">
                {value}
              </span>
              <span className="text-sm text-text-secondary">{label}</span>
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </div>
  )
}
