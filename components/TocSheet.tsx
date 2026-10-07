'use client'
import { useEffect, useRef, useState } from 'react'
import { List } from 'lucide-react'
import type { Heading } from '@/lib/toc'

// Contents within thumb reach, below xl where the sticky rail is hidden. The
// disclosure at the top of the article covers the start; this covers the other
// nine minutes, as a floating pill that appears once the reader has scrolled
// into the body and opens the contents as a bottom sheet.
//
// The sheet is a native <dialog>, for the focus trap and Esc-to-close.
export function TocSheet({ headings }: { headings: Heading[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [progress, setProgress] = useState(0)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const total = scrollHeight - clientHeight
      setProgress(total > 0 ? Math.min(1, scrollTop / total) : 0)
      setShown(scrollTop > 600)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  if (headings.length < 3) return null

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        tabIndex={shown ? 0 : -1}
        aria-hidden={!shown}
        className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-pill border border-border-hover bg-bg-surface/90 px-4 py-2.5 text-sm font-medium text-text-primary shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md transition-[opacity,transform] duration-300 ${
          shown ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <List size={15} aria-hidden="true" />
        Contents
        <span className="font-mono text-xs text-text-muted">{Math.round(progress * 100)}%</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Table of contents"
        onClick={e => e.target === dialogRef.current && dialogRef.current?.close()}
        className="toc-sheet"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-pill bg-bg-raised" aria-hidden="true" />
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-text-muted">On this page</p>
        <nav>
          <ul className="flex flex-col">
            {headings.map(h => (
              <li key={h.slug} style={{ paddingLeft: h.depth === 3 ? 16 : 0 }}>
                <a
                  href={`#${h.slug}`}
                  onClick={() => dialogRef.current?.close()}
                  className="block border-b border-border py-3 text-[0.9375rem] text-text-secondary transition-colors hover:text-text-primary"
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </dialog>
    </div>
  )
}
