'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320

const ORANGE = '#FB923C'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'
const INK = '#F5F0E8'

// --- Geometry -------------------------------------------------------------
const ZN_X = 158
const CU_X = 442
const CY = 150
const R = 40

// Two electrons cross the gap on a shallow arc, staggered in time.
// e0 travels while p ∈ [0.05, 0.45]; e1 while p ∈ [0.55, 0.95].
const E_START = [0.05, 0.55]
const E_SPAN = 0.4

function eProgress(p: number, i: number): number {
  return Math.max(0, Math.min(1, (p - E_START[i]) / E_SPAN))
}

// Quadratic bezier from the zinc surface, up over the gap, down to the copper surface.
function flightPoint(t: number): { x: number; y: number } {
  const sx = ZN_X + R + 6
  const ex = CU_X - R - 6
  const cx = (sx + ex) / 2
  const cy = 72
  const u = 1 - t
  return {
    x: u * u * sx + 2 * u * t * cx + t * t * ex,
    y: u * u * CY + 2 * u * t * cy + t * t * CY,
  }
}

export function RedoxTransferAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0)          // raw progress, allowed to run past 1 for a hold
  const holdRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [p, setP] = useState(0)  // display progress, clamped to [0,1]

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { pRef.current = 1; setP(1); return }
      setRunning(true)
    },
  })

  const draw = useCallback((prog: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)

    const e0 = eProgress(prog, 0)
    const e1 = eProgress(prog, 1)
    // An electron has "left" zinc once it starts moving, and "arrived" at copper at t = 1.
    const leftZn = (e0 > 0.02 ? 1 : 0) + (e1 > 0.02 ? 1 : 0)
    const arrivedCu = (e0 >= 1 ? 1 : 0) + (e1 >= 1 ? 1 : 0)
    const znState = leftZn            // 0 → +2 as electrons leave
    const cuState = 2 - arrivedCu     // +2 → 0 as electrons arrive
    const inFlight = leftZn - arrivedCu

    // --- Title -------------------------------------------------------------
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = INK
    ctx.textAlign = 'left'
    ctx.fillText('Zn  +  Cu²⁺  →  Zn²⁺  +  Cu', 16, 26)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('electrons transferred: ' + arrivedCu + ' / 2', 16, 44)
    if (inFlight > 0) {
      ctx.fillStyle = BLUE
      ctx.textAlign = 'right'
      ctx.fillText(inFlight + ' electron' + (inFlight > 1 ? 's' : '') + ' in transit', W - 16, 26)
      ctx.textAlign = 'left'
    } else if (arrivedCu === 2) {
      ctx.fillStyle = GREEN
      ctx.textAlign = 'right'
      ctx.fillText('transfer complete', W - 16, 26)
      ctx.textAlign = 'left'
    }

    // --- Zinc atom (reducing agent, oxidized) ------------------------------
    ctx.beginPath()
    ctx.arc(ZN_X, CY, R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(251,146,60,0.14)'
    ctx.fill()
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    ctx.fillText('Zn', ZN_X, CY + 8)

    // Oxidation-state badge
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText(znState === 0 ? '0' : '+' + znState, ZN_X, CY - R - 12)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('oxidation state', ZN_X, CY - R - 26)

    // --- Copper ion (oxidizing agent, reduced) -----------------------------
    ctx.beginPath()
    ctx.arc(CU_X, CY, R, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,158,11,0.14)'
    ctx.fill()
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = INK
    ctx.fillText('Cu', CU_X, CY + 8)

    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText(cuState === 0 ? '0' : '+' + cuState, CU_X, CY - R - 12)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('oxidation state', CU_X, CY - R - 26)

    // --- Electrons ---------------------------------------------------------
    // Resting slots: on zinc if not yet moving, on copper once arrived.
    const drawElectron = (x: number, y: number, glow: boolean) => {
      if (glow) {
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(96,165,250,0.20)'
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = BLUE
      ctx.fill()
      ctx.font = 'bold 8px monospace'
      ctx.fillStyle = '#0F0D0A'
      ctx.fillText('-', x, y + 3)
    }

    const restZn: [number, number][] = [[ZN_X - 16, CY - R + 6], [ZN_X + 16, CY - R + 6]]
    const restCu: [number, number][] = [[CU_X - 16, CY - R + 6], [CU_X + 16, CY - R + 6]]

    for (let i = 0; i < 2; i++) {
      const ep = i === 0 ? e0 : e1
      if (ep <= 0.02) {
        const [rx, ry] = restZn[i]
        drawElectron(rx, ry, false)
      } else if (ep >= 1) {
        const [rx, ry] = restCu[i]
        drawElectron(rx, ry, false)
      } else {
        const pt = flightPoint(ep)
        drawElectron(pt.x, pt.y, true)
      }
    }

    // Flight guide arc (faint)
    ctx.strokeStyle = 'rgba(96,165,250,0.18)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    const g0 = flightPoint(0)
    ctx.moveTo(g0.x, g0.y)
    for (let t = 0.05; t <= 1.001; t += 0.05) {
      const g = flightPoint(t)
      ctx.lineTo(g.x, g.y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    // Direction arrowhead near the top of the arc
    const tip = flightPoint(0.5)
    const tipL = flightPoint(0.44)
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(tipL.x, tipL.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x - 8, tip.y - 4)
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(tip.x - 8, tip.y + 4)
    ctx.stroke()
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(96,165,250,0.7)'
    ctx.textAlign = 'center'
    ctx.fillText('2e⁻', (ZN_X + CU_X) / 2, 60)

    // --- Agent / process labels -------------------------------------------
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = ORANGE
    ctx.fillText('REDUCING AGENT', ZN_X, CY + R + 26)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('loses e⁻ → oxidized', ZN_X, CY + R + 42)
    ctx.fillText('Zn → Zn²⁺ + 2e⁻', ZN_X, CY + R + 58)

    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('OXIDIZING AGENT', CU_X, CY + R + 26)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('gains e⁻ → reduced', CU_X, CY + R + 42)
    ctx.fillText('Cu²⁺ + 2e⁻ → Cu', CU_X, CY + R + 58)

    ctx.textAlign = 'left'
  }, [])

  // --- Animation loop -----------------------------------------------------
  useEffect(() => {
    if (!running) return
    const tick = () => {
      let pr = pRef.current
      if (holdRef.current) {
        pr += 0.01
        if (pr >= 1.35) { pr = 0; holdRef.current = false }
      } else {
        pr += 0.006
        if (pr >= 1) { pr = 1; holdRef.current = true }
      }
      pRef.current = pr
      const disp = Math.min(1, pr)
      setP(disp)
      draw(disp)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => { if (!running) draw(p) }, [running, p, draw])

  const step = () => {
    setRunning(false)
    holdRef.current = false
    const next = Math.min(1, Math.round((pRef.current + 0.25) * 100) / 100)
    const wrapped = pRef.current >= 1 ? 0 : next
    pRef.current = wrapped
    setP(wrapped)
    draw(wrapped)
  }

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    holdRef.current = false
    pRef.current = 0
    setP(0)
    draw(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · One electron handover at a time</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-orange text-bg-base text-xs font-medium hover:bg-accent-orange/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={step}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
          style={{ color: BLUE, borderColor: `${BLUE}55`, background: `${BLUE}14` }}
        >
          <ChevronRight size={12} /> Step
        </button>
        <span className="ml-auto text-xs font-mono" style={{ color: VIOLET }}>
          Zn {p < 0.03 ? '0' : '+' + ((eProgress(p, 0) > 0.02 ? 1 : 0) + (eProgress(p, 1) > 0.02 ? 1 : 0))}
          {'  ·  '}
          Cu +{2 - ((eProgress(p, 0) >= 1 ? 1 : 0) + (eProgress(p, 1) >= 1 ? 1 : 0))}
        </span>
      </div>
    </div>
  )
}
