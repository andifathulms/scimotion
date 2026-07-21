'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 290
const PAD = { left: 42, right: 18, top: 26, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const V_MAX = 50          // mL of titrant shown on the axis
const CA = 0.1            // M, analyte acid
const CB = 0.1            // M, titrant strong base
const VA = 25             // mL of acid in the flask
const V_EQ = (CA * VA) / CB          // 25 mL — the equivalence volume
const V_HALF = V_EQ / 2              // 12.5 mL — half-equivalence
const KW = 1e-14

const N = 601                        // samples across the curve
const ML_PER_FRAME = 0.16

const STRONG_PKA = -2                // effectively complete dissociation

const C_CURVE = '#FB923C'  // orange — the active titration curve
const C_GHOST = '#60A5FA'  // blue — the other acid, for comparison
const C_GOLD = '#F59E0B'   // gold — pKa / half-equivalence
const C_VIOLET = '#A78BFA' // violet — equivalence point
const C_GREEN = '#10B981'  // green — buffer region

// Exact pH from charge balance:
//   [Na+] + [H+] = [OH-] + [A-],   [A-] = Ca·Ka/(Ka+[H+])
// Solved by bisection in [H+], which is monotone and never fails.
function pHAt(vb: number, pKa: number): number {
  const Ka = Math.pow(10, -pKa)
  const v = VA + vb
  const ca = (CA * VA) / v
  const cb = (CB * vb) / v
  let lo = 1e-15
  let hi = 1
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi)
    const f = cb + mid - KW / mid - (ca * Ka) / (Ka + mid)
    if (f > 0) hi = mid
    else lo = mid
  }
  return -Math.log10(Math.sqrt(lo * hi))
}

function curveFor(pKa: number): number[] {
  const out: number[] = []
  for (let i = 0; i < N; i++) out.push(pHAt((i / (N - 1)) * V_MAX, pKa))
  return out
}

export function TitrationAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setV(V_MAX); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [v, setV] = useState(0)
  const [weak, setWeak] = useState(true)
  const [pKa, setPKa] = useState(4.76)

  const activePKa = weak ? pKa : STRONG_PKA
  const ghostPKa = weak ? STRONG_PKA : pKa

  const active = useMemo(() => curveFor(activePKa), [activePKa])
  const ghost = useMemo(() => curveFor(ghostPKa), [ghostPKa])

  const idx = Math.max(0, Math.min(N - 1, Math.round((v / V_MAX) * (N - 1))))

  const xFor = useCallback((ml: number) => PAD.left + (ml / V_MAX) * PLOT_W, [])
  const yFor = useCallback(
    (p: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(p, 14)) / 14) * PLOT_H,
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // Buffer region: roughly pKa ± 1, i.e. 10% to 90% neutralised.
    if (weak) {
      const xL = xFor(V_EQ * 0.1)
      const xR = xFor(V_EQ * 0.9)
      ctx.fillStyle = `${C_GREEN}14`
      ctx.fillRect(xL, PAD.top, xR - xL, PLOT_H)
      ctx.fillStyle = `${C_GREEN}AA`
      ctx.fillText('buffer region  (pKa ± 1)', xL + 5, PAD.top + 11)
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
    ctx.textAlign = 'right'
    for (const p of [0, 2, 4, 6, 8, 10, 12, 14]) {
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.07)'
      ctx.moveTo(PAD.left, yFor(p))
      ctx.lineTo(PAD.left + PLOT_W, yFor(p))
      ctx.stroke()
      ctx.fillText(`${p}`, PAD.left - 6, yFor(p) + 3)
    }
    ctx.textAlign = 'left'
    ctx.fillText('pH', PAD.left - 30, PAD.top - 8)
    ctx.textAlign = 'center'
    for (let ml = 0; ml <= V_MAX; ml += 10) {
      const x = xFor(ml)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PAD.top + PLOT_H)
      ctx.lineTo(x, PAD.top + PLOT_H + 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${ml}`, x, PAD.top + PLOT_H + 15)
    }
    ctx.textAlign = 'right'
    ctx.fillText('mL of 0.10 M NaOH added →', PAD.left + PLOT_W, H - 5)
    ctx.textAlign = 'left'

    // pKa / half-equivalence guides (weak acid only)
    if (weak) {
      ctx.beginPath()
      ctx.strokeStyle = `${C_GOLD}77`
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, yFor(pKa))
      ctx.lineTo(xFor(V_HALF), yFor(pKa))
      ctx.moveTo(xFor(V_HALF), yFor(pKa))
      ctx.lineTo(xFor(V_HALF), PAD.top + PLOT_H)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_GOLD
      ctx.fillText(`pH = pKa = ${pKa.toFixed(2)}`, PAD.left + 5, yFor(pKa) - 5)
      ctx.beginPath()
      ctx.arc(xFor(V_HALF), yFor(pKa), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = C_GOLD
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.fillStyle = `${C_GOLD}CC`
      ctx.fillText('half-equivalence', xFor(V_HALF), PAD.top + PLOT_H + 27)
      ctx.textAlign = 'left'
    }

    // Equivalence point
    const eqIdx = Math.round((V_EQ / V_MAX) * (N - 1))
    const eqPH = active[eqIdx]
    ctx.beginPath()
    ctx.strokeStyle = `${C_VIOLET}66`
    ctx.setLineDash([2, 5])
    ctx.lineWidth = 1
    ctx.moveTo(xFor(V_EQ), PAD.top)
    ctx.lineTo(xFor(V_EQ), PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C_VIOLET
    ctx.textAlign = 'center'
    ctx.fillText('equivalence', xFor(V_EQ), PAD.top - 8)
    ctx.textAlign = 'left'

    // Ghost curve — the other acid, drawn in full for comparison
    ctx.beginPath()
    ctx.strokeStyle = `${C_GHOST}55`
    ctx.lineWidth = 1.25
    ctx.setLineDash([4, 3])
    for (let i = 0; i < N; i++) {
      const x = xFor((i / (N - 1)) * V_MAX)
      const y = yFor(ghost[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = `${C_GHOST}AA`
    ctx.fillText(weak ? 'strong acid (for comparison)' : 'weak acid (for comparison)', PAD.left + 6, PAD.top + PLOT_H - 8)

    // Active curve, drawn up to the current volume
    ctx.beginPath()
    ctx.strokeStyle = C_CURVE
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    for (let i = 0; i <= idx; i++) {
      const x = xFor((i / (N - 1)) * V_MAX)
      const y = yFor(active[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    if (v > 0) {
      ctx.beginPath()
      ctx.arc(xFor(v), yFor(active[idx]), 4, 0, Math.PI * 2)
      ctx.fillStyle = C_CURVE
      ctx.fill()
    }

    // Equivalence marker on top of the curve, once reached
    if (v >= V_EQ) {
      ctx.beginPath()
      ctx.arc(xFor(V_EQ), yFor(eqPH), 3.5, 0, Math.PI * 2)
      ctx.fillStyle = C_VIOLET
      ctx.fill()
      ctx.fillStyle = C_VIOLET
      ctx.fillText(`pH ${eqPH.toFixed(2)}`, xFor(V_EQ) + 7, yFor(eqPH) + 3)
    }

    // Title
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(
      weak ? `25 mL of 0.10 M weak acid (pKa ${pKa.toFixed(2)})` : '25 mL of 0.10 M strong acid',
      PAD.left, 14
    )
  }, [active, ghost, idx, v, weak, pKa, xFor, yFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setV(prev => {
        const next = prev + ML_PER_FRAME
        if (next >= V_MAX) { setRunning(false); return V_MAX }
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
    setV(0)
    setWeak(true)
    setPKa(4.76)
  }

  const pH = active[idx]
  // How hard the pH is moving right now, in pH units per mL.
  const slope = Math.abs(active[Math.min(N - 1, idx + 4)] - active[Math.max(0, idx - 4)]) /
    ((8 / (N - 1)) * V_MAX)
  const inBuffer = weak && v > V_EQ * 0.1 && v < V_EQ * 0.9
  const nearEq = Math.abs(v - V_EQ) < 1.2
  const status = nearEq ? 'equivalence jump' : inBuffer ? 'buffered' : v < V_EQ ? 'acid in excess' : 'base in excess'
  const statusColor = nearEq ? C_VIOLET : inBuffer ? C_GREEN : C_CURVE

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Titration curves, buffering plateaus and the equivalence jump</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (v >= V_MAX) setV(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => { setWeak(w => !w); setV(0) }}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={
            weak
              ? { color: C_CURVE, borderColor: `${C_CURVE}44`, background: `${C_CURVE}12` }
              : { color: C_GHOST, borderColor: `${C_GHOST}44`, background: `${C_GHOST}12` }
          }
        >
          {weak ? 'Weak acid' : 'Strong acid'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Titrant added:</span>
          <input
            type="range" min={0} max={V_MAX} step={0.1} value={v}
            onChange={e => { setRunning(false); setV(+e.target.value) }}
            className="w-28 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">{v.toFixed(1)} mL</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>pKa:</span>
          <input
            type="range" min={3} max={8} step={0.05} value={pKa}
            onChange={e => setPKa(+e.target.value)}
            disabled={!weak}
            className="w-24 accent-accent-gold disabled:opacity-35"
          />
          <span className="text-text-secondary font-mono">{weak ? pKa.toFixed(2) : '—'}</span>
        </div>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
        >
          {status}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          pH = {pH.toFixed(2)} · slope {slope.toFixed(2)} pH/mL
        </span>
      </div>
    </div>
  )
}
