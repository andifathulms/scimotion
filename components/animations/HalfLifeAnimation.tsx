'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 250
const PAD = { left: 44, right: 18, top: 26, bottom: 36 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const MAX_N = 6              // half-lives shown on the axis
const N_PER_FRAME = 0.012    // half-lives advanced per frame
// A zero-order curve that leaves at the same initial slope as the first-order one
// runs out at t = 1/k, which is 1/ln2 half-lives.
const ZERO_END = 1 / Math.LN2

const C_FIRST = '#F472B6'  // pink — first-order elimination
const C_ZERO = '#60A5FA'   // blue — zero-order elimination
const C_MARK = '#F59E0B'   // gold — half-life markers
const C_GUIDE = '#A78BFA'  // violet — current-time guide

const firstOrder = (n: number) => Math.pow(2, -n)
const zeroOrder = (n: number) => Math.max(0, 1 - n / ZERO_END)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  halfLife: { default: 6, min: 1, max: 24, step: 1 },
}

export function HalfLifeAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setN(MAX_N); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [n, setN] = useState(0)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('half-life', SPEC)
  const { halfLife } = params

  const xFor = useCallback((hl: number) => PAD.left + (hl / MAX_N) * PLOT_W, [])
  const yFor = useCallback((frac: number) => PAD.top + PLOT_H - frac * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'

    // Gridlines at the successive halvings
    for (const frac of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const y = yFor(frac)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.07)'
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + PLOT_W, y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.textAlign = 'right'
      ctx.fillText(`${(frac * 100).toFixed(frac < 0.1 ? 2 : frac < 0.5 ? 1 : 0)}%`, PAD.left - 6, y + 3)
      ctx.textAlign = 'left'
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('fraction of dose remaining', PAD.left - 2, PAD.top - 10)
    for (let i = 0; i <= MAX_N; i++) {
      const x = xFor(i)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PAD.top + PLOT_H)
      ctx.lineTo(x, PAD.top + PLOT_H + 4)
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${i * halfLife}`, x, PAD.top + PLOT_H + 15)
      ctx.textAlign = 'left'
    }
    ctx.fillText('hours (tick = one half-life) →', PAD.left + 4, H - 5)

    // Zero-order line
    ctx.beginPath()
    ctx.strokeStyle = C_ZERO
    ctx.lineWidth = 2
    ctx.setLineDash([5, 4])
    let zStarted = false
    for (let x = 0; x <= n + 1e-9; x += 0.02) {
      const px = xFor(x)
      const py = yFor(zeroOrder(x))
      if (!zStarted) { ctx.moveTo(px, py); zStarted = true }
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // First-order curve
    ctx.beginPath()
    ctx.strokeStyle = C_FIRST
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    let fStarted = false
    for (let x = 0; x <= n + 1e-9; x += 0.02) {
      const px = xFor(x)
      const py = yFor(firstOrder(x))
      if (!fStarted) { ctx.moveTo(px, py); fStarted = true }
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Half-life markers reached so far
    for (let i = 1; i <= MAX_N; i++) {
      if (i > n) break
      const px = xFor(i)
      const py = yFor(firstOrder(i))
      ctx.beginPath()
      ctx.strokeStyle = `${C_MARK}44`
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1
      ctx.moveTo(px, PAD.top + PLOT_H)
      ctx.lineTo(px, py)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = C_MARK
      ctx.fill()
      ctx.fillStyle = C_MARK
      ctx.fillText(`${(firstOrder(i) * 100).toFixed(i > 3 ? 2 : 1)}%`, px + 6, py - 5)
    }

    // Current-time guide
    if (n > 0 && n < MAX_N) {
      const px = xFor(n)
      ctx.beginPath()
      ctx.strokeStyle = `${C_GUIDE}55`
      ctx.lineWidth = 1
      ctx.moveTo(px, PAD.top)
      ctx.lineTo(px, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, yFor(firstOrder(n)), 4, 0, Math.PI * 2)
      ctx.fillStyle = C_FIRST
      ctx.fill()
      if (zeroOrder(n) > 0) {
        ctx.beginPath()
        ctx.arc(px, yFor(zeroOrder(n)), 4, 0, Math.PI * 2)
        ctx.fillStyle = C_ZERO
        ctx.fill()
      }
    }

    // Legend
    ctx.font = '10px monospace'
    const legend: [string, string][] = [
      [C_FIRST, 'first-order (most drugs)'],
      [C_ZERO, 'zero-order (e.g. alcohol)'],
    ]
    let lx = PAD.left + 90
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.moveTo(lx, PAD.top - 14)
      ctx.lineTo(lx + 16, PAD.top - 14)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText(label, lx + 22, PAD.top - 11)
      lx += 26 + ctx.measureText(label).width + 22
    }
  }, [n, halfLife, xFor, yFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setN(prev => {
        const next = prev + N_PER_FRAME
        if (next >= MAX_N) { setRunning(false); return MAX_N }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setN(0)
    set('halfLife', 6)
  }

  const remaining = firstOrder(n)
  const cleared = 1 - remaining

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · First-order vs zero-order elimination</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Half-life:</span>
          <input
            type="range" min={SPEC.halfLife.min} max={SPEC.halfLife.max} step={SPEC.halfLife.step} value={halfLife}
            onChange={e => set('halfLife', +e.target.value)}
            className="w-28 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{halfLife} h</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {n.toFixed(2)} half-lives · {(n * halfLife).toFixed(1)} h ·{' '}
          <strong style={{ color: C_FIRST }}>{(remaining * 100).toFixed(2)}% left</strong> ·{' '}
          {(cleared * 100).toFixed(1)}% cleared
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        First-order elimination removes a constant <em>fraction</em> per unit time, so the curve halves
        forever and never quite reaches zero. Zero-order removes a constant <em>amount</em> per unit
        time — a straight line that hits zero and stays there.
      </p>
    </div>
  )
}
