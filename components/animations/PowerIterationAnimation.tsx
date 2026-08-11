'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300
const CX = 150
const CY = H / 2
const R = 95
const PLOT_X = 320
const PLOT_W = W - PLOT_X - 20
const PLOT_Y = 40
const PLOT_H = H - 90
const MAX_STEPS = 14

type Vec = [number, number]

const MATRICES: { name: string; m: [number, number, number, number] }[] = [
  { name: 'A = [2 1; 1 3]', m: [2, 1, 1, 3] },
  { name: 'A = [1 2; 2 1]', m: [1, 2, 2, 1] },
  { name: 'A = [3 1; 0 2]', m: [3, 1, 0, 2] },
  { name: 'A = [4 1; 2 3]', m: [4, 1, 2, 3] },
]

function normalize(v: Vec): Vec {
  const m = Math.hypot(v[0], v[1])
  return m < 1e-12 ? [1, 0] : [v[0] / m, v[1] / m]
}

function apply(m: [number, number, number, number], v: Vec): Vec {
  return [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]]
}

// Dominant eigenvalue/eigenvector of a 2x2 with real spectrum.
function dominant(m: [number, number, number, number]): { lambda: number; vec: Vec } {
  const [a, b, c, d] = m
  const tr = a + d
  const det = a * d - b * c
  const disc = Math.max(0, tr * tr - 4 * det)
  const s = Math.sqrt(disc)
  const l1 = (tr + s) / 2
  const l2 = (tr - s) / 2
  const lambda = Math.abs(l1) >= Math.abs(l2) ? l1 : l2
  let vec: Vec
  if (Math.abs(b) > 1e-9) vec = normalize([b, lambda - a])
  else if (Math.abs(c) > 1e-9) vec = normalize([lambda - d, c])
  else vec = Math.abs(lambda - a) <= Math.abs(lambda - d) ? [1, 0] : [0, 1]
  return { lambda, vec }
}

function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  color: string, width: number, head: number
) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
  if (Math.hypot(x1 - x0, y1 - y0) < 3) return
  const ang = Math.atan2(y1 - y0, x1 - x0)
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - head * Math.cos(ang - 0.4), y1 - head * Math.sin(ang - 0.4))
  ctx.lineTo(x1 - head * Math.cos(ang + 0.4), y1 - head * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  startAngle: { default: 2.3, min: 0, max: 6.28, step: 0.02 },
}

export function PowerIterationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState(0)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('power-iteration', SPEC)
  const { startAngle } = params
  const [preset, setPreset] = useState(0)

  const m = MATRICES[preset].m

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(MAX_STEPS); return }
      setRunning(true)
    },
  })

  // Full iterate history for the current start vector and matrix.
  const history = useCallback((): { v: Vec; rq: number }[] => {
    const out: { v: Vec; rq: number }[] = []
    let v: Vec = normalize([Math.cos(startAngle), Math.sin(startAngle)])
    for (let k = 0; k <= MAX_STEPS; k++) {
      const av = apply(m, v)
      out.push({ v, rq: v[0] * av[0] + v[1] * av[1] })
      v = normalize(av)
    }
    return out
  }, [m, startAngle])

  const draw = useCallback((k: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const hist = history()
    const { lambda, vec } = dominant(m)

    // ---- Left panel: the vector iterates on the unit circle ----
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let g = -2; g <= 2; g++) {
      const px = CX + g * (R / 2)
      ctx.beginPath(); ctx.moveTo(px, CY - R - 12); ctx.lineTo(px, CY + R + 12); ctx.stroke()
      const py = CY + g * (R / 2)
      ctx.beginPath(); ctx.moveTo(CX - R - 12, py); ctx.lineTo(CX + R + 12, py); ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.beginPath(); ctx.moveTo(CX - R - 20, CY); ctx.lineTo(CX + R + 20, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, CY - R - 20); ctx.lineTo(CX, CY + R + 20); ctx.stroke()

    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1.2
    ctx.stroke()

    // True dominant eigen-span (target the iterates are collapsing onto)
    ctx.beginPath()
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = 'rgba(16,185,129,0.55)'
    ctx.lineWidth = 1.5
    ctx.moveTo(CX - vec[0] * (R + 22), CY + vec[1] * (R + 22))
    ctx.lineTo(CX + vec[0] * (R + 22), CY - vec[1] * (R + 22))
    ctx.stroke()
    ctx.setLineDash([])

    // Past iterates, fading
    for (let i = 0; i < k; i++) {
      const v = hist[i].v
      const alpha = 0.12 + 0.35 * (i / Math.max(1, k))
      arrow(ctx, CX, CY, CX + v[0] * R, CY - v[1] * R, `rgba(167,139,250,${alpha.toFixed(3)})`, 1.4, 6)
    }

    // Current iterate (gold) and its raw image A·v before renormalizing (blue)
    const cur = hist[Math.min(k, MAX_STEPS)].v
    const av = apply(m, cur)
    const avn = normalize(av)
    arrow(ctx, CX, CY, CX + avn[0] * R * 1.18, CY - avn[1] * R * 1.18, 'rgba(96,165,250,0.75)', 1.8, 7)
    arrow(ctx, CX, CY, CX + cur[0] * R, CY - cur[1] * R, '#F59E0B', 2.8, 10)
    ctx.beginPath()
    ctx.arc(CX + cur[0] * R, CY - cur[1] * R, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.fillText('v_k', 14, 20)
    ctx.fillStyle = 'rgba(96,165,250,0.85)'
    ctx.fillText('normalized A·v_k', 14, 34)
    ctx.fillStyle = 'rgba(16,185,129,0.85)'
    ctx.fillText('true dominant eigenvector', 14, 48)

    // ---- Right panel: Rayleigh quotient convergence ----
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PLOT_X - 24, 0); ctx.lineTo(PLOT_X - 24, H); ctx.stroke()

    const vals = hist.map(h => h.rq)
    const lo = Math.min(lambda, ...vals) - 0.25
    const hi = Math.max(lambda, ...vals) + 0.25
    const py = (val: number) => PLOT_Y + PLOT_H * (1 - (val - lo) / (hi - lo))
    const px = (i: number) => PLOT_X + (i / MAX_STEPS) * PLOT_W

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath(); ctx.moveTo(PLOT_X, PLOT_Y); ctx.lineTo(PLOT_X, PLOT_Y + PLOT_H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(PLOT_X, PLOT_Y + PLOT_H); ctx.lineTo(PLOT_X + PLOT_W, PLOT_Y + PLOT_H); ctx.stroke()

    // Target eigenvalue line
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(16,185,129,0.7)'
    ctx.lineWidth = 1.4
    ctx.moveTo(PLOT_X, py(lambda))
    ctx.lineTo(PLOT_X + PLOT_W, py(lambda))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#10B981'
    ctx.font = '10px monospace'
    ctx.fillText(`λ₁ = ${lambda.toFixed(4)}`, PLOT_X + PLOT_W - 92, py(lambda) - 6)

    // Rayleigh quotient path so far
    ctx.beginPath()
    ctx.strokeStyle = '#A78BFA'
    ctx.lineWidth = 1.8
    for (let i = 0; i <= k; i++) {
      const x = px(i), y = py(vals[i])
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
    for (let i = 0; i <= k; i++) {
      ctx.beginPath()
      ctx.arc(px(i), py(vals[i]), i === k ? 4 : 2.2, 0, Math.PI * 2)
      ctx.fillStyle = i === k ? '#F59E0B' : '#A78BFA'
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('Rayleigh quotient  vᵀAv / vᵀv', PLOT_X, PLOT_Y - 14)
    ctx.fillText('step k', PLOT_X + PLOT_W - 40, PLOT_Y + PLOT_H + 16)

    // Numeric readout
    ctx.font = '11px monospace'
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`k = ${k}   ρ = ${vals[k].toFixed(6)}`, PLOT_X, H - 16)
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.fillText(`error = ${Math.abs(vals[k] - lambda).toExponential(1)}`, PLOT_X, H - 2)
  }, [history, m])

  useEffect(() => {
    if (!running || !visible) return
    let last = performance.now()
    const tick = (now: number) => {
      if (now - last > 700) {
        last = now
        setStep(s => {
          if (s >= MAX_STEPS) { setRunning(false); return s }
          return s + 1
        })
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, visible])

  useEffect(() => { draw(Math.min(step, MAX_STEPS)) }, [step, draw])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    setStep(0)
    triggerReset()
  }

  const hist = history()
  const { lambda } = dominant(m)
  const cur = hist[Math.min(step, MAX_STEPS)]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Power iteration</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Power iteration. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button onClick={() => { setRunning(false); setStep(s => Math.min(MAX_STEPS, s + 1)) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:border-border-hover transition-colors">
          <SkipForward size={12} /> Step
        </button>
        <select
          value={preset}
          onChange={e => { setRunning(false); setStep(0); setPreset(+e.target.value) }}
          className="px-2 py-1.5 rounded-lg border border-border bg-bg-surface text-xs text-text-secondary">
          {MATRICES.map((mm, i) => <option key={mm.name} value={i}>{mm.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>v₀ angle:</span>
          <input type="range" min={SPEC.startAngle.min} max={SPEC.startAngle.max} step={SPEC.startAngle.step} value={startAngle}
            onChange={e => { setRunning(false); setStep(0); set('startAngle', +e.target.value) }}
            className="w-24 accent-accent-violet" />
          <span className="font-mono">{startAngle.toFixed(2)}</span>
        </label>
        <WidgetStatus className="ml-auto font-mono text-xs text-accent-violet">
          ρ<sub>{step}</sub> = {cur.rq.toFixed(4)} → λ₁ = {lambda.toFixed(4)}
        </WidgetStatus>
      </div>
    </div>
  )
}
