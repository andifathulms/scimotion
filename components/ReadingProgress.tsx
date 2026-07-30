'use client'
import { useEffect, useRef } from 'react'

// Scroll position is written straight to the element rather than held in state.
// The previous version called setProgress on every scroll event, so reading an
// article meant a React render per scroll tick, and it animated `width`, which
// lands on layout. Coalescing into one rAF per frame and scaling on the
// compositor keeps the work off the main thread.
export function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0

    const paint = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      const total = scrollHeight - clientHeight
      el.style.transform = `scaleX(${total > 0 ? scrollTop / total : 0})`
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }

    // Paint once on mount: a reload restores scroll position without firing a
    // scroll event, which used to leave the bar empty mid-article.
    paint()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed top-0 left-0 z-50 h-[3px] w-full origin-left bg-accent-gold"
      style={{ transform: 'scaleX(0)' }}
    />
  )
}
