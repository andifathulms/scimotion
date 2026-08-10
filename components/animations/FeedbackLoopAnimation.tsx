'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 310

// --- response plot geometry -------------------------------------------------
const PLOT_L = 46
const PLOT_R = W - 14
const PLOT_T = 186
const PLOT_B = H - 28

const V_LO = 40           // bottom of the value axis
const V_HI = 190          // top of the value axis
const SETPOINT = 100
const BAND = 15           // ± band drawn around the setpoint

// --- loop model -------------------------------------------------------------
const MAX_T = 12          // arbitrary time units
const DT = 0.01
const LEAK = 0.12         // passive return to setpoint without any feedback
const DELAY = 0.35        // sensing + effector delay, in time units
const U_UP = 140          // saturation of the corrective effort
const U_DOWN = 49         // saturation in the opposite direction
const DIST_T = 1.0        // when the disturbance arrives
const DIST_K = 2.2        // disturbance shape constant
const DIST_A = 90         // disturbance amplitude

const N_STEPS = Math.round(MAX_T / DT)
const LAG = Math.round(DELAY / DT)
const FRAME_T = 0.055     // time units advanced per frame

const C_VAR = '#F472B6'     // pink — the controlled variable
const C_SIGNAL = '#F59E0B'  // gold — the signal travelling the loop
const C_SET = '#60A5FA'     // blue — setpoint
const C_DIST = '#A78BFA'    // violet — disturbance
const C_OK = '#10B981'      // green — tolerance band

function simulate(gain: number): number[] {
  const x = new Array<number>(N_STEPS + 1)
  x[0] = SETPOINT
  for (let i = 0; i < N_STEPS; i++) {
    const u = i * DT - DIST_T
    const disturbance = u > 0 ? DIST_A * DIST_K * DIST_K * u * Math.exp(-DIST_K * u) : 0
    const sensed = x[Math.max(0, i - LAG)] - SETPOINT
    const control = Math.max(-U_DOWN, Math.min(U_UP, gain * sensed))
    x[i + 1] = x[i] + DT * (disturbance - control - LEAK * (x[i] - SETPOINT))
  }
  return x
}

// --- loop diagram -----------------------------------------------------------
type Box = { x: number; y: number; w: number; h: number; top: string; sub: string }

const SUM = { x: 52, y: 60, r: 13 }
const NODES: Box[] = [
  { x: 100, y: 42, w: 96, h: 36, top: 'CONTROLLER', sub: 'β-cell' },
  { x: 238, y: 42, w: 96, h: 36, top: 'EFFECTOR', sub: 'insulin action' },
  { x: 396, y: 42, w: 118, h: 36, top: 'PLANT', sub: 'blood glucose' },
  { x: 238, y: 116, w: 96, h: 34, top: 'SENSOR', sub: 'glucose sensing' },
]

// Closed path the signal travels: Σ → controller → effector → plant → sensor → Σ.
const PATH: [number, number][] = [
  [SUM.x, SUM.y], [148, 60], [286, 60], [455, 60],
  [552, 60], [552, 133], [286, 133], [SUM.x, 133], [SUM.x, SUM.y],
]

const SEG_LEN: number[] = []
let TOTAL_LEN = 0
for (let i = 0; i < PATH.length - 1; i++) {
  const d = Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1])
  SEG_LEN.push(d)
  TOTAL_LEN += d
}

function pointAt(frac: number): [number, number] {
  let want = ((frac % 1) + 1) % 1 * TOTAL_LEN
  for (let i = 0; i < SEG_LEN.length; i++) {
    if (want <= SEG_LEN[i]) {
      const s = SEG_LEN[i] === 0 ? 0 : want / SEG_LEN[i]
      return [
        PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * s,
        PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * s,
      ]
    }
    want -= SEG_LEN[i]
  }
  return PATH[PATH.length - 1]
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string) {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  ctx.beginPath()
  ctx.moveTo(x + ux * 5, y + uy * 5)
  ctx.lineTo(x - ux * 4 + uy * 3.5, y - uy * 4 - ux * 3.5)
  ctx.lineTo(x - ux * 4 - uy * 3.5, y - uy * 4 + ux * 3.5)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  gain: { default: 3, min: 0, max: 12, step: 0.5 },
}

export function FeedbackLoopAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setT(MAX_T); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('feedback-loop', SPEC)
  const { gain } = params

  const trace = useMemo(() => simulate(gain), [gain])
  const idx = Math.max(0, Math.min(N_STEPS, Math.round(t / DT)))

  const xFor = useCallback((time: number) => PLOT_L + (time / MAX_T) * (PLOT_R - PLOT_L), [])
  const yFor = useCallback(
    (v: number) => PLOT_B - ((Math.max(V_LO, Math.min(V_HI, v)) - V_LO) / (V_HI - V_LO)) * (PLOT_B - PLOT_T),
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

    // ---- loop diagram ----
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.moveTo(PATH[0][0], PATH[0][1])
    for (let i = 1; i < PATH.length; i++) ctx.lineTo(PATH[i][0], PATH[i][1])
    ctx.stroke()

    for (const [ax, ay, dx, dy] of [
      [216, 60, 1, 0], [362, 60, 1, 0], [552, 100, 0, 1], [200, 133, -1, 0], [52, 92, 0, -1],
    ]) {
      arrow(ctx, ax, ay, dx, dy, 'rgba(245,240,232,0.3)')
    }

    // Comparator
    ctx.beginPath()
    ctx.arc(SUM.x, SUM.y, SUM.r, 0, Math.PI * 2)
    ctx.strokeStyle = C_SET
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = C_SET
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('−', SUM.x, SUM.y + 4)
    ctx.font = '9px monospace'
    ctx.fillText('setpoint', SUM.x, 22)
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('90 mg/dL', SUM.x, 32)
    ctx.beginPath()
    ctx.strokeStyle = `${C_SET}88`
    ctx.lineWidth = 1
    ctx.moveTo(SUM.x, 36)
    ctx.lineTo(SUM.x, SUM.y - SUM.r - 3)
    ctx.stroke()
    arrow(ctx, SUM.x, SUM.y - SUM.r - 3, 0, 1, C_SET)

    // Boxes
    for (const n of NODES) {
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.28)'
      ctx.lineWidth = 1
      ctx.fillStyle = 'rgba(245,240,232,0.035)'
      ctx.rect(n.x, n.y, n.w, n.h)
      ctx.fill()
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(245,240,232,0.75)'
      ctx.fillText(n.top, n.x + n.w / 2, n.y + 15)
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(n.sub, n.x + n.w / 2, n.y + 27)
    }

    // Gain annotation on the controller
    ctx.fillStyle = C_SIGNAL
    ctx.textAlign = 'center'
    ctx.fillText(`gain K = ${gain.toFixed(1)}`, 148, 92)

    // Disturbance into the plant
    ctx.beginPath()
    ctx.strokeStyle = C_DIST
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1.25
    ctx.moveTo(455, 20)
    ctx.lineTo(455, 39)
    ctx.stroke()
    ctx.setLineDash([])
    arrow(ctx, 455, 41, 0, 1, C_DIST)
    ctx.fillStyle = C_DIST
    ctx.fillText('disturbance (a meal)', 455, 16)

    // Travelling signal
    const phase = t / MAX_T
    for (let d = 0; d < 3; d++) {
      const [px, py] = pointAt(phase * 2.6 - d * 0.035)
      ctx.beginPath()
      ctx.arc(px, py, d === 0 ? 4 : 2.5, 0, Math.PI * 2)
      ctx.fillStyle = d === 0 ? C_SIGNAL : `${C_SIGNAL}66`
      ctx.fill()
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('measured value fed back', 200, 148)

    // ---- response plot ----
    const bandTop = yFor(SETPOINT + BAND)
    const bandBot = yFor(SETPOINT - BAND)
    ctx.fillStyle = `${C_OK}1A`
    ctx.fillRect(PLOT_L, bandTop, PLOT_R - PLOT_L, bandBot - bandTop)

    ctx.beginPath()
    ctx.strokeStyle = `${C_SET}88`
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.moveTo(PLOT_L, yFor(SETPOINT))
    ctx.lineTo(PLOT_R, yFor(SETPOINT))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = `${C_SET}AA`
    ctx.fillText('setpoint', PLOT_L + 4, yFor(SETPOINT) - 4)

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, PLOT_T)
    ctx.lineTo(PLOT_L, PLOT_B)
    ctx.lineTo(PLOT_R, PLOT_B)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.textAlign = 'right'
    for (const v of [40, 100, 160]) ctx.fillText(`${v}`, PLOT_L - 6, yFor(v) + 3)
    ctx.textAlign = 'left'
    ctx.fillText('regulated variable over time →', PLOT_L + 4, H - 6)

    // Disturbance marker
    const dx0 = xFor(DIST_T)
    ctx.beginPath()
    ctx.strokeStyle = `${C_DIST}88`
    ctx.setLineDash([3, 3])
    ctx.moveTo(dx0, PLOT_T)
    ctx.lineTo(dx0, PLOT_B)
    ctx.stroke()
    ctx.setLineDash([])

    // Trace
    ctx.beginPath()
    ctx.strokeStyle = C_VAR
    ctx.lineWidth = 2.25
    ctx.lineJoin = 'round'
    for (let i = 0; i <= idx; i += 2) {
      const x = xFor(i * DT)
      const y = yFor(trace[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    if (t > 0 && t < MAX_T) {
      ctx.beginPath()
      ctx.arc(xFor(idx * DT), yFor(trace[idx]), 3.75, 0, Math.PI * 2)
      ctx.fillStyle = C_VAR
      ctx.fill()
    }
  }, [t, idx, gain, trace, xFor, yFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setT(prev => {
        const next = prev + FRAME_T
        if (next >= MAX_T) { setRunning(false); return MAX_T }
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
    setT(0)
    set('gain', 3)
  }

  let peak = SETPOINT
  let trough = SETPOINT
  for (let i = 0; i <= N_STEPS; i++) {
    if (trace[i] > peak) peak = trace[i]
    if (trace[i] < trough) trough = trace[i]
  }
  const finalErr = Math.abs(trace[N_STEPS] - SETPOINT)
  const regime =
    gain < 0.8 ? 'too little feedback — it drifts'
      : gain <= 6 ? 'well regulated'
        : 'over-gained — overshoot and oscillation'
  const regimeColor = gain < 0.8 ? C_DIST : gain <= 6 ? C_OK : C_SIGNAL

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Loop gain, overshoot, and the cost of delay</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Loop gain, overshoot, and the cost of delay. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Loop gain K:</span>
          <input
            type="range" min={SPEC.gain.min} max={SPEC.gain.max} step={SPEC.gain.step} value={gain}
            onChange={e => { set('gain', +e.target.value); setT(0) }}
            className="w-32 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{gain.toFixed(1)}</span>
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: regimeColor, borderColor: `${regimeColor}30`, background: `${regimeColor}10` }}
        >
          {regime}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          peak {peak.toFixed(0)} · trough {trough.toFixed(0)} · residual error {finalErr.toFixed(0)}
        </WidgetStatus>
      </div>
    </div>
  )
}
