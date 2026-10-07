import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export type PathStep = { slug: string; title: string; readTime: number }

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
  const minutes = steps.reduce((n, s) => n + s.readTime, 0)
  const first = steps[0]
  const preview = steps.slice(0, PREVIEW)
  const more = steps.length - preview.length

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

      {/* The route as a line of stops: its length is the information. */}
      <div aria-hidden="true" className="flex items-center">
        {steps.map((s, i) => (
          <span key={s.slug} className="contents">
            {i > 0 && <span className="h-[3px] flex-1 bg-bg-raised" />}
            <span
              className={`size-[11px] shrink-0 rounded-full border-2 ${
                i === 0
                  ? 'border-(--t) bg-bg-surface shadow-[0_0_0_4px_color-mix(in_srgb,var(--t)_22%,transparent)]'
                  : 'border-bg-raised bg-bg-surface'
              }`}
            />
          </span>
        ))}
      </div>

      <ol className="flex flex-col">
        {preview.map((s, i) => (
          <li key={s.slug} className="border-t border-border first:border-t-0">
            <Link
              href={`/articles/${s.slug}`}
              className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-sm transition-colors hover:text-text-primary ${
                i === 0 ? 'font-medium text-text-primary' : 'text-text-secondary'
              }`}
            >
              <span className={`text-center font-mono text-xs ${i === 0 ? 'text-(--t)' : 'text-text-muted'}`}>{i + 1}</span>
              <span className="truncate">{s.title}</span>
              <span className="font-mono text-xs text-text-muted">{s.readTime} min</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        {first && (
          <Link
            href={`/articles/${first.slug}`}
            className="inline-flex max-w-full items-center gap-2 rounded-control bg-(--t) px-4 py-2.5 text-sm font-semibold text-bg-base transition-[filter] hover:brightness-110"
          >
            <span className="truncate">Start · {first.title.split(":")[0]}</span>
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
