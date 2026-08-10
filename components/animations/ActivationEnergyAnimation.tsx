'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

// Layout ---------------------------------------------------------------------
const W = 620
const H = 300
const PAD = { left: 56, right: 20, top: 34, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// Energy landscape (kJ/mol). These two levels are the invariants of the whole
// widget — the enzyme must never move them, because that is what "ΔG unchanged"
// means visually.
const E_TOP = 70
const E_BOT = -30
const E_REACT = 0
const E_PROD = -20 // ΔG = -20 kJ/mol, fixed
const BARRIER_OFF = 52
const BARRIER_ON = 20

// Colours
const LIME = '#A3E635' // field accent — the enzyme-catalysed path
const C_UNCAT = '#60A5FA' // blue — the uncatalysed reference path
const C_LEVEL = '#F59E0B' // gold — the immovable reactant / product levels
const C_BALL = '#A78BFA' // violet — a molecule making an attempt
const C_OK = '#10B981' // green — a successful crossing

// Deterministic PRNG (mulberry32). No Math.random / Date — reproducible frames.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Energy profile along the reaction coordinate x ∈ [0, 1]: a smoothstep carries
// the level from reactants to products, a sine-squared bump adds the barrier.
function profile(x: number, barrier: number): number {
  const s = Math.min(1, Math.max(0, (x - 0.2) / 0.6))
  const step = s * s * (3 - 2 * s)
  const u = Math.min(1, Math.max(0, (x - 0.14) / 0.72))
  const bump = Math.sin(Math.PI * u) ** 2
  return E_REACT + (E_PROD - E_REACT) * step + barrier * bump
}

function peakOf(barrier: number): { x: number; e: number } {
  let bx = 0.5
  let be = -Infinity
  for (let x = 0; x <= 1.0001; x += 0.002) {
    const e = profile(x, barrier)
    if (e > be) {
      be = e
      bx = x
    }
  }
  return { x: bx, e: be }
}

type Attempt = { dir: 1 | -1; success: boolean; t: number }

export function ActivationEnergyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const attemptRef = useRef<Attempt>({ dir: 1, success: false, t: 0 })
  const sideRef = useRef<1 | -1>(1) // 1 = on the reactant side
  const enzRef = useRef(0) // eased 0 → 1 as the enzyme is switched in
  const seedRef = useRef(0x1a2b3c)
  const rngRef = useRef(makeRng(seedRef.current))
  const statsRef = useRef({ attempts: 0, crossings: 0 })

  const [running, setRunning] = useState(false)
  const [enzyme, setEnzyme] = useState(false)
  const [stats, setStats] = useState({ attempts: 0, crossings: 0 })

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const xFor = useCallback((x: number) => PAD.left + x * PLOT_W, [])
  const yFor = useCallback(
    (e: number) => PAD.top + PLOT_H - ((e - E_BOT) / (E_TOP - E_BOT)) * PLOT_H,
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const k = enzRef.current
    const barrierNow = BARRIER_OFF + (BARRIER_ON - BARRIER_OFF) * k

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // Energy gridlines + labels
    for (let e = E_BOT; e <= E_TOP; e += 20) {
      const y = yFor(e)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.06)'
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + PLOT_W, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(`${e}`, PAD.left - 8, y + 3)
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
    ctx.fillText('free energy (kJ/mol)', PAD.left - 46, PAD.top - 18)
    ctx.fillText('reaction coordinate →', PAD.left + 4, H - 8)

    // The two flat, immovable levels — reactants and products.
    const yR = yFor(E_REACT)
    const yP = yFor(E_PROD)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = `${C_LEVEL}77`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, yR)
    ctx.lineTo(PAD.left + PLOT_W, yR)
    ctx.moveTo(PAD.left, yP)
    ctx.lineTo(PAD.left + PLOT_W, yP)
    ctx.stroke()
    ctx.setLineDash([])

    // Uncatalysed reference curve — always shown for comparison.
    ctx.beginPath()
    ctx.strokeStyle = `${C_UNCAT}${k > 0.02 ? '66' : 'ff'}`
    ctx.lineWidth = k > 0.02 ? 1.5 : 2.5
    ctx.setLineDash(k > 0.02 ? [5, 4] : [])
    for (let x = 0; x <= 1.0001; x += 0.004) {
      const px = xFor(x)
      const py = yFor(profile(x, BARRIER_OFF))
      if (x === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Enzyme-catalysed curve (once the enzyme is doing anything).
    if (k > 0.02) {
      ctx.beginPath()
      ctx.strokeStyle = LIME
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      for (let x = 0; x <= 1.0001; x += 0.004) {
        const px = xFor(x)
        const py = yFor(profile(x, barrierNow))
        if (x === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    // Barrier drop annotation
    const pkUn = peakOf(BARRIER_OFF)
    const pkNow = peakOf(barrierNow)
    const dashTo = (pk: { x: number; e: number }, color: string, dx: number) => {
      const px = xFor(pk.x) + dx
      ctx.beginPath()
      ctx.strokeStyle = `${color}88`
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.moveTo(px, yFor(pk.e))
      ctx.lineTo(px, yR)
      ctx.stroke()
      ctx.setLineDash([])
    }
    dashTo(pkUn, C_UNCAT, -6)
    if (k > 0.02) dashTo(pkNow, LIME, 6)

    ctx.fillStyle = C_UNCAT
    ctx.fillText(`Eₐ = ${(pkUn.e - E_REACT).toFixed(0)}`, xFor(pkUn.x) - 84, yFor(pkUn.e) - 6)
    if (k > 0.02) {
      ctx.fillStyle = LIME
      ctx.fillText(`Eₐ' = ${(pkNow.e - E_REACT).toFixed(0)}`, xFor(pkNow.x) + 12, yFor(pkNow.e) - 6)
    }

    // ΔG arrow between the two immovable levels — identical in both cases.
    const ax = PAD.left + PLOT_W - 34
    ctx.beginPath()
    ctx.strokeStyle = C_LEVEL
    ctx.lineWidth = 1.5
    ctx.moveTo(ax, yR)
    ctx.lineTo(ax, yP)
    ctx.stroke()
    for (const [y, s] of [
      [yR, 1],
      [yP, -1],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(ax, y)
      ctx.lineTo(ax - 3.5, y + 5 * s)
      ctx.lineTo(ax + 3.5, y + 5 * s)
      ctx.closePath()
      ctx.fillStyle = C_LEVEL
      ctx.fill()
    }
    ctx.fillStyle = C_LEVEL
    ctx.textAlign = 'right'
    ctx.fillText(`ΔG = ${E_PROD - E_REACT}`, ax - 8, (yR + yP) / 2 + 3)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('reactants', PAD.left + 6, yR - 7)
    ctx.fillText('products', PAD.left + PLOT_W - 118, yP + 15)

    // The molecule: rolling up the hill, usually falling back.
    const at = attemptRef.current
    let bx: number
    if (at.success) {
      bx = at.dir === 1 ? at.t : 1 - at.t
    } else {
      const reach = Math.sin(Math.PI * at.t) * 0.3
      bx = at.dir === 1 ? 0.08 + reach : 0.92 - reach
    }
    const by = profile(bx, barrierNow)
    ctx.beginPath()
    ctx.arc(xFor(bx), yFor(by) - 6, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = at.success ? C_OK : C_BALL
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(sideRef.current === 1 ? 'forward attempt' : 'reverse attempt', PAD.left + 6, PAD.top - 18)
  }, [xFor, yFor])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      // Ease the barrier toward its target so the collapse is visible.
      const target = enzyme ? 1 : 0
      enzRef.current += (target - enzRef.current) * 0.08
      if (Math.abs(target - enzRef.current) < 0.002) enzRef.current = target

      const barrierNow = BARRIER_OFF + (BARRIER_ON - BARRIER_OFF) * enzRef.current
      const at = attemptRef.current
      at.t += at.success ? 0.016 : 0.05

      if (at.t >= 1) {
        if (at.success) {
          sideRef.current = at.dir === 1 ? -1 : 1
          statsRef.current.crossings += 1
        }
        const dir = sideRef.current
        // Barrier as seen from the side the molecule currently sits on.
        const pk = peakOf(barrierNow).e
        const from = dir === 1 ? E_REACT : E_PROD
        const bar = pk - from
        // Illustrative Boltzmann-style factor. Uncatalysed crossings are rare
        // but not invisible; the enzyme makes them routine. Deterministic RNG.
        const p = Math.exp(-bar / 15)
        statsRef.current.attempts += 1
        attemptRef.current = { dir, success: rngRef.current() < p, t: 0 }
        setStats({ ...statsRef.current })
      }

      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, enzyme, draw])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setEnzyme(false)
    enzRef.current = 0
    sideRef.current = 1
    attemptRef.current = { dir: 1, success: false, t: 0 }
    seedRef.current = 0x1a2b3c
    rngRef.current = makeRng(seedRef.current)
    statsRef.current = { attempts: 0, crossings: 0 }
    setStats({ attempts: 0, crossings: 0 })
    draw()
  }

  const barrier = enzyme ? BARRIER_ON : BARRIER_OFF
  const pkE = peakOf(barrier).e
  const eaF = pkE - E_REACT
  const eaR = pkE - E_PROD
  const R_GAS = 8.314e-3
  const speedup = Math.exp((BARRIER_OFF - barrier) / (R_GAS * 298))
  const yieldPct = stats.attempts > 0 ? (100 * stats.crossings) / stats.attempts : 0

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Eₐ fwd <span style={{ color: LIME }}>{eaF.toFixed(0)}</span> · rev {eaR.toFixed(0)} kJ/mol
        </span>
        <span>
          ΔG <span className="text-accent-gold">{E_PROD - E_REACT}</span> (unchanged)
        </span>
        <span>crossings {stats.crossings}/{stats.attempts}</span>
        <span>attempts crossed {yieldPct.toFixed(0)}%</span>
        <span>
          rate <span style={{ color: LIME }}>×{speedup.toExponential(1)}</span>
        </span>
      </div>

      <div className="mt-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => setEnzyme(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: enzyme ? LIME : 'rgba(255,245,235,0.08)',
            color: enzyme ? '#1A1712' : 'rgba(245,240,232,0.7)',
          }}
        >
          Enzyme: {enzyme ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <span className="text-xs text-text-muted">
          Toggle the enzyme: the hill collapses, but the two gold levels — and ΔG — never move.
        </span>
      </div>
    </div>
  )
}
