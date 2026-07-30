import { ChevronDown } from 'lucide-react'
import type { Heading } from '@/lib/toc'

// Collapsed table of contents for viewports below `xl`, where the sticky rail in
// the article layout is hidden. Without it, every phone and tablet reader lost
// section navigation entirely on ten-minute, five-section articles.
//
// Built on native <details> rather than the client-side TableOfContents: this is
// a server component with no JS, so it works before hydration and cannot break
// it. Scroll-spy is the sticky rail's job — a collapsed list only needs to jump.
export function TocDisclosure({ headings }: { headings: Heading[] }) {
  // Same threshold as the desktop rail: under three headings there is nothing
  // worth navigating.
  if (headings.length < 3) return null

  return (
    <details className="group xl:hidden mb-10 rounded-xl border border-border bg-bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          On this page
        </span>
        <ChevronDown
          size={16}
          className="text-text-muted transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <nav aria-label="Table of contents" className="border-t border-border px-4 py-3">
        <ul className="space-y-2.5 text-sm">
          {headings.map(h => (
            <li key={h.slug} style={{ paddingLeft: h.depth === 3 ? 16 : 0 }}>
              <a
                href={`#${h.slug}`}
                className="block leading-snug text-text-secondary transition-colors hover:text-accent-gold"
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  )
}
