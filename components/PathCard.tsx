'use client'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { useProgress } from '@/hooks/useProgress'

export type PathStep = { slug: string; title: string; readTime: number }

// Progress comes from the reader's own visits (hooks/useProgress). The server
// render is the not-started state, so the static HTML is the same for everyone
// and hydration fills in ticks, the lit route and a "Continue" target.

// How many steps a card lists. The old card listed every title — up to twenty —
// so the grid was a wall of text with ragged heights, and nothing on it said
// where to start. Four is enough to show the shape of the path; the path page
// has the rest.
const PREVIEW = 4

const hours = (min: number) => (min < 90 ? `${Math.round(min / 5) * 5} min` : `~${Math.round(min / 60)} h`)

export function PathCard({
  slug,
  title,
  description,
  accent,
  steps,
}: {
  slug: string
  title: string
  description: string
  accent: string
  steps: PathStep[]
}) {
  const { read } = useProgress()
  const minutes = steps.reduce((n, s) => n + s.readTime, 0)
  const readCount = steps.filter(s => read[s.slug]).length
  const complete = readCount === steps.length && steps.length > 0
  // The next stop is the first unread one; a finished path points back to the
  // start for a re-read.
  const currentIndex = complete ? 0 : Math.max(0, steps.findIndex(s => !read[s.slug]))
  const current = steps[currentIndex]
  // Show the window around where the reader is, with one finished step for
  // context, rather than always the first four.
  const from = Math.min(Math.max(0, currentIndex - 1), Math.max(0, steps.length - PREVIEW))
  const preview = steps.slice(from, from + PREVIEW)
  const more = steps.length - preview.length
  const verb = complete ? 'Read again' : readCount > 0 ? 'Continue' : 'Start'

  return (
    <article
      style={{ '--t': accent } as React.CSSProperties}
      className="path-card relative flex flex-col gap-5 overflow-hidden rounded-[1.125rem] border border-border bg-bg-surface p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-[1.375rem] font-bold leading-tight text-text-primary">
          <Link href={`/learn/${slug}`} className="transition-colors hover:text-(--t)">
            {title}
          </Link>
        </h2>
        <span className="mt-1.5 shrink-0 font-mono text-xs text-text-muted">
          {steps.length} parts · {hours(minutes)}
        </span>
      </div>
      <p className="-mt-2 text-sm text-text-secondary">{description}</p>

      {/* The route as a line of stops: its length is the information, and the
          lit part is how far along the reader is. */}
      <div>
        <div aria-hidden="true" className="flex items-center">
          {steps.map((s, i) => {
            const done = !!read[s.slug]
            return (
              <span key={s.slug} className="contents">
                {i > 0 && <span className={`h-[3px] flex-1 ${done && read[steps[i - 1].slug] ? 'bg-(--t)' : 'bg-bg-raised'}`} />}
                <span
                  className={`size-[11px] shrink-0 rounded-full border-2 ${
                    done
                      ? 'border-(--t) bg-(--t)'
                      : i === currentIndex
                        ? 'border-(--t) bg-bg-surface shadow-[0_0_0_4px_color-mix(in_srgb,var(--t)_22%,transparent)]'
                        : 'border-bg-raised bg-bg-surface'
                  }`}
                />
              </span>
            )
          })}
        </div>
        <p className="mt-2.5 flex justify-between font-mono text-xs text-text-muted">
          <span>{complete ? 'Path complete' : readCount > 0 ? `${readCount} of ${steps.length} read` : 'Not started'}</span>
          <span>{Math.round((readCount / Math.max(1, steps.length)) * 100)}%</span>
        </p>
      </div>

      <ol className="flex flex-col">
        {preview.map(s => {
          const i = steps.indexOf(s)
          const done = !!read[s.slug]
          const isCurrent = i === currentIndex
          return (
            <li key={s.slug} className="border-t border-border first:border-t-0">
              <Link
                href={`/articles/${s.slug}`}
                className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-sm transition-colors hover:text-text-primary ${
                  isCurrent ? 'font-medium text-text-primary' : done ? 'text-text-muted' : 'text-text-secondary'
                }`}
              >
                <span className={`text-center font-mono text-xs ${isCurrent || done ? 'text-(--t)' : 'text-text-muted'}`}>{i + 1}</span>
                <span className="truncate">{s.title}</span>
                {done ? (
                  <Check size={13} strokeWidth={2.5} className="text-(--t)" aria-label="Read" />
                ) : (
                  <span className="font-mono text-xs text-text-muted">{s.readTime} min</span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        {current && (
          <Link
            href={`/articles/${current.slug}`}
            className="inline-flex max-w-full items-center gap-2 rounded-control bg-(--t) px-4 py-2.5 text-sm font-semibold text-bg-base transition-[filter] hover:brightness-110"
          >
            <span className="truncate">{verb} · {current.title.split(":")[0]}</span>
            <ArrowRight size={15} aria-hidden="true" className="shrink-0" />
          </Link>
        )}
        {more > 0 && (
          <Link href={`/learn/${slug}`} className="font-mono text-xs text-text-muted transition-colors hover:text-text-primary">
            +{more} more in this path →
          </Link>
        )}
      </div>
    </article>
  )
}
