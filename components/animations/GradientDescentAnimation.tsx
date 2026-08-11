'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 280
const PAD = { left: 40, right: 16, top: 18, bottom: 42 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const X_MIN = -4
const X_MAX = 4
const Y_MIN = -1
const Y_MAX = 6.2

const MAX_STEPS = 60
const BLOWUP = 8

const CURVE = '#A78BFA'
const BALL = '#F59E0B'
const ARROW = '#F472B6'
const TRAIL = '#60A5FA'
const MINIMA = '#10B981'

// Double-well loss: a deep global minimum on the left, a shallow local one on the right.
function loss(x: number): number {
  return 0.05 * x * x * x * x - 0.6 * x * x + 0.15 * x + 2
}
function grad(x: number): number {
  return 0.2 * x * x * x - 1.2 * x + 0.15
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

type Run = { pts: number[]; diverged: boolean; converged: boolean }

function buildRun(x0: number, eta: number): Run {
  const pts = [x0]
  let x = x0
  let diverged = false
  let converged = false
  for (let i = 0; i < MAX_STEPS; i++) {
    const g = grad(x)
    const next = x - eta * g
    if (!Number.isFinite(next) || Math.abs(next) > BLOWUP) {
      pts.push(clamp(next, -BLOWUP, BLOWUP))
      diverged = true
      break
    }
    pts.push(next)
    if (Math.abs(next - x) < 1e-7) { converged = true; break }
    x = next
  }
  return { pts, diverged, converged }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  eta: { default: 0.3, min: 0.02, max: 2, step: 0.01 },
  startX: { default: 3.4, min: -3.8, max: 3.8, step: 0.05 },
}

export function GradientDescentAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('gradient-descent', SPEC)
  const { eta, startX } = params
  const [run, setRun] = useState<Run>(() => buildRun(3.4, 0.3))
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const draggingRef = useRef(false)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) return
      setStep(0)
      setRunning(true)
    },
  })

  const toPx = useCallback(
    (x: number) => PAD.left + ((x - X_MIN) / (X_MAX - X_MIN)) * PLOT_W,
    [],
  )
  const toPy = useCallback(
    (y: number) => PAD.top + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * PLOT_H,
    [],
  )

  useEffect(() => {
    setRun(buildRun(startX, eta))
    setStep(0)
  }, [startX, eta])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = X_MIN; gx <= X_MAX; gx++) {
      const px = toPx(gx)
      ctx.beginPath()
      ctx.moveTo(px, PAD.top)
      ctx.lineTo(px, PAD.top + PLOT_H)
      ctx.stroke()
    }
    for (let gy = 0; gy <= Y_MAX; gy += 2) {
      const py = toPy(gy)
      ctx.beginPath()
      ctx.moveTo(PAD.left, py)
      ctx.lineTo(PAD.left + PLOT_W, py)
      ctx.stroke()
    }

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('loss f(x)', PAD.left - 2, PAD.top - 6)
    ctx.fillText('x', PAD.left + PLOT_W - 8, PAD.top + PLOT_H + 24)
    for (let gx = X_MIN; gx <= X_MAX; gx += 2) {
      ctx.fillText(`${gx}`, toPx(gx) - 4, PAD.top + PLOT_H + 14)
    }

    // loss curve
    ctx.strokeStyle = CURVE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let px = 0; px <= PLOT_W; px++) {
      const x = X_MIN + (px / PLOT_W) * (X_MAX - X_MIN)
      const py = clamp(toPy(loss(x)), PAD.top - 40, PAD.top + PLOT_H + 40)
      if (px === 0) ctx.moveTo(PAD.left + px, py)
      else ctx.lineTo(PAD.left + px, py)
    }
    ctx.stroke()

    // the two basin floors
    ctx.fillStyle = `${MINIMA}55`
    for (const m of [-2.554, 2.428]) {
      ctx.beginPath()
      ctx.arc(toPx(m), toPy(loss(m)), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    const visible = run.pts.slice(0, step + 1)

    // trail of previous iterates
    for (let i = 0; i < visible.length - 1; i++) {
      const xi = visible[i]
      const alpha = 0.15 + 0.45 * ((i + 1) / visible.length)
      const px = toPx(clamp(xi, X_MIN, X_MAX))
      const py = clamp(toPy(loss(clamp(xi, X_MIN, X_MAX))), PAD.top, PAD.top + PLOT_H)
      ctx.fillStyle = TRAIL
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fill()
      const xn = clamp(visible[i + 1], X_MIN, X_MAX)
      ctx.strokeStyle = TRAIL
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(toPx(xn), clamp(toPy(loss(xn)), PAD.top, PAD.top + PLOT_H))
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // current iterate
    const raw = visible[visible.length - 1]
    const cur = clamp(raw, X_MIN, X_MAX)
    const curY = loss(cur)
    const cpx = toPx(cur)
    const cpy = clamp(toPy(curY), PAD.top, PAD.top + PLOT_H)
    const g = grad(cur)

    // tangent segment at the current point (the slope the walker feels)
    const dx = 0.85
    ctx.strokeStyle = `${BALL}90`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(toPx(cur - dx), clamp(toPy(curY - g * dx), PAD.top - 30, PAD.top + PLOT_H + 30))
    ctx.lineTo(toPx(cur + dx), clamp(toPy(curY + g * dx), PAD.top - 30, PAD.top + PLOT_H + 30))
    ctx.stroke()

    // step arrow: -eta * f'(x), the move about to be taken
    const stepLen = -eta * g
    if (Math.abs(stepLen) > 0.01) {
      const ax0 = cpx
      const ax1 = toPx(clamp(cur + stepLen, X_MIN - 0.4, X_MAX + 0.4))
      const ay = cpy + 18
      ctx.strokeStyle = ARROW
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ax0, ay)
      ctx.lineTo(ax1, ay)
      ctx.stroke()
      const dir = ax1 > ax0 ? 1 : -1
      ctx.fillStyle = ARROW
      ctx.beginPath()
      ctx.moveTo(ax1, ay)
      ctx.lineTo(ax1 - dir * 7, ay - 4)
      ctx.lineTo(ax1 - dir * 7, ay + 4)
      ctx.closePath()
      ctx.fill()
      ctx.fillText('−η∇f', (ax0 + ax1) / 2 - 14, ay + 16)
    }

    // the ball
    ctx.fillStyle = BALL
    ctx.beginPath()
    ctx.arc(cpx, cpy, 6, 0, Math.PI * 2)
    ctx.fill()

    if (run.diverged && step >= run.pts.length - 1) {
      ctx.fillStyle = ARROW
      ctx.font = '12px monospace'
      ctx.fillText('diverged — η too large', PAD.left + 8, PAD.top + 14)
    }
  }, [run, step, eta, toPx, toPy])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    const id = setInterval(() => {
      setStep(s => {
        if (s >= run.pts.length - 1) {
          setRunning(false)
          return run.pts.length - 1
        }
        return s + 1
      })
    }, 420)
    return () => clearInterval(id)
  }, [running, run, visible])

  const pickX = useCallback((clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    const x = X_MIN + ((px - PAD.left) / PLOT_W) * (X_MAX - X_MIN)
    set('startX', clamp(Math.round(x * 20) / 20, X_MIN + 0.2, X_MAX - 0.2))
    setRunning(false)
  }, [set])

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    pickX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) pickX(e.clientX)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStep(0)
  }

  const curX = run.pts[Math.min(step, run.pts.length - 1)]
  const done = step >= run.pts.length - 1
  const settled = run.converged && done
  const oscillating = done && !run.converged && !run.diverged

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Gradient descent</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Gradient descent. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg cursor-ew-resize touch-none"
          style={{ background: 'var(--color-canvas)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => {
            if (step >= run.pts.length - 1) setStep(0)
            setRunning(r => !r)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Run</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Learning rate η:</span>
          <input type="range" min={SPEC.eta.min} max={SPEC.eta.max} step={SPEC.eta.step} value={eta}
            onChange={e => set('eta', +e.target.value)}
            className="w-28 accent-accent-violet"
          />
          <span className="font-mono text-text-secondary">{eta.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Start x₀:</span>
          <input type="range" min={SPEC.startX.min} max={SPEC.startX.max} step={SPEC.startX.step} value={startX}
            onChange={e => set('startX', +e.target.value)}
            className="w-24 accent-accent-blue"
          />
          <span className="font-mono text-text-secondary">{startX.toFixed(2)}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          {run.diverged && done
            ? <strong style={{ color: ARROW }}>diverged — η above the stability ceiling</strong>
            : settled
              ? <>settled at <strong className="font-mono" style={{ color: BALL }}>x={curX.toFixed(3)}</strong>, loss {loss(curX).toFixed(3)} in {run.pts.length - 1} steps</>
              : oscillating
                ? <><strong style={{ color: ARROW }}>oscillating</strong> — never settles at η={eta.toFixed(2)}</>
                : <>step <strong className="font-mono" style={{ color: BALL }}>{step}</strong> · x={curX.toFixed(3)} · loss {loss(curX).toFixed(3)}</>
          }
        </WidgetStatus>
      </div>
      <p className="mt-2 text-xs text-text-muted">Drag anywhere on the plot to move the starting point into the other basin.</p>
    </div>
  )
}
