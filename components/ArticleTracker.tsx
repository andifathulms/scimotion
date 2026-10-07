'use client'
import { useEffect, useRef } from 'react'
import { markRead, markVisited } from '@/hooks/useProgress'

// Records the visit when an article opens, and marks it read once the reader
// reaches the end of the prose — this sentinel sits after the body, before the
// quiz. Reaching it means the text has been scrolled through; it is the same
// signal a reader would give by hand, without asking them to.
//
// A scroll check rather than an IntersectionObserver: a reader who jumps to the
// end (End key, a TOC link to the last section, the up-next card) can carry the
// sentinel from below the viewport to above it in one step, and an observer
// never reports an element that was not intersecting on either side of the jump.
// "Top edge above the bottom of the viewport" covers both cases.
export function ArticleTracker({ slug }: { slug: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    markVisited(slug)
    let frame = 0
    const check = () => {
      frame = 0
      const el = ref.current
      if (el && el.getBoundingClientRect().top < window.innerHeight) {
        markRead(slug)
        window.removeEventListener('scroll', schedule)
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    check()
    return () => {
      window.removeEventListener('scroll', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [slug])

  return <div ref={ref} aria-hidden="true" />
}
