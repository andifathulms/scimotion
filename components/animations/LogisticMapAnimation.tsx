'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 330

// Bifurcation panel
const PAD = { left: 40, right: 14, top: 14, bottom: 26 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = 190

// Orbit panel (below)
const ORB_TOP = PAD.top + PLOT_H + 40
const ORB_H = H - ORB_TOP - 16
const ORB_N = 64

const R_MIN = 2.4
const R_MAX = 4
const TRANSIENT = 400
const KEEP = 220

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'

// Iterate the logistic map and return the attracting set for one r value.
function orbitTail(r: number): number[] {
  let x = 0.5
  for (let i = 0; i < TRANSIENT; i++) x = r * x * (1 - x)
  const out = new Array<number>(KEEP)
  for (let i = 0; i < KEEP; i++) {
    x = r * x * (1 - x)
    out[i] = x
  }
  return out
}

// Smallest p <= 16 such that the orbit repeats with period p, else 0 (chaotic).
function detectPeriod(r: number): number {
  let x = 0.5
  for (let i = 0; i < 3000; i++) x = r * x * (1 - x)
  const seq = new Array<number>(64)
  for (let i = 0; i < 64; i++) {
    x = r * x * (1 - x)
    seq[i] = x
  }
  for (let p = 1; p <= 16; p++) {
    let ok = true
    for (let i = 0; i + p < 40; i++) {
      if (Math.abs(seq[i] - seq[i + p]) > 1e-5) { ok = false; break }
    }
    if (ok) return p
  }
  return 0
}

export function LogisticMapAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const offRef = useRef<HTMLCanvasElement | null>(null)
  const colsRef = useRef<number[][]>([])
  const progressRef = useRef(0)
  const rafRef = useRef(0)

  const [r, setR] = useState(3.55)
  const [done, setDone] = useState(false)

  const rToX = useCallback((v: number) => PAD.left + ((v - R_MIN) / (R_MAX - R_MIN)) * PLOT_W, [])

  // Paint bifurcation columns [from, to) into the offscreen buffer.
  const paintCols = useCallback((from: number, to: number) => {
    const off = offRef.current
    if (!off) return
    const ctx = off.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'rgba(167,139,250,0.55)'
    for (let cx = from; cx < to; cx++) {
      const col = colsRef.current[cx]
      if (!col) continue
      for (let i = 0; i < col.length; i++) {
        ctx.fillRect(cx, Math.round((1 - col[i]) * (PLOT_H - 1)), 1, 1)
      }
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // --- bifurcation frame ---
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('x', PAD.left - 22, PAD.top + 10)
    ctx.fillText('1.0', PAD.left - 30, PAD.top + 4)
    ctx.fillText('0.0', PAD.left - 30, PAD.top + PLOT_H + 4)
    ctx.fillText('r', PAD.left + PLOT_W - 6, PAD.top + PLOT_H + 22)

    for (const tick of [2.4, 2.8, 3.2, 3.4495, 3.5699, 4]) {
      const tx = rToX(tick)
      ctx.strokeStyle = 'rgba(255,245,235,0.07)'
      ctx.beginPath()
      ctx.moveTo(tx, PAD.top)
      ctx.lineTo(tx, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(tick.toFixed(tick === 3.4495 || tick === 3.5699 ? 2 : 1), tx - 10, PAD.top + PLOT_H + 14)
    }

    // onset-of-chaos marker
    const chaosX = rToX(3.5699)
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(chaosX, PAD.top)
    ctx.lineTo(chaosX, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])

    // --- the diagram itself ---
    if (offRef.current) {
      ctx.drawImage(offRef.current, PAD.left, PAD.top)
    }

    ctx.fillStyle = BLUE
    ctx.font = '9px monospace'
    ctx.fillText('r∞ ≈ 3.5699', chaosX + 4, PAD.top + 11)

    // --- current-r cursor ---
    const cx = rToX(r)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(cx, PAD.top)
    ctx.lineTo(cx, PAD.top + PLOT_H)
    ctx.stroke()

    // --- orbit / time series panel ---
    const tail = orbitTail(r).slice(0, ORB_N)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, ORB_TOP)
    ctx.lineTo(PAD.left, ORB_TOP + ORB_H)
    ctx.lineTo(PAD.left + PLOT_W, ORB_TOP + ORB_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText(`orbit at r = ${r.toFixed(3)}`, PAD.left + 4, ORB_TOP - 6)
    ctx.fillText('n', PAD.left + PLOT_W - 6, ORB_TOP + ORB_H + 16)

    const ox = (i: number) => PAD.left + (i / (ORB_N - 1)) * PLOT_W
    const oy = (v: number) => ORB_TOP + (1 - v) * ORB_H

    ctx.strokeStyle = 'rgba(245,158,11,0.45)'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    tail.forEach((v, i) => (i === 0 ? ctx.moveTo(ox(i), oy(v)) : ctx.lineTo(ox(i), oy(v))))
    ctx.stroke()

    ctx.fillStyle = GOLD
    tail.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(ox(i), oy(v), 1.8, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [r, rToX])

  // Precompute every column once, then reveal it left to right.
  useEffect(() => {
    const off = document.createElement('canvas')
    off.width = PLOT_W
    off.height = PLOT_H
    offRef.current = off
    colsRef.current = Array.from({ length: PLOT_W }, (_, i) =>
      orbitTail(R_MIN + (i / (PLOT_W - 1)) * (R_MAX - R_MIN))
    )
    progressRef.current = 0
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const revealAll = useCallback(() => {
    paintCols(progressRef.current, PLOT_W)
    progressRef.current = PLOT_W
    setDone(true)
    draw()
  }, [paintCols, draw])

  const startSweep = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const step = () => {
      const next = Math.min(PLOT_W, progressRef.current + 9)
      paintCols(progressRef.current, next)
      progressRef.current = next
      draw()
      if (next < PLOT_W) rafRef.current = requestAnimationFrame(step)
      else setDone(true)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [paintCols, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) revealAll()
      else startSweep()
    },
  })

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])
  useEffect(() => { draw() }, [draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setDone(false)
    const off = offRef.current
    const octx = off?.getContext('2d')
    if (off && octx) octx.clearRect(0, 0, PLOT_W, PLOT_H)
    progressRef.current = 0
    setR(3.55)
    startSweep()
  }

  const period = detectPeriod(r)
  const label = period === 0 ? 'chaotic' : period === 1 ? 'fixed point' : `period ${period}`

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Logistic map bifurcation</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>r:</span>
          <input
            type="range" min={R_MIN} max={R_MAX} step={0.001} value={r}
            onChange={e => setR(+e.target.value)}
            className="w-52 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">{r.toFixed(3)}</span>
        </label>
        <span className="text-xs text-text-secondary">
          behaviour: <strong style={{ color: period === 0 ? BLUE : VIOLET }}>{label}</strong>
        </span>
        <span className="ml-auto text-xs text-text-muted font-mono">
          {done ? 'sweep complete' : 'sweeping r…'}
        </span>
      </div>
    </div>
  )
}
