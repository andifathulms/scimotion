'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'
import { EquationReadout } from '@/components/EquationReadout'

const W = 600
const H = 300
const GRID = 100          // 100 x 100 dots = 10,000 people
const SQ = 240            // population square side
const SQ_X = 24
const SQ_Y = 30

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const DEFAULTS = { prev: 1, sens: 99, spec: 95 }

type Counts = { tp: number; fn: number; fp: number; tn: number }

function counts(prev: number, sens: number, spec: number): Counts {
  const total = GRID * GRID
  const sick = Math.round(total * (prev / 100))
  const well = total - sick
  const tp = Math.round(sick * (sens / 100))
  const fn = sick - tp
  const fp = Math.round(well * (1 - spec / 100))
  const tn = well - fp
  return { tp, fn, fp, tn }
}

// Prevalence, sensitivity and specificity are the three numbers a screening
// programme is actually specified by, so they are also the three worth linking
// to. Defaults are the classic rare-disease case: a very good test, a rare
// condition, and a posterior most people guess wrong by an order of magnitude.
const SPEC = {
  prev: { default: DEFAULTS.prev, min: 0.1, max: 50, step: 0.1, symbol: 'P(D)', unit: '%' },
  sens: { default: DEFAULTS.sens, min: 50, max: 100, step: 0.5, symbol: 'P(+|D)', unit: '%' },
  spec: { default: DEFAULTS.spec, min: 50, max: 100, step: 0.5, symbol: 'P(−|¬D)', unit: '%' },
}

export function BayesTheoremAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const revealRef = useRef(0)
  const [phase, setPhase] = useState(0)
  const { params, set, reset: resetParams, permalink, isDefault, restored } = useWidgetParams('bayes', SPEC)
  const { prev, sens, spec } = params

  const c = counts(prev, sens, spec)
  const posPeople = c.tp + c.fp
  const posterior = posPeople > 0 ? c.tp / posPeople : 0

  const draw = useCallback((reveal: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const k = counts(prev, sens, spec)
    const cell = SQ / GRID

    // Person dots are laid out row-major in the order TP, FN, FP, TN so that
    // the diseased slab always sits at the top of the square.
    const order: Array<[number, string]> = [
      [k.tp, GOLD],
      [k.fn, PINK],
      [k.fp, BLUE],
      [k.tn, 'rgba(255,245,235,0.10)'],
    ]

    const shown = Math.round(GRID * GRID * reveal)
    let drawn = 0
    ctx.fillStyle = 'rgba(255,245,235,0.03)'
    ctx.fillRect(SQ_X, SQ_Y, SQ, SQ)

    order.forEach(([n, color]) => {
      ctx.fillStyle = color
      for (let i = 0; i < n; i++) {
        const idx = drawn + i
        if (idx >= shown) break
        const row = Math.floor(idx / GRID)
        const col = idx % GRID
        ctx.fillRect(SQ_X + col * cell, SQ_Y + row * cell, cell - 0.35, cell - 0.35)
      }
      drawn += n
    })

    // Border + separator between "tested positive" region and the rest
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(SQ_X + 0.5, SQ_Y + 0.5, SQ, SQ)

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('10,000 people', SQ_X, SQ_Y - 10)

    // ---- Right panel -------------------------------------------------
    const px = SQ_X + SQ + 34
    const posTotal = k.tp + k.fp
    const post = posTotal > 0 ? k.tp / posTotal : 0

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('EVERYONE WHO TESTED POSITIVE', px, SQ_Y - 10)

    // Stacked bar of the positive population
    const barW = W - px - 24
    const barY = SQ_Y + 4
    const barH = 26
    const tpW = posTotal > 0 ? (k.tp / posTotal) * barW : 0
    ctx.fillStyle = GOLD
    ctx.fillRect(px, barY, tpW, barH)
    ctx.fillStyle = BLUE
    ctx.fillRect(px + tpW, barY, barW - tpW, barH)
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.strokeRect(px + 0.5, barY + 0.5, barW, barH)

    // Posterior readout
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText('P(disease | positive)', px, barY + barH + 26)
    ctx.fillStyle = post < 0.5 ? PINK : GREEN
    ctx.font = 'bold 30px monospace'
    ctx.fillText(`${(post * 100).toFixed(1)}%`, px, barY + barH + 56)

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`${k.tp} true / ${posTotal} positive`, px, barY + barH + 74)

    // Legend
    const legend: Array<[string, string, number]> = [
      ['true positive (sick, +)', GOLD, k.tp],
      ['false positive (well, +)', BLUE, k.fp],
      ['false negative (sick, −)', PINK, k.fn],
      ['true negative (well, −)', 'rgba(255,245,235,0.25)', k.tn],
    ]
    legend.forEach(([label, color, n], i) => {
      const ly = barY + barH + 100 + i * 17
      ctx.fillStyle = color
      ctx.fillRect(px, ly - 7, 8, 8)
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.font = '9px monospace'
      ctx.fillText(label, px + 14, ly)
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${n}`, W - 24, ly)
      ctx.textAlign = 'left'
    })

    // Base-rate caption under the square
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '9px monospace'
    ctx.fillText(
      `${k.tp + k.fn} sick · ${k.fp + k.tn} healthy`,
      SQ_X,
      SQ_Y + SQ + 16
    )
  }, [prev, sens, spec])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      revealRef.current = reduced ? 1 : 0
      setPhase(p => p + 1)
    },
  })

  // Fill-in animation: dots stream into the square after the first trigger.
  useEffect(() => {
    const tick = () => {
      if (revealRef.current < 1) {
        revealRef.current = Math.min(1, revealRef.current + 0.035)
        draw(revealRef.current)
        rafRef.current = requestAnimationFrame(tick)
      } else {
        draw(1)
      }
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, phase])

  const reset = () => {
    triggerReset()
    resetParams()
    revealRef.current = 0
    setPhase(p => p + 1)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Natural frequencies</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Natural frequencies. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Prevalence <span className="text-accent-gold">P(D)</span></span>
          <input type="range" min={SPEC.prev.min} max={SPEC.prev.max} step={SPEC.prev.step} value={prev}
            onChange={e => set('prev', +e.target.value)}
            className="w-24 accent-accent-violet" />
          <span className="font-mono text-text-secondary w-12">{prev.toFixed(1)}%</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Sensitivity <span className="text-accent-gold">P(+|D)</span></span>
          <input type="range" min={SPEC.sens.min} max={SPEC.sens.max} step={SPEC.sens.step} value={sens}
            onChange={e => set('sens', +e.target.value)}
            className="w-24 accent-accent-gold" />
          <span className="font-mono text-text-secondary w-12">{sens.toFixed(1)}%</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Specificity</span>
          <input type="range" min={SPEC.spec.min} max={SPEC.spec.max} step={SPEC.spec.step} value={spec}
            onChange={e => set('spec', +e.target.value)}
            className="w-24 accent-accent-blue" />
          <span className="font-mono text-text-secondary w-12">{spec.toFixed(1)}%</span>
        </label>
      </div>
      <div className="animation-readout">
        {/* P(+) is not a slider — it is the column the dots actually land in,
              tp + fp out of GRID². Showing it as the denominator is what makes the
              counter-intuitive result legible: a 99%-sensitive test on a rare
              disease produces far more false positives than true ones, and the
              formula says so in one line. */}
        <EquationReadout
          formula="P(D|+) = P(+|D) · P(D) / P(+)"
          bindings={[
            { symbol: 'P(+|D)', value: `${sens.toFixed(1)}%` },
            { symbol: 'P(D)', value: `${prev.toFixed(1)}%` },
            { symbol: 'P(+)', value: `${((posPeople / (GRID * GRID)) * 100).toFixed(1)}%` },
          ]}
          result={`${(posterior * 100).toFixed(1)}%`}
          assumption={`counted on whole people — ${GRID * GRID} of them — so each figure is rounded to the nearest dot`}
        />
        {/* The verdict, not just the number. Colour alone carried this before;
            it now says which side of the coin-flip the reader is on, which is
            the whole point of the widget. */}
        <span className="text-xs font-mono shrink-0" style={{ color: posterior < 0.5 ? PINK : VIOLET }}>
          {posterior < 0.5 ? 'most positives are false' : 'most positives are true'}
        </span>
      </div>
    </div>
  )
}
