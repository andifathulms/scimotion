'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 260
const PAD = { left: 50, right: 16, top: 18, bottom: 36 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const N_ITER = 12
const ROOT = Math.SQRT2
const Y_TOP = 0 // log10(error) at top
const Y_BOT = -16 // log10(error) at bottom

const NEWTON = '#A78BFA'
const BISECT = '#F472B6'

// floor of log10(error), clamped so machine-precision zeros stay on chart
function logErr(e: number): number {
  if (e <= 0) return Y_BOT
  return Math.max(Y_BOT, Math.log10(e))
}

function buildNewton(): number[] {
  const errs: number[] = []
  let x = 2
  for (let k = 0; k <= N_ITER; k++) {
    errs.push(Math.abs(x - ROOT))
    x = x - (x * x - 2) / (2 * x)
  }
  return errs
}

function buildBisection(): number[] {
  const errs: number[] = []
  let lo = 1
  let hi = 2
  for (let k = 0; k <= N_ITER; k++) {
    const mid = (lo + hi) / 2
    errs.push(Math.abs(mid - ROOT))
    if ((mid * mid - 2) > 0) hi = mid
    else lo = mid
  }
  return errs
}

export function NewtonConvergenceAnimation() {
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(N_ITER); return }
      setStep(0)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [newtonErr] = useState<number[]>(buildNewton)
  const [bisectErr] = useState<number[]>(buildBisection)
  const [step, setStep] = useState(N_ITER)
  const [running, setRunning] = useState(false)

  const x = useCallback((k: number) => PAD.left + (k / N_ITER) * PLOT_W, [])
  const y = useCallback(
    (logE: number) => PAD.top + ((Y_TOP - logE) / (Y_TOP - Y_BOT)) * PLOT_H,
    [],
  )

  const drawSeries = useCallback(
    (ctx: CanvasRenderingContext2D, errs: number[], visible: number, color: string) => {
      const pts = errs.slice(0, visible)
      // connecting line
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      pts.forEach((e, k) => {
        const px = x(k)
        const py = y(logErr(e))
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      // points
      ctx.fillStyle = color
      pts.forEach((e, k) => {
        ctx.beginPath()
        ctx.arc(x(k), y(logErr(e)), 3.5, 0, Math.PI * 2)
        ctx.fill()
      })
    },
    [x, y],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // gridlines + y-axis decade labels (10^0 .. 10^-16)
    ctx.font = '10px monospace'
    for (let p = 0; p >= Y_BOT; p -= 4) {
      const py = y(p)
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD.left, py)
      ctx.lineTo(PAD.left + PLOT_W, py)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`10${supScript(p)}`, 6, py + 3)
    }

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('|error|', PAD.left - 2, PAD.top - 6)
    ctx.fillText('iteration k', PAD.left + PLOT_W - 64, PAD.top + PLOT_H + 24)

    // x-axis ticks
    for (let k = 0; k <= N_ITER; k += 3) {
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(`${k}`, x(k) - 3, PAD.top + PLOT_H + 14)
    }

    const visible = step + 1
    drawSeries(ctx, bisectErr, visible, BISECT)
    drawSeries(ctx, newtonErr, visible, NEWTON)
  }, [newtonErr, bisectErr, step, x, y, drawSeries])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    const id = setInterval(() => {
      setStep(s => {
        if (s >= N_ITER) { setRunning(false); return N_ITER }
        return s + 1
      })
    }, 320)
    return () => clearInterval(id)
  }, [running, visible])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setStep(N_ITER)
  }

  // correct digits for Newton at latest visible step
  const newtonE = newtonErr[Math.min(step, N_ITER)]
  const correctDigits = newtonE <= 0 ? 16 : Math.max(0, Math.floor(-Math.log10(newtonE)))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Convergence speed</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Convergence speed. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: NEWTON }} />
            Newton (quadratic)
          </span>
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="inline-block w-3 h-0.5 rounded" style={{ background: BISECT }} />
            Bisection (linear)
          </span>
        </div>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          Newton @ k={Math.min(step, N_ITER)}: <strong className="font-mono" style={{ color: NEWTON }}>{correctDigits}</strong> correct digits
        </WidgetStatus>
      </div>
    </div>
  )
}

// unicode superscript for decade labels, e.g. 0, -4, -8, -12, -16
function supScript(p: number): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  }
  return String(p).split('').map(c => map[c] ?? c).join('')
}
