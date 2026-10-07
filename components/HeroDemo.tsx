'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ArrowRight, Pause, Play } from 'lucide-react'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { EquationReadout } from '@/components/EquationReadout'

/**
 * The smallest complete unit of the thing this site does, on the landing view.
 *
 * This is deliberately NOT "a widget in the hero" for decoration. What makes an
 * article work is the sequence claim → control → consequence, so this is that
 * sequence at its smallest: one sentence that makes a falsifiable statement, one
 * control to test it with, and the arithmetic that produces the answer.
 *
 * The claim is chosen because it is wrong under the obvious intuition. Almost
 * everyone expects four times the length to swing four times as slowly. It
 * doesn't, and thirty seconds with the slider is a better argument than a
 * paragraph.
 *
 * The two rods now swing. It used to be a still diagram on the grounds that the
 * point is a relationship between two numbers — but the relationship *is* a
 * rate, and watching the short rod complete exactly two swings for every one of
 * the long rod's states the claim faster than the readout can. The motion is
 * driven by phase, not by elapsed time, so dragging the slider changes the
 * speed without making either bob jump. It stops off-screen, in a background
 * tab, and — unless Play is pressed — under a reduced-motion preference.
 */

const G = 9.81

const SPEC = {
  length: { default: 1, min: 0.25, max: 4, step: 0.25, symbol: 'L', unit: 'm' },
}

// Presets for the two settings that make the claim: the longest rod, where the
// short one is visibly swinging at double speed, and the shortest.
const PRESETS = [
  { label: 'L = 4 m', length: 4 },
  { label: 'L = 0.25 m', length: 0.25 },
] as const

// Drawn to scale against the 4 m maximum, so the geometry the reader sees is
// the geometry in the formula rather than a decorative sketch.
const VB_W = 400
const VB_H = 210
const PIVOT_Y = 22
const ROD_MAX_PX = 150
const AMPLITUDE_DEG = 16
const RODS = [
  { x: 140, scale: 1, colour: '#FFB245' },
  { x: 290, scale: 0.25, colour: 'rgba(243,238,230,0.72)' },
] as const

const period = (l: number) => 2 * Math.PI * Math.sqrt(l / G)

// The reduced-motion preference as an external store. The server snapshot says
// "reduce", so the static HTML is the still diagram and hydration then starts
// the swing — rather than rendering "Pause" on the server for a reader who will
// never see it move.
const REDUCE = '(prefers-reduced-motion: reduce)'
const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const prefersReduced = () => window.matchMedia(REDUCE).matches

export function HeroDemo() {
  const { params, set } = useWidgetParams('demo', SPEC)
  const { length } = params

  const reduce = useSyncExternalStore(subscribeMotion, prefersReduced, () => true)
  // null until the reader presses Play or Pause; until then the preference
  // decides.
  const [choice, setChoice] = useState<boolean | null>(null)
  const playing = choice ?? !reduce
  const rootRef = useRef<HTMLElement>(null)
  const rodRefs = useRef<(SVGGElement | null)[]>([])
  const lengthRef = useRef(length)
  const phases = useRef([0, 0])

  useEffect(() => {
    lengthRef.current = length
  }, [length])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = 0
    let onScreen = true

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      RODS.forEach((rod, i) => {
        phases.current[i] += dt / period(lengthRef.current * rod.scale)
        const deg = AMPLITUDE_DEG * Math.cos(2 * Math.PI * phases.current[i])
        rodRefs.current[i]?.setAttribute('transform', `rotate(${deg.toFixed(2)} ${rod.x} ${PIVOT_Y})`)
      })
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && onScreen && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      if (onScreen) start()
      else stop()
    })
    if (rootRef.current) io.observe(rootRef.current)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [playing])

  const t = period(length)
  const quarter = period(length / 4)
  const rodPx = (length / SPEC.length.max) * ROD_MAX_PX

  return (
    <section
      ref={rootRef}
      aria-labelledby="demo-heading"
      className="overflow-hidden rounded-[1.25rem] border border-border-hover bg-bg-surface shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2.5 text-[0.8125rem] font-semibold text-text-primary">
          <span className="live-dot" data-on={playing || undefined} aria-hidden="true" />
          Pendulum
          <span className="truncate font-mono text-xs font-normal text-text-muted">small-angle model</span>
        </span>
        <button
          type="button"
          onClick={() => setChoice(!playing)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          {playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <div className="px-5 pt-5">
        <h2 id="demo-heading" className="font-display text-lg font-semibold leading-snug text-text-primary">
          Quadruple a pendulum&apos;s length and it swings only twice as slowly.
        </h2>
        <p className="mt-1.5 text-sm text-text-secondary">
          Not four times. Drag the length and compare the two rods.
        </p>
      </div>

      <div className="mx-5 mt-4 overflow-hidden rounded-xl" style={{ background: 'var(--color-canvas)' }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Two pendulums drawn to scale: ${length.toFixed(2)} metres with a period of ${t.toFixed(2)} seconds, beside a quarter of that length with a period of ${quarter.toFixed(2)} seconds.`}
        >
          <g stroke="rgba(255,236,214,0.05)">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2={VB_H} />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 50} x2={VB_W} y2={i * 50} />
            ))}
          </g>
          <line x1="70" y1={PIVOT_Y} x2="360" y2={PIVOT_Y} stroke="rgba(243,238,230,0.35)" strokeWidth="2" strokeLinecap="round" />
          {RODS.map((rod, i) => {
            const len = rodPx * rod.scale
            return (
              <g key={rod.x}>
                <g ref={el => { rodRefs.current[i] = el }}>
                  <line x1={rod.x} y1={PIVOT_Y} x2={rod.x} y2={PIVOT_Y + len} stroke={rod.colour} strokeWidth="1.6" />
                  {i === 0 && <circle cx={rod.x} cy={PIVOT_Y + len} r="20" fill="rgba(255,178,69,0.14)" />}
                  <circle cx={rod.x} cy={PIVOT_Y + len} r="8" fill={rod.colour} />
                </g>
                <circle cx={rod.x} cy={PIVOT_Y} r="3" fill="rgba(243,238,230,0.6)" />
                <text x={rod.x} y={VB_H - 12} textAnchor="middle" fontSize="11" style={{ fontFamily: 'var(--font-mono)' }} fill="rgba(243,238,230,0.6)">
                  {`${(length * rod.scale).toFixed(2)} m · ${period(length * rod.scale).toFixed(2)} s`}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-5 pt-4">
        <label className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm text-text-secondary">
          <span>
            Length <span className="font-mono text-accent-gold">L</span>
          </span>
          <input
            type="range"
            min={SPEC.length.min}
            max={SPEC.length.max}
            step={SPEC.length.step}
            value={length}
            onChange={e => set('length', +e.target.value)}
            className="w-full accent-accent-gold"
          />
          <output className="rounded-md border border-border bg-bg-hover px-2 py-1 font-mono text-[0.8125rem] tabular-nums text-text-primary">
            {length.toFixed(2)} m
          </output>
        </label>

        <EquationReadout
          formula="T = 2π√(L/g)"
          bindings={[
            { symbol: 'L', value: `${length.toFixed(2)} m` },
            { symbol: 'g', value: `${G} m/s²` },
          ]}
          steps={[
            `L ∕ g = ${length.toFixed(2)} ∕ ${G} = ${(length / G).toFixed(4)} s²`,
            `√${(length / G).toFixed(4)} = ${Math.sqrt(length / G).toFixed(4)} s`,
            `2π × ${Math.sqrt(length / G).toFixed(4)} = ${t.toFixed(2)} s`,
          ]}
          result={`${t.toFixed(2)} s`}
          assumption={`A quarter as long gives ${quarter.toFixed(2)} s: half, not a quarter, because the length sits under a square root. Small-angle approximation, and gravity taken as ${G} m/s².`}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="try-row" role="group" aria-label="Try a preset">
            <span>Try</span>
            {PRESETS.map(p => (
              <button key={p.label} type="button" onClick={() => set('length', p.length)} aria-pressed={length === p.length}>
                {p.label}
              </button>
            ))}
          </div>
          <Link
            href="/articles/pendulum-motion"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-gold hover:underline"
          >
            Why the square root
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
