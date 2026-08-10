'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 360

// Attractor panel
const A_TOP = 14
const A_H = 200
// Separation panel
const PAD_L = 46
const PAD_R = 14
const S_TOP = A_TOP + A_H + 30
const S_H = H - S_TOP - 26
const PLOT_W = W - PAD_L - PAD_R

// Lorenz parameters (the classic values)
const SIGMA = 10
const RHO = 28
const BETA = 8 / 3
const DT = 0.005
const STEPS_PER_FRAME = 6
const T_MAX = 40
const LAMBDA = 0.906 // known largest Lyapunov exponent of the Lorenz system

const GOLD = '#F59E0B'
const PINK = '#F472B6'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

type Vec = { x: number; y: number; z: number }

function lorenzStep(p: Vec): Vec {
  // Classical RK4 on the Lorenz field.
  const f = (v: Vec): Vec => ({
    x: SIGMA * (v.y - v.x),
    y: v.x * (RHO - v.z) - v.y,
    z: v.x * v.y - BETA * v.z,
  })
  const add = (a: Vec, b: Vec, s: number): Vec => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s })
  const k1 = f(p)
  const k2 = f(add(p, k1, DT / 2))
  const k3 = f(add(p, k2, DT / 2))
  const k4 = f(add(p, k3, DT))
  return {
    x: p.x + (DT / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: p.y + (DT / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: p.z + (DT / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  }
}

const START: Vec = { x: 1, y: 1, z: 20 }

// x-z projection of the attractor into the top panel.
const px = (x: number) => W / 2 + x * 9
const pz = (z: number) => A_TOP + A_H - (z / 52) * (A_H - 10)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  expo: { default: -6, min: -10, max: -2, step: 1 },
}

export function ButterflyEffectAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const stateRef = useRef({
    a: { ...START },
    b: { ...START },
    trailA: [] as { x: number; y: number }[],
    trailB: [] as { x: number; y: number }[],
    sep: [] as { t: number; d: number }[],
    t: 0,
  })

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('butterfly-effect', SPEC)
  const { expo } = params
  const [tNow, setTNow] = useState(0)

  const eps = Math.pow(10, expo)

  const init = useCallback((e: number) => {
    stateRef.current = {
      a: { ...START },
      b: { ...START, x: START.x + e },
      trailA: [],
      trailB: [],
      sep: [],
      t: 0,
    }
    setTNow(0)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const s = stateRef.current

    // ---- attractor panel ----
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, A_TOP); ctx.lineTo(gx, A_TOP + A_H); ctx.stroke() }
    for (let gy = A_TOP; gy < A_TOP + A_H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    const trail = (pts: { x: number; y: number }[], color: string) => {
      if (pts.length < 2) return
      for (let i = 1; i < pts.length; i++) {
        const alpha = (i / pts.length) * 0.85
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y)
        ctx.lineTo(pts[i].x, pts[i].y)
        ctx.strokeStyle = color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx.lineWidth = 1.3
        ctx.stroke()
      }
    }
    trail(s.trailA, GOLD)
    trail(s.trailB, PINK)

    const head = (p: Vec, color: string) => {
      const hx = px(p.x)
      const hy = pz(p.z)
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 12)
      g.addColorStop(0, color + '66')
      g.addColorStop(1, color + '00')
      ctx.beginPath(); ctx.arc(hx, hy, 12, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
    }
    head(s.a, GOLD)
    head(s.b, PINK)

    ctx.font = '10px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('trajectory A', 10, A_TOP + 14)
    ctx.fillStyle = PINK
    ctx.fillText(`trajectory B  (x₀ + ${eps.toExponential(0)})`, 10, A_TOP + 28)

    // ---- separation panel (log scale) ----
    const logMin = Math.min(-10, Math.log10(eps) - 1)
    const logMax = 2
    const sx = (t: number) => PAD_L + (t / T_MAX) * PLOT_W
    const sy = (logd: number) => S_TOP + S_H - ((logd - logMin) / (logMax - logMin)) * S_H

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_L, S_TOP)
    ctx.lineTo(PAD_L, S_TOP + S_H)
    ctx.lineTo(PAD_L + PLOT_W, S_TOP + S_H)
    ctx.stroke()

    ctx.font = '9px monospace'
    for (let e = Math.ceil(logMin); e <= logMax; e += 2) {
      const gy = sy(e)
      if (gy < S_TOP || gy > S_TOP + S_H) continue
      ctx.strokeStyle = 'rgba(255,245,235,0.05)'
      ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(PAD_L + PLOT_W, gy); ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(`1e${e}`, 6, gy + 3)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('separation |A − B|', PAD_L + 4, S_TOP - 8)
    ctx.fillText('t', PAD_L + PLOT_W - 4, S_TOP + S_H + 16)

    // predicted slope λ / ln(10) per unit time
    const slope = LAMBDA / Math.LN10
    ctx.strokeStyle = 'rgba(16,185,129,0.55)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.25
    ctx.beginPath()
    const y0 = sy(Math.log10(eps))
    const tEnd = Math.min(T_MAX, (logMax - Math.log10(eps)) / slope)
    ctx.moveTo(sx(0), y0)
    ctx.lineTo(sx(tEnd), sy(Math.log10(eps) + slope * tEnd))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = GREEN
    ctx.font = '9px monospace'
    ctx.fillText('slope = λ / ln10', sx(tEnd) - 84, sy(logMax) + 22)

    // measured separation curve
    if (s.sep.length > 1) {
      ctx.strokeStyle = VIOLET
      ctx.lineWidth = 1.75
      ctx.beginPath()
      s.sep.forEach((p, i) => {
        const yy = Math.max(S_TOP, Math.min(S_TOP + S_H, sy(Math.log10(Math.max(p.d, 1e-16)))))
        if (i === 0) ctx.moveTo(sx(p.t), yy)
        else ctx.lineTo(sx(p.t), yy)
      })
      ctx.stroke()
    }

    // saturation ceiling — separation cannot exceed the attractor's size
    const satY = sy(Math.log10(30))
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.setLineDash([2, 4])
    ctx.beginPath(); ctx.moveTo(PAD_L, satY); ctx.lineTo(PAD_L + PLOT_W, satY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('attractor size', PAD_L + PLOT_W - 82, satY - 4)
  }, [eps])

  useEffect(() => {
    init(eps)
    draw()
  }, [eps, init, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const s = stateRef.current
      for (let i = 0; i < STEPS_PER_FRAME && s.t < T_MAX; i++) {
        s.a = lorenzStep(s.a)
        s.b = lorenzStep(s.b)
        s.t += DT
        const dx = s.a.x - s.b.x, dy = s.a.y - s.b.y, dz = s.a.z - s.b.z
        s.sep.push({ t: s.t, d: Math.sqrt(dx * dx + dy * dy + dz * dz) })
      }
      s.trailA.push({ x: px(s.a.x), y: pz(s.a.z) })
      s.trailB.push({ x: px(s.b.x), y: pz(s.b.z) })
      if (s.trailA.length > 260) s.trailA.shift()
      if (s.trailB.length > 260) s.trailB.shift()
      setTNow(s.t)
      draw()
      if (s.t >= T_MAX) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    init(eps)
    draw()
  }

  const horizon = Math.log(1 / eps) / LAMBDA
  const current = stateRef.current.sep.length
    ? stateRef.current.sep[stateRef.current.sep.length - 1].d
    : eps

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Sensitive dependence (Lorenz)</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Sensitive dependence (Lorenz). Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>ε:</span>
          <input
            type="range" min={SPEC.expo.min} max={SPEC.expo.max} step={SPEC.expo.step} value={expo}
            onChange={e => { setRunning(false); set('expo', +e.target.value) }}
            className="w-28 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">1e{expo}</span>
        </label>
        <span className="text-xs text-text-secondary font-mono">
          t = {tNow.toFixed(1)} · |A−B| = {current.toExponential(1)}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          horizon ≈ <strong className="text-accent-violet">{horizon.toFixed(1)}</strong> time units
        </WidgetStatus>
      </div>
    </div>
  )
}
