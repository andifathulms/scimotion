'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 270
const PAD = { left: 52, right: 16, top: 18, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const N_ITER = 30
const Y_TOP = 4 // log10(loss) at top of chart
const Y_BOT = -8 // log10(loss) at bottom

// Minimizing f(x) = x^2 from x0 = 1, so f'(x) = 2x and x <- x(1 - 2eta).
// Stability ceiling is eta = 1; the optimal single-step rate is eta = 0.5.
type Rate = { eta: number; color: string; label: string }

const RATES: Rate[] = [
  { eta: 0.02, color: '#60A5FA', label: 'η = 0.02 · too small' },
  { eta: 0.4, color: '#10B981', label: 'η = 0.40 · just right' },
  { eta: 0.95, color: '#F59E0B', label: 'η = 0.95 · overshoots' },
  { eta: 1.05, color: '#F472B6', label: 'η = 1.05 · diverges' },
]

function buildLosses(eta: number): number[] {
  const out: number[] = []
  let x = 1
  for (let k = 0; k <= N_ITER; k++) {
    out.push(x * x)
    x = x * (1 - 2 * eta)
  }
  return out
}

function logLoss(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return Y_BOT
  return Math.min(Y_TOP, Math.max(Y_BOT, Math.log10(v)))
}

export function LearningRateAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [series] = useState<number[][]>(() => RATES.map(r => buildLosses(r.eta)))
  const [step, setStep] = useState(N_ITER)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setStep(N_ITER); return }
      setStep(0)
      setRunning(true)
    },
  })

  const x = useCallback((k: number) => PAD.left + (k / N_ITER) * PLOT_W, [])
  const y = useCallback(
    (logV: number) => PAD.top + ((Y_TOP - logV) / (Y_TOP - Y_BOT)) * PLOT_H,
    [],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // decade gridlines + labels
    for (let p = Y_TOP; p >= Y_BOT; p -= 3) {
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
    ctx.fillText('loss', PAD.left - 2, PAD.top - 6)
    ctx.fillText('iteration k', PAD.left + PLOT_W - 68, PAD.top + PLOT_H + 24)
    for (let k = 0; k <= N_ITER; k += 5) {
      ctx.fillText(`${k}`, x(k) - 4, PAD.top + PLOT_H + 14)
    }

    const visible = step + 1
    series.forEach((losses, i) => {
      const color = RATES[i].color
      const pts = losses.slice(0, visible)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      pts.forEach((v, k) => {
        const px = x(k)
        const py = y(logLoss(v))
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
      ctx.fillStyle = color
      pts.forEach((v, k) => {
        ctx.beginPath()
        ctx.arc(x(k), y(logLoss(v)), 2.5, 0, Math.PI * 2)
        ctx.fill()
      })
    })
  }, [series, step, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    const id = setInterval(() => {
      setStep(s => {
        if (s >= N_ITER) { setRunning(false); return N_ITER }
        return s + 1
      })
    }, 140)
    return () => clearInterval(id)
  }, [running, visible])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setStep(N_ITER)
  }

  const k = Math.min(step, N_ITER)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Learning rate trade-off</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Learning rate trade-off. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {RATES.map(r => (
            <span key={r.eta} className="flex items-center gap-1.5 text-text-secondary">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: r.color }} />
              {r.label}
            </span>
          ))}
        </div>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          k = <strong className="font-mono text-accent-gold">{k}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}

// unicode superscript for decade labels, e.g. 4, 1, -2, -5, -8
function supScript(p: number): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
  }
  return String(p).split('').map(c => map[c] ?? c).join('')
}
