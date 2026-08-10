'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const ORANGE = '#FB923C'

// Deterministic PRNG (mulberry32). A fixed seed makes every run reproducible —
// individual atoms decay at "random"-looking but fully deterministic times, and
// never Math.random() / Date.now().
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLS = 20
const ROWS = 16
const N0 = COLS * ROWS          // 320 nuclei
const T_HALF = 1                // one half-life = 1 time unit
const MAX_T = 4.2               // show just past three half-lives
const LAMBDA = Math.LN2 / T_HALF
const STEP = 0.006              // half-lives advanced per frame

// Grid geometry (left panel)
const GRID_X = 16
const GRID_Y = 30
const CELL = 11
const DOT = 3.6

// Curve geometry (right panel)
const CX = 300
const CY = 46
const CW = 280
const CH = 200

// Assign each nucleus a deterministic decay time from the exponential distribution
// via inverse-CDF sampling: t = -ln(u)/λ. Individuals are unpredictable, but the
// population count follows N0·(1/2)^(t/t½).
function makeDecayTimes(): number[] {
  const rng = mulberry32(0x9e3779b1)
  const times: number[] = []
  for (let i = 0; i < N0; i++) {
    const u = 1 - rng()            // in (0,1], avoids ln(0)
    times.push(-Math.log(u) / LAMBDA)
  }
  return times
}

const theoretical = (t: number) => Math.pow(0.5, t / T_HALF)

export function RadioactiveHalfLifeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const decayTimesRef = useRef<number[]>(makeDecayTimes())

  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)   // elapsed time in half-lives (= time units, T_HALF = 1)

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) setT(3)
      else setRunning(true)
    },
  })

  const aliveCount = decayTimesRef.current.reduce((acc, dt) => acc + (dt > t ? 1 : 0), 0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const times = decayTimesRef.current

    // ---- Left: population grid ----
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('population of unstable nuclei', GRID_X, 20)
    let alive = 0
    for (let i = 0; i < N0; i++) {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cx = GRID_X + col * CELL + CELL / 2
      const cy = GRID_Y + row * CELL + CELL / 2
      const isAlive = times[i] > t
      if (isAlive) alive++
      ctx.beginPath()
      ctx.arc(cx, cy, DOT, 0, Math.PI * 2)
      ctx.fillStyle = isAlive ? ORANGE : 'rgba(120,110,96,0.35)'
      ctx.fill()
    }

    // ---- Right: decay curve ----
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX, CY + CH)
    ctx.lineTo(CX + CW, CY + CH)
    ctx.stroke()

    const xFor = (hl: number) => CX + (hl / MAX_T) * CW
    const yFor = (frac: number) => CY + CH - frac * CH

    // gridlines + labels at 1/2, 1/4, 1/8
    ctx.font = '9px monospace'
    for (const [frac, lbl] of [[1, '100%'], [0.5, '50%'], [0.25, '25%'], [0.125, '12.5%']] as const) {
      const y = yFor(frac)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.07)'
      ctx.moveTo(CX, y); ctx.lineTo(CX + CW, y); ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.textAlign = 'right'
      ctx.fillText(lbl, CX - 4, y + 3)
    }

    // x ticks at whole half-lives
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const x = xFor(i)
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(`${i}`, x, CY + CH + 13)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('half-lives elapsed →', CX + CW / 2, CY + CH + 26)

    // smooth theoretical curve up to current t
    ctx.beginPath()
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2.5
    let started = false
    for (let x = 0; x <= t + 1e-9; x += 0.02) {
      const px = xFor(x), py = yFor(theoretical(x))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // faint full curve (the predictable aggregate) for reference
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(251,146,60,0.22)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    started = false
    for (let x = 0; x <= MAX_T + 1e-9; x += 0.04) {
      const px = xFor(x), py = yFor(theoretical(x))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // markers at 1, 2, 3 half-lives (1/2, 1/4, 1/8 — never zero)
    for (let i = 1; i <= 3; i++) {
      if (i > t + 1e-9) break
      const px = xFor(i), py = yFor(theoretical(i))
      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#F59E0B'
      ctx.fill()
      ctx.fillStyle = '#F59E0B'
      ctx.textAlign = 'left'
      ctx.font = '9px monospace'
      ctx.fillText(`${(theoretical(i) * 100).toFixed(i > 2 ? 1 : 0)}%`, px + 5, py - 4)
    }

    // actual measured fraction (random population) as a dot — usually near the curve
    if (t > 0) {
      const px = xFor(t)
      const actual = alive / N0
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(167,139,250,0.35)'
      ctx.lineWidth = 1
      ctx.moveTo(px, CY); ctx.lineTo(px, CY + CH); ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, yFor(actual), 4, 0, Math.PI * 2)
      ctx.fillStyle = '#F472B6'
      ctx.fill()
    }

    // legend
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = ORANGE
    ctx.fillText('— predicted (1/2)^n', CX + 2, CY - 8)
    ctx.fillStyle = '#F472B6'
    ctx.fillText('● measured', CX + 150, CY - 8)
  }, [t])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setT(prev => {
        const next = prev + STEP
        if (next >= MAX_T) { setRunning(false); return MAX_T }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const reset = () => {
    cancelAnimationFrame(animRef.current)
    setRunning(false)
    setT(0)
  }

  const fraction = aliveCount / N0

  return (
    <div className="animation-block" ref={ref}>
      <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />

      <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>elapsed: <strong style={{ color: ORANGE }}>{t.toFixed(2)}</strong> half-lives</span>
        <span>remaining: <strong style={{ color: ORANGE }}>{(fraction * 100).toFixed(1)}%</strong></span>
        <span>count: {aliveCount} / {N0}</span>
        <span className="text-text-muted">predicted: {(theoretical(t) * 100).toFixed(1)}%</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Time:</span>
          <input
            type="range" min={0} max={MAX_T} step={0.01} value={t}
            onChange={e => { setRunning(false); setT(+e.target.value) }}
            className="w-40"
            style={{ accentColor: ORANGE }}
          />
          <span className="text-text-secondary font-mono">{t.toFixed(2)}</span>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary ml-auto"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Each orange dot is one unstable nucleus decaying at its own unpredictable moment. No single atom
        follows a schedule — yet the <strong>count</strong> tracks the smooth curve N = N&#8320;(1/2)ⁿ,
        halving at each marker (50% then 25% then 12.5%) and never quite reaching zero.
      </p>
    </div>
  )
}
