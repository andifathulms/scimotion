import Link from 'next/link'
import type { ReactNode } from 'react'

// The opening of every index route — Learn, Topics, Tags, a single field, path
// or tag. Each used to hand-roll the same h1/p pair at slightly different sizes;
// this fixes the eyebrow, the display headline and the measure in one place.
//
// `accent` is a CSS colour (usually topicVar(...)). It tints a soft glow behind
// the heading so a field or path page carries its colour from the first pixel.
export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  back,
  accent,
  icon,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  back?: { href: string; label: string }
  accent?: string
  icon?: ReactNode
}) {
  return (
    <header
      className="page-header relative mb-10 pb-2"
      style={accent ? ({ '--t': accent } as React.CSSProperties) : undefined}
      data-accent={accent ? '' : undefined}
    >
      {back && (
        <Link
          href={back.href}
          className="mb-5 inline-flex items-center gap-1.5 font-mono text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          <span aria-hidden="true">←</span> {back.label}
        </Link>
      )}
      {eyebrow && (
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-(--t,var(--color-accent-gold))">{eyebrow}</p>
      )}
      <h1 className="flex items-center gap-3 font-display text-4xl font-bold text-text-primary sm:text-5xl">
        {icon && <span className="text-(--t)">{icon}</span>}
        {title}
      </h1>
      {description && <p className="mt-4 max-w-[640px] text-lg text-text-secondary">{description}</p>}
      {meta && <p className="mt-4 font-mono text-xs text-text-muted">{meta}</p>}
    </header>
  )
}
