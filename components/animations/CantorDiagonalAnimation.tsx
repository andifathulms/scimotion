'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const VIOLET = '#A78BFA'
const N = 8 // rows in the (necessarily incomplete) list
const COLS = 8 // digits shown per real number

// A fixed, deterministic table of decimal expansions for reals in (0,1).
// Each row is r_k = 0.d0 d1 d2 …  (no randomness — reproducible every render).
const DIGITS: number[][] = [
  [3, 1, 4, 1, 5, 9, 2, 6],
  [2, 7, 1, 8, 2, 8, 1, 8],
  [1, 4, 1, 4, 2, 1, 3, 5],
  [5, 7, 7, 2, 1, 5, 6, 6],
  [6, 1, 8, 0, 3, 3, 9, 8],
  [4, 6, 6, 9, 2, 0, 1, 6],
  [8, 0, 9, 4, 3, 1, 5, 7],
  [7, 3, 8, 9, 0, 5, 6, 2],
]

// Flip rule that avoids 0 and 9, so the constructed number can never secretly
// equal a listed one via the 0.4999… = 0.5000… ambiguity.
const flip = (d: number) => (d === 5 ? 6 : 5)

const MAX_PHASE = N // phase = how many diagonal digits have been processed

export function CantorDiagonalAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (reduced) {
        setPhase(MAX_PHASE) // static final frame: full constructed number
      } else {
        startPlay()
      }
    },
  })

  const [phase, setPhase] = useState(0)
  const [playing, setPlaying] = useState(false)

  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  const phaseRef = useRef(0)
  phaseRef.current = phase

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startPlay = useCallback(() => {
    if (phaseRef.current >= MAX_PHASE) setPhase(0)
    setPlaying(true)
    lastTickRef.current = 0
    const loop = (t: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = t
      if (t - lastTickRef.current >= 850) {
        lastTickRef.current = t
        setPhase((p) => {
          const next = Math.min(p + 1, MAX_PHASE)
          if (next >= MAX_PHASE) setPlaying(false)
          return next
        })
      }
      if (phaseRef.current < MAX_PHASE) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  useEffect(() => stopRaf, [stopRaf])

  const step = () => {
    stopRaf()
    setPlaying(false)
    setPhase((p) => (p >= MAX_PHASE ? MAX_PHASE : p + 1))
  }

  const resetAll = () => {
    stopRaf()
    setPlaying(false)
    setPhase(0)
    triggerReset()
  }

  // The constructed number's revealed digits.
  const built = Array.from({ length: N }, (_, i) => (i < phase ? flip(DIGITS[i][i]) : null))
  const activeDiag = playing || phase < MAX_PHASE ? phase : -1 // currently-highlighted diagonal cell

  const cellStyle = (row: number, col: number): React.CSSProperties => {
    const isDiag = row === col
    const processed = row < phase
    if (isDiag && processed) {
      return { background: 'rgba(167,139,250,0.22)', color: VIOLET, borderColor: VIOLET, fontWeight: 700 }
    }
    return {}
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Cantor&apos;s Diagonal
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: 200 }}>
        <p className="text-xs text-text-muted mb-3">
          A list claiming to contain <em>every</em> real in (0,1). Walk the diagonal, flip each
          digit, and build a number that is in <span style={{ color: VIOLET }}>no row</span>.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'inline-block', fontFamily: 'monospace', fontSize: 13 }}>
            {DIGITS.map((row, r) => (
              <div key={r} className="flex items-center gap-1 mb-1">
                <span className="text-text-muted" style={{ width: 34, textAlign: 'right' }}>
                  r{r + 1} =
                </span>
                <span className="text-text-secondary">0.</span>
                {row.slice(0, COLS).map((d, c) => (
                  <span
                    key={c}
                    className="inline-flex items-center justify-center rounded border text-text-secondary border-transparent"
                    style={{ width: 22, height: 24, transition: 'all 300ms ease', ...cellStyle(r, c) }}
                  >
                    {d}
                  </span>
                ))}
                <span className="text-text-muted">…</span>
              </div>
            ))}

            {/* Constructed number along the bottom */}
            <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border">
              <span style={{ width: 34, textAlign: 'right', color: VIOLET }}>new =</span>
              <span style={{ color: VIOLET }}>0.</span>
              {built.map((d, c) => (
                <span
                  key={c}
                  className="inline-flex items-center justify-center rounded border"
                  style={{
                    width: 22,
                    height: 24,
                    transition: 'all 300ms ease',
                    background: d !== null ? 'rgba(167,139,250,0.14)' : 'transparent',
                    borderColor: c === activeDiag ? VIOLET : 'transparent',
                    color: d !== null ? VIOLET : 'var(--color-text-muted, #888)',
                    fontWeight: 700,
                  }}
                >
                  {d !== null ? d : '·'}
                </span>
              ))}
              <span style={{ color: VIOLET }}>…</span>
            </div>
          </div>
        </div>

        {/* Readout */}
        <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
          {phase === 0 ? (
            <span className="text-text-muted">Press Play — take digit n of row n and flip it.</span>
          ) : (
            <span>
              digit {phase}: r{phase} had{' '}
              <span className="text-accent-orange">{DIGITS[phase - 1][phase - 1]}</span> →{' '}
              <span style={{ color: VIOLET }}>{flip(DIGITS[phase - 1][phase - 1])}</span>, so
              new ≠ r{phase}
            </span>
          )}
          <span style={{ color: VIOLET }}>
            new = 0.{built.map((d) => (d === null ? '' : d)).join('')}
            {phase < MAX_PHASE ? '…' : ''}
          </span>
          {phase >= MAX_PHASE && (
            <span className="text-accent-teal">
              differs from every row → not in the list → ℝ is uncountable, |ℝ| &gt; |ℕ|
            </span>
          )}
        </div>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (playing ? (stopRaf(), setPlaying(false)) : startPlay())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {playing ? 'Playing…' : 'Play'}
        </button>
        <button
          onClick={step}
          disabled={phase >= MAX_PHASE}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors disabled:opacity-40"
        >
          Step
        </button>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Diagonal digit <strong className="text-accent-gold">{phase}</strong> / {MAX_PHASE}
        </WidgetStatus>
      </div>
    </div>
  )
}
