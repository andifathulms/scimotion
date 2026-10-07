'use client'
import { useEffect, useState } from 'react'
import type { Heading } from '@/lib/toc'

// The rail shows where the reader is, not just what exists: sections above the
// current one are marked as read, the current one is lit, and the footer says
// how far through the article they are and roughly how long is left. Minutes
// left are the article's read time scaled by scroll position — an estimate, and
// labelled as one by the "~".
export function TableOfContents({ headings, readTime }: { headings: Heading[]; readTime: number }) {
  const [active, setActive] = useState<string>('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const els = headings
      .map(h => document.getElementById(h.slug))
      .filter((el): el is HTMLElement => el !== null)

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          // pick the topmost currently-visible heading
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          )
          setActive(top.target.id)
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )

    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const total = scrollHeight - clientHeight
      setProgress(total > 0 ? Math.min(1, scrollTop / total) : 0)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  if (headings.length < 3) return null

  const activeIndex = headings.findIndex(h => h.slug === active)
  const left = Math.max(0, Math.round(readTime * (1 - progress)))

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-text-muted">On this page</p>
      <ul className="flex flex-col">
        {headings.map((h, i) => {
          const state = i === activeIndex ? 'current' : i < activeIndex ? 'read' : 'ahead'
          return (
            <li key={h.slug}>
              <a
                href={`#${h.slug}`}
                aria-current={state === 'current' ? 'location' : undefined}
                style={{ paddingLeft: h.depth === 3 ? 26 : 14 }}
                className={`block border-l-2 py-1.5 leading-snug transition-colors ${
                  state === 'current'
                    ? 'border-accent-gold font-medium text-text-primary'
                    : state === 'read'
                      ? 'border-accent-gold/40 text-text-secondary hover:text-text-primary'
                      : 'border-border text-text-muted hover:text-text-secondary'
                }`}
              >
                {h.text}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 font-mono text-xs text-text-muted" aria-hidden="true">
        {Math.round(progress * 100)}% · {left > 0 ? `~${left} min left` : 'done'}
      </p>
    </nav>
  )
}
