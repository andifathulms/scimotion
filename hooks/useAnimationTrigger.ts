import { useEffect, useRef, useState } from 'react'

type Options = { threshold?: number; onTrigger?: (prefersReducedMotion: boolean) => void }

// Fires when the element scrolls into view. Accepts either a threshold number
// (legacy) or an options object. `onTrigger` runs inside the IntersectionObserver
// callback (an event, not render) and receives whether reduced motion is preferred.
//
// Also reports `visible`, which tracks the element in BOTH directions, unlike
// `triggered` which latches on first sight and never clears. Widgets gate their
// requestAnimationFrame loop on it: 263 widgets started a loop when scrolled
// into view and not one stopped when scrolled out, so after passing the two
// widgets on an article a reader left two canvases redrawing off-screen for the
// rest of the session. Browsers throttle rAF in background *tabs* but not for
// off-screen elements in a foreground one, so nothing was reclaiming it.
//
// Gating on visibility rather than clearing `running` is deliberate: it pauses
// and resumes without touching the widget's own play state, so a reader who
// pressed Pause and scrolled away does not come back to a playing widget, and a
// reader who left one running does.
export function useAnimationTrigger(arg: number | Options = 0.3) {
  const opts: Options = typeof arg === 'number' ? { threshold: arg } : arg
  const threshold = opts.threshold ?? 0.3

  const ref = useRef<HTMLDivElement>(null)
  const [triggered, setTriggered] = useState(false)
  const [visible, setVisible] = useState(false)
  const firedRef = useRef(false)
  const cbRef = useRef(opts.onTrigger)

  useEffect(() => {
    cbRef.current = opts.onTrigger
  })

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting)
        if (entry.isIntersecting && !firedRef.current) {
          firedRef.current = true
          setTriggered(true)
          const prefersReduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
          cbRef.current?.(prefersReduced)
        }
      },
      { threshold }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [threshold])

  const reset = () => {
    firedRef.current = false
    setTriggered(false)
  }

  return { ref, triggered, visible, reset }
}
