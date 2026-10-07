'use client'
import { useEffect } from 'react'

/**
 * Keyboard shortcuts and a live indicator for every widget on the page,
 * without editing the 339 widget components.
 *
 * Every widget follows the same markup contract — an `.animation-block` whose
 * header holds a "Reset" button and whose controls hold a Play/Pause button —
 * so this reads that contract instead of asking each widget to opt in:
 *
 *   Space  presses the Play/Pause button      (when focus is inside a widget)
 *   R      presses the Reset button
 *
 * and it mirrors "is the Pause label showing?" onto `data-running`, which the
 * stylesheet turns into the live dot in the header.
 *
 * Space is left alone on buttons, links and text fields, where it already means
 * something. On a slider it does nothing natively, so it is free to take — that
 * is the case that matters, since a reader adjusting a knob wants to start the
 * model without reaching for the mouse.
 *
 * Widgets mount client-side (next/dynamic, ssr:false) after this runs, so blocks
 * are discovered through a MutationObserver rather than once on mount.
 */

const PLAY = /^(play|pause|resume|start|run)\b/i
const RESET = /^reset\b/i

const label = (b: Element) => (b.textContent ?? '').trim()

function findButton(block: Element, re: RegExp): HTMLButtonElement | undefined {
  return [...block.querySelectorAll('button')].find(b => re.test(label(b)))
}

function sync(block: HTMLElement) {
  if (!block.hasAttribute('tabindex')) block.tabIndex = -1
  const play = findButton(block, PLAY)
  const reset = findButton(block, RESET)
  if (play || reset) block.dataset.keys = ''
  const running = !!play && /^pause\b/i.test(label(play))
  if (running) block.dataset.running = ''
  else delete block.dataset.running
}

export function WidgetKeys() {
  useEffect(() => {
    let frame = 0
    const scan = () => {
      frame = 0
      document.querySelectorAll<HTMLElement>('.animation-block').forEach(sync)
    }
    // A running simulation re-renders its readouts every frame; batching to one
    // scan per animation frame keeps this to a cheap querySelectorAll.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    scan()

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const block = target?.closest<HTMLElement>('.animation-block')
      if (!block) return

      const tag = target!.tagName
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && (target as HTMLInputElement).type !== 'range')

      if (e.key === ' ') {
        if (typing || tag === 'BUTTON' || tag === 'A') return
        const play = findButton(block, PLAY)
        if (!play) return
        e.preventDefault()
        play.click()
      } else if ((e.key === 'r' || e.key === 'R') && !typing) {
        const reset = findButton(block, RESET)
        if (!reset) return
        e.preventDefault()
        reset.click()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return null
}
