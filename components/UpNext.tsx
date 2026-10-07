'use client'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, GraduationCap, Route } from 'lucide-react'
import { useProgress } from '@/hooks/useProgress'
import { TopicBadge } from './TopicBadge'
import type { Topic } from '@/lib/topics'

type Step = { slug: string; title: string }
type Next = { slug: string; title: string; description: string; topic: Topic; readTime: number }

// The client half of PathNav: the parts that depend on this reader — how far
// along the path they are, and how the quiz they just took went.
export function UpNext({
  pathSlug,
  pathTitle,
  index,
  steps,
  prev,
  next,
  slug,
}: {
  pathSlug: string
  pathTitle: string
  index: number
  steps: Step[]
  prev: Step | null
  next: Next | null
  slug: string
}) {
  const { read, quiz } = useProgress()
  const score = quiz[slug]
  const readCount = steps.filter(s => read[s.slug] || s.slug === slug).length

  return (
    <section aria-labelledby="up-next-heading" className="my-12 overflow-hidden rounded-[18px] border border-border-hover bg-bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <Link
          href={`/learn/${pathSlug}`}
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-text-muted transition-colors hover:text-accent-gold"
        >
          <Route size={13} aria-hidden="true" />
          {pathTitle} · Part {index + 1} of {steps.length}
        </Link>
        {score && (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-text-secondary">
            <GraduationCap size={13} className="text-accent-gold" aria-hidden="true" />
            Quiz {score[0]}/{score[1]}
          </span>
        )}
      </div>

      {/* The route, with this article lit. */}
      <div aria-hidden="true" className="flex items-center px-5 pt-5">
        {steps.map((s, i) => {
          const done = !!read[s.slug] || s.slug === slug
          return (
            <span key={s.slug} className="contents">
              {i > 0 && <span className={`h-[3px] flex-1 ${done ? 'bg-accent-gold' : 'bg-bg-raised'}`} />}
              <span
                className={`size-[10px] shrink-0 rounded-full border-2 ${
                  s.slug === slug
                    ? 'border-accent-gold bg-accent-gold shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent-gold)_25%,transparent)]'
                    : done
                      ? 'border-accent-gold bg-accent-gold'
                      : 'border-bg-raised bg-bg-surface'
                }`}
              />
            </span>
          )
        })}
      </div>
      <p className="px-5 pt-2 font-mono text-xs text-text-muted">{readCount} of {steps.length} read</p>

      {next ? (
        <Link href={`/articles/${next.slug}`} className="group m-5 mt-4 block rounded-card border border-border bg-bg-hover/50 p-5 transition-colors hover:border-accent-gold/50">
          <span id="up-next-heading" className="font-mono text-xs uppercase tracking-[0.12em] text-accent-gold">Up next</span>
          <span className="mt-2 flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block font-display text-2xl font-bold leading-tight text-text-primary transition-colors group-hover:text-accent-gold">
                {next.title}
              </span>
              <span className="mt-2 block text-sm text-text-secondary">{next.description}</span>
              <span className="mt-3 flex flex-wrap items-center gap-2">
                <TopicBadge topic={next.topic} />
                <span className="font-mono text-xs text-text-muted">{next.readTime} min</span>
              </span>
            </span>
            <span className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-gold text-on-accent transition-transform motion-safe:group-hover:translate-x-0.5">
              <ArrowRight size={18} aria-hidden="true" />
            </span>
          </span>
        </Link>
      ) : (
        <div className="m-5 mt-4 rounded-card border border-border bg-bg-hover/50 p-5">
          <p id="up-next-heading" className="font-display text-xl font-bold text-text-primary">You&apos;ve reached the end of {pathTitle}.</p>
          <Link href="/learn" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-gold hover:underline">
            Pick another path <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}

      {prev && (
        <Link
          href={`/articles/${prev.slug}`}
          className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span className="text-text-muted">Previous:</span>
          <span className="truncate">{prev.title}</span>
        </Link>
      )}
    </section>
  )
}
