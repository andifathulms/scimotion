'use client'
import { useEffect, useState } from 'react'
import type { Heading } from '@/lib/toc'

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string>('')

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

  if (headings.length < 3) return null

  return (
    <nav aria-label="Table of contents" className="text-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-3">On this page</p>
      <ul className="space-y-2 border-l border-border">
        {headings.map(h => (
          <li key={h.slug} style={{ paddingLeft: h.depth === 3 ? 20 : 10 }}>
            <a
              href={`#${h.slug}`}
              className={`block -ml-px border-l-2 pl-3 leading-snug transition-colors ${
                active === h.slug
                  ? 'border-accent-gold text-accent-gold'
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
