import { useEffect, useRef, useState } from 'react'

export function useAnimationTrigger(threshold = 0.3) {
  const ref = useRef<HTMLDivElement>(null)
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered) {
          setTriggered(true)
        }
      },
      { threshold }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [triggered, threshold])

  return { ref, triggered, reset: () => setTriggered(false) }
}
