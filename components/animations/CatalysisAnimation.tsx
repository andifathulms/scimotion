'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 300
const PAD = { left: 54, right: 18, top: 34, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const E_TOP = 70 // kJ/mol at the top of the energy axis
const E_BOT = -30 // kJ/mol at the bottom
const E_REACT = 0 // reactant level, kJ/mol
const BARRIER_UNCAT = 52
const BARRIER_CAT = 22
const R_GAS = 8.314e-3 // kJ / (mol K)
const T_K = 298

const C_CAT = '#FB923C' // orange — the catalysed path
const C_UNCAT = '#60A5FA' // blue — the uncatalysed path
const C_LEVEL = '#F59E0B' // gold — reactant / product levels (never move)
const C_BALL = '#A78BFA' // violet — the molecule making attempts
const C_OK = '#10B981' // green — a successful crossing

// Energy profile along the reaction coordinate x ∈ [0, 1].
// A smoothstep carries the level from reactants to products; a sine-squared
// bump adds the barrier on top of it.
function profile(x: number, deltaG: number, barrier: number): number {
  const s = Math.min(1, Math.max(0, (x - 0.2) / 0.6))
  const step = s * s * (3 - 2 * s)
  const u = Math.min(1, Math.max(0, (x - 0.14) / 0.72))
  const bump = Math.sin(Math.PI * u) ** 2
  return E_REACT + deltaG * step + barrier * bump
}

function peakOf(deltaG: number, barrier: number): { x: number; e: number } {
  let bx = 0.5
  let be = -Infinity
  for (let x = 0; x <= 1.0001; x += 0.002) {
    const e = profile(x, deltaG, barrier)
    if (e > be) { be = e; bx = x }
  }
  return { x: bx, e: be }
}

type Attempt = { dir: 1 | -1; success: boolean; t: number }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  deltaG: { default: -18, min: -28, max: 8, step: 1 },
}

export function CatalysisAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const attemptRef = useRef<Attempt>({ dir: 1, success: false, t: 0 })
  const sideRef = useRef<1 | -1>(1) // 1 = sitting on the reactant side
  const catRef = useRef(0) // animated 0 → 1 as the catalyst is switched in
  const countsRef = useRef({ fwd: 0, rev: 0 })

  const [running, setRunning] = useState(false)
  const [catalyst, setCatalyst] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('catalysis', SPEC)
  const { deltaG } = params
  const [counts, setCounts] = useState({ fwd: 0, rev: 0 })

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
    const dG = deltaG
    const k = catRef.current
    const barrierNow = BARRIER_UNCAT + (BARRIER_CAT - BARRIER_UNCAT) * k

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // Energy gridlines
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
    ctx.fillText('free energy (kJ/mol)', PAD.left - 44, PAD.top - 16)
    ctx.fillText('reaction coordinate →', PAD.left + 4, H - 8)

    // The two flat levels — these are the invariants of the whole widget.
    const yR = yFor(E_REACT)
    const yP = yFor(E_REACT + dG)
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

    // Uncatalysed reference path, always drawn faintly for comparison.
    ctx.beginPath()
    ctx.strokeStyle = `${C_UNCAT}${k > 0.02 ? '66' : 'ff'}`
    ctx.lineWidth = k > 0.02 ? 1.5 : 2.5
    ctx.setLineDash(k > 0.02 ? [5, 4] : [])
    for (let x = 0; x <= 1.0001; x += 0.004) {
      const px = xFor(x)
      const py = yFor(profile(x, dG, BARRIER_UNCAT))
      if (x === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    ctx.setLineDash([])

    // Catalysed path (drawn once the catalyst is doing anything).
    if (k > 0.02) {
      ctx.beginPath()
      ctx.strokeStyle = C_CAT
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      for (let x = 0; x <= 1.0001; x += 0.004) {
        const px = xFor(x)
        const py = yFor(profile(x, dG, barrierNow))
        if (x === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    // Barrier annotations
    const pkUn = peakOf(dG, BARRIER_UNCAT)
    const pkNow = peakOf(dG, barrierNow)
    const drawBarrier = (pk: { x: number; e: number }, color: string, dx: number) => {
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
    drawBarrier(pkUn, C_UNCAT, -6)
    if (k > 0.02) drawBarrier(pkNow, C_CAT, 6)

    ctx.fillStyle = C_UNCAT
    ctx.fillText(`Eₐ = ${(pkUn.e - E_REACT).toFixed(0)}`, xFor(pkUn.x) - 78, yFor(pkUn.e) - 6)
    if (k > 0.02) {
      ctx.fillStyle = C_CAT
      ctx.fillText(`Eₐ' = ${(pkNow.e - E_REACT).toFixed(0)}`, xFor(pkNow.x) + 12, yFor(pkNow.e) - 6)
    }

    // ΔG arrow between the two immovable levels.
    const ax = PAD.left + PLOT_W - 30
    ctx.beginPath()
    ctx.strokeStyle = C_LEVEL
    ctx.lineWidth = 1.5
    ctx.moveTo(ax, yR)
    ctx.lineTo(ax, yP)
    ctx.stroke()
    for (const [y, s] of [[yR, 1], [yP, -1]] as const) {
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
    ctx.fillText(`ΔG = ${dG}`, ax - 8, (yR + yP) / 2 + 3)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('reactants', PAD.left + 6, yR - 7)
    ctx.fillText('products', PAD.left + PLOT_W - 120, yP + 15)

    // The molecule: rolling up the hill, mostly falling back.
    const at = attemptRef.current
    const side = sideRef.current
    let bx: number
    if (at.success) {
      bx = at.dir === 1 ? at.t : 1 - at.t
    } else {
      // Out to the shoulder of the barrier and back again.
      const reach = Math.sin(Math.PI * at.t) * 0.3
      bx = at.dir === 1 ? 0.08 + reach : 0.92 - reach
    }
    const by = profile(bx, dG, barrierNow)
    ctx.beginPath()
    ctx.arc(xFor(bx), yFor(by) - 6, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = at.success ? C_OK : C_BALL
    ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(side === 1 ? 'forward attempt' : 'reverse attempt', PAD.left + 6, PAD.top - 16)
  }, [xFor, yFor, deltaG])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      // Ease the barrier towards its target so the drop is visible, not abrupt.
      const target = catalyst ? 1 : 0
      catRef.current += (target - catRef.current) * 0.08
      if (Math.abs(target - catRef.current) < 0.002) catRef.current = target

      const dG = deltaG
      const barrierNow = BARRIER_UNCAT + (BARRIER_CAT - BARRIER_UNCAT) * catRef.current
      const at = attemptRef.current
      at.t += at.success ? 0.014 : 0.03

      if (at.t >= 1) {
        if (at.success) {
          sideRef.current = at.dir === 1 ? -1 : 1
          if (at.dir === 1) countsRef.current.fwd += 1
          else countsRef.current.rev += 1
          setCounts({ ...countsRef.current })
        }
        const dir = sideRef.current
        // Barrier seen from whichever side the molecule is currently on.
        const pk = peakOf(dG, barrierNow).e
        const from = dir === 1 ? E_REACT : E_REACT + dG
        const bar = pk - from
        // Illustrative Boltzmann factor — a display temperature is used so that
        // the uncatalysed reaction is rare but not invisible. The *ratio* of
        // forward to reverse attempts is the physical part, and it is fixed.
        const p = Math.exp(-bar / 17.8)
        attemptRef.current = { dir, success: Math.random() < p, t: 0 }
      }

      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, catalyst, draw, deltaG])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    setCatalyst(false)
    set('deltaG', -18)
    catRef.current = 0
    sideRef.current = 1
    attemptRef.current = { dir: 1, success: false, t: 0 }
    countsRef.current = { fwd: 0, rev: 0 }
    setCounts({ fwd: 0, rev: 0 })
    draw()
  }

  const barrier = catalyst ? BARRIER_CAT : BARRIER_UNCAT
  const pkE = peakOf(deltaG, barrier).e
  const eaF = pkE - E_REACT
  const eaR = pkE - (E_REACT + deltaG)
  const speedup = Math.exp((BARRIER_UNCAT - barrier) / (R_GAS * T_K))
  const K = Math.exp(-deltaG / (R_GAS * T_K))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · A catalyst lowers the barrier, not the destination</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: A catalyst lowers the barrier, not the destination. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setCatalyst(v => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: catalyst ? C_CAT : 'rgba(255,245,235,0.08)',
            color: catalyst ? '#1A1712' : 'rgba(245,240,232,0.7)',
          }}
        >
          {catalyst ? 'Catalyst: on' : 'Catalyst: off'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>ΔG:</span>
          <input
            type="range" min={SPEC.deltaG.min} max={SPEC.deltaG.max} step={SPEC.deltaG.step} value={deltaG}
            onChange={e => set('deltaG', +e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{deltaG} kJ/mol</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          E<sub>a</sub> fwd {eaF.toFixed(0)} · rev {eaR.toFixed(0)} · crossings {counts.fwd}/{counts.rev} ·
          K = {K.toExponential(1)} ·{' '}
          <strong style={{ color: C_CAT }}>rate ×{speedup.toExponential(1)}</strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Toggle the catalyst and watch what changes and what does not. The hill collapses; the two dashed
        gold levels — and therefore ΔG and the equilibrium constant K — do not move at all. Both barriers
        drop by the same amount, so forward and reverse crossings speed up by the same factor. Equilibrium
        arrives sooner, at exactly the same place.
      </p>
    </div>
  )
}
