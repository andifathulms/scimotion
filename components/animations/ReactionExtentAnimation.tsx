'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 300
const PAD = { left: 54, right: 18, top: 30, bottom: 42 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// Simple A ⇌ B: extent ξ is the fraction converted to product.
// G(ξ) = ξ·ΔG° + RT[ξ ln ξ + (1−ξ) ln(1−ξ)]   (ΔG°(A) taken as 0)
// dG/dξ = ΔG° + RT ln(ξ/(1−ξ)) = ΔG° + RT ln Q   — the local free energy of reaction.
// Minimum (dG/dξ = 0) sits at ξ_eq = K/(1+K), where K = exp(−ΔG°/RT).
const RT = 4.0 // kJ/mol — an effective RT chosen to keep the bowl legible

const ORANGE = '#FB923C' // the free-energy bowl
const GOLD = '#F59E0B' // the rolling mixture / tangent
const BLUE = '#60A5FA' // equilibrium marker
const GREEN = '#10B981' // "at equilibrium" state
const VIOLET = '#A78BFA' // reactant/product axis labels

const clampX = (x: number) => Math.min(0.999, Math.max(0.001, x))
const xlnx = (x: number) => (x <= 0 ? 0 : x * Math.log(x))

function gOf(xi: number, dG0: number): number {
  const x = clampX(xi)
  return x * dG0 + RT * (xlnx(x) + xlnx(1 - x))
}
// Slope dG/dξ — this is ΔG = ΔG° + RT ln Q at the current mixture.
function slopeOf(xi: number, dG0: number): number {
  const x = clampX(xi)
  return dG0 + RT * Math.log(x / (1 - x))
}
function eqOf(dG0: number): number {
  const K = Math.exp(-dG0 / RT)
  return K / (1 + K)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  dG0: { default: -4, min: -10, max: 10, step: 0.5 },
}

export function ReactionExtentAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const xiRef = useRef(0.02) // current extent of reaction
  const dG0Ref = useRef(-4)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('reaction-extent', SPEC)
  const { dG0 } = params
  const [running, setRunning] = useState(false)
  const [xiReadout, setXiReadout] = useState(0.02)

  useEffect(() => { dG0Ref.current = dG0 }, [dG0])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  // Auto-scale the vertical axis to the current curve.
  const yBounds = useCallback((dG0v: number) => {
    let lo = Infinity
    let hi = -Infinity
    for (let x = 0.001; x <= 0.999; x += 0.004) {
      const g = gOf(x, dG0v)
      if (g < lo) lo = g
      if (g > hi) hi = g
    }
    const pad = (hi - lo) * 0.12 + 0.5
    return { lo: lo - pad, hi: hi + pad }
  }, [])

  const xFor = useCallback((xi: number) => PAD.left + xi * PLOT_W, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dG0v = dG0Ref.current
    const xi = xiRef.current
    const { lo, hi } = yBounds(dG0v)
    const yFor = (g: number) => PAD.top + PLOT_H - ((g - lo) / (hi - lo)) * PLOT_H

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('G (free energy)', PAD.left - 46, PAD.top - 14)
    ctx.fillStyle = VIOLET
    ctx.fillText('all reactant (ξ=0)', PAD.left, PAD.top + PLOT_H + 26)
    ctx.textAlign = 'right'
    ctx.fillText('all product (ξ=1)', PAD.left + PLOT_W, PAD.top + PLOT_H + 26)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('extent of reaction ξ →', PAD.left + PLOT_W / 2 - 54, PAD.top + PLOT_H + 12)

    // The free-energy bowl.
    ctx.beginPath()
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2.5
    let first = true
    for (let x = 0.001; x <= 0.999; x += 0.003) {
      const px = xFor(x)
      const py = yFor(gOf(x, dG0v))
      if (first) { ctx.moveTo(px, py); first = false } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Equilibrium: the bottom of the bowl.
    const xiEq = eqOf(dG0v)
    const xe = xFor(xiEq)
    ctx.beginPath()
    ctx.strokeStyle = `${BLUE}88`
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.moveTo(xe, PAD.top)
    ctx.lineTo(xe, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(xe, yFor(gOf(xiEq, dG0v)), 3.5, 0, Math.PI * 2)
    ctx.fillStyle = BLUE
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.fillText(`equilibrium  ξ = ${xiEq.toFixed(2)}`, xe, PAD.top - 4)
    ctx.textAlign = 'left'

    // Tangent line at the current mixture: its slope IS ΔG = ΔG° + RT ln Q.
    const slope = slopeOf(xi, dG0v)
    const gx = gOf(xi, dG0v)
    const bx = xFor(xi)
    const by = yFor(gx)
    const atEq = Math.abs(xi - xiEq) < 0.01
    const dxi = 0.12
    // Screen-space tangent, built from the G values either side of the mixture.
    const gL = gx - slope * dxi
    const gR = gx + slope * dxi
    ctx.beginPath()
    ctx.strokeStyle = `${GOLD}cc`
    ctx.lineWidth = 1.5
    ctx.moveTo(xFor(xi - dxi), yFor(gL))
    ctx.lineTo(xFor(xi + dxi), yFor(gR))
    ctx.stroke()

    // The rolling mixture.
    ctx.beginPath()
    ctx.arc(bx, by, 6, 0, Math.PI * 2)
    ctx.fillStyle = atEq ? GREEN : GOLD
    ctx.fill()

    // Direction arrow along the slope (downhill).
    if (!atEq) {
      const dir = slope > 0 ? -1 : 1 // roll toward lower G
      const ax = bx + dir * 26
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.5)'
      ctx.lineWidth = 1.25
      ctx.moveTo(bx + dir * 12, by - 16)
      ctx.lineTo(ax, by - 16)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(ax, by - 16)
      ctx.lineTo(ax - dir * 5, by - 19)
      ctx.lineTo(ax - dir * 5, by - 13)
      ctx.closePath()
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fill()
    }

    // Readouts
    const K = Math.exp(-dG0v / RT)
    const Q = clampX(xi) / (1 - clampX(xi))
    ctx.fillStyle = GOLD
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(
      `ΔG = ΔG° + RT ln Q = ${slope >= 0 ? '+' : ''}${slope.toFixed(1)} kJ/mol`,
      PAD.left + 6,
      PAD.top + 14
    )
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText(
      `Q = ${Q.toFixed(2)}   K = ${K.toFixed(2)}   ${
        atEq ? 'ΔG = 0 · at equilibrium' : Q < K ? 'Q < K · runs forward →' : '← Q > K · runs backward'
      }`,
      PAD.left + 6,
      PAD.top + 28
    )
  }, [xFor, yBounds])

  useEffect(() => { draw() }, [draw, dG0])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const dG0v = dG0Ref.current
      const xiEq = eqOf(dG0v)
      const slope = slopeOf(xiRef.current, dG0v)
      // Gradient descent on G: the mixture rolls downhill and stops at the minimum.
      xiRef.current = clampX(xiRef.current - slope * 0.0016)
      if (Math.abs(xiRef.current - xiEq) < 0.0015) xiRef.current = xiEq
      setXiReadout(xiRef.current)
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const releaseFrom = (xi0: number) => {
    xiRef.current = xi0
    setXiReadout(xi0)
    setRunning(true)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    set('dG0', -4)
    dG0Ref.current = -4
    xiRef.current = 0.02
    setXiReadout(0.02)
    draw()
  }

  const K = Math.exp(-dG0 / RT)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Free energy along the extent of reaction</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Roll</>}
        </button>
        <button
          onClick={() => releaseFrom(0.02)}
          className="px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Release from ξ = 0
        </button>
        <button
          onClick={() => releaseFrom(0.98)}
          className="px-2.5 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Release from ξ = 1
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>ΔG°:</span>
          <input
            type="range" min={SPEC.dG0.min} max={SPEC.dG0.max} step={SPEC.dG0.step} value={dG0}
            onChange={e => set('dG0', +e.target.value)}
            className="w-28 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary">{dG0.toFixed(1)} kJ/mol</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          ξ {xiReadout.toFixed(2)} · K = {K.toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Press <em>Roll</em> and the mixture slides downhill to the bottom of the bowl — equilibrium —
        where the tangent is flat, ΔG = 0, and Q = K. Release it from either end and it lands in the same
        place. Now drag ΔG° more negative: the bowl tilts toward product, its minimum shifts right, and K
        grows. That is exactly ΔG° = −RT ln K.
      </p>
    </div>
  )
}
