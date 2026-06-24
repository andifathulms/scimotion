import { useEffect, useRef, useState } from 'react'

type Options = { threshold?: number; onTrigger?: (prefersReducedMotion: boolean) => void }

// Fires when the element scrolls into view. Accepts either a threshold number
// (legacy) or an options object. `onTrigger` runs inside the IntersectionObserver
// callback (an event, not render) and receives whether reduced motion is preferred.
export function useAnimationTrigger(arg: number | Options = 0.3) {
  const opts: Options = typeof arg === 'number' ? { threshold: arg } : arg
  const threshold = opts.threshold ?? 0.3

  const ref = useRef<HTMLDivElement>(null)
  const [triggered, setTriggered] = useState(false)
  const firedRef = useRef(false)
  const cbRef = useRef(opts.onTrigger)
  cbRef.current = opts.onTrigger

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
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

  return { ref, triggered, reset }
}
