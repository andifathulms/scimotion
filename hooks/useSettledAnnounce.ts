'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Announce a rendered value only once it has stopped changing.
 *
 * 303 of the 339 widgets call setState from a requestAnimationFrame loop, so
 * their readouts change around sixty times a second while a simulation runs. A
 * plain `aria-live="polite"` on one of those queues an utterance per frame: the
 * screen reader falls behind or talks over itself, and the reader learns less
 * than they did from silence.
 *
 * So: watch the rendered text after every render, restart a timer whenever it
 * differs, and publish only text that has held still for SETTLE_MS. A running
 * simulation keeps resetting the timer and stays quiet — correct, because a
 * number moving at 60Hz is not information. When the reader pauses, releases a
 * slider, or the model reaches steady state, they hear where it landed.
 *
 * The first value is published but never announced. Widgets mount with the
 * article and there are two per page, so announcing on mount would greet every
 * reader with unprompted numbers. `live` flips one task after the first publish,
 * which puts the value in the accessibility tree to be browsed without pushing
 * it at anyone.
 *
 * Returns the ref to attach to the (visually rendered, aria-hidden) element, and
 * the text plus live state for the sr-only region.
 */

// Long enough to sit past a slider drag and the tail of most transitions, short
// enough that releasing a control and hearing the result still reads as cause
// and effect.
const SETTLE_MS = 900

export function useSettledAnnounce<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const pending = useRef('')
  const spoken = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const goLive = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [text, setText] = useState('')
  const [live, setLive] = useState(false)

  // No dependency array on purpose: the values live in the rendered children,
  // not in props this hook could compare, so it has to look after every render.
  useEffect(() => {
    const now = ref.current?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    // Unchanged since the previous render — leave the running timer alone so it
    // can reach zero. Restarting it here is what would stop a settled value
    // from ever being announced.
    if (now === pending.current) return
    pending.current = now
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!pending.current || pending.current === spoken.current) return
      const isFirst = spoken.current === ''
      spoken.current = pending.current
      setText(pending.current)
      if (isFirst) goLive.current = setTimeout(() => setLive(true), 0)
    }, SETTLE_MS)
  })

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      clearTimeout(goLive.current)
    },
    []
  )

  return { ref, text, live: live ? ('polite' as const) : ('off' as const) }
}
