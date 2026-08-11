'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 46, right: 16, top: 20, bottom: 36 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const N_MIN = 4
const N_MAX = 200

function lnFactorial(n: number): number {
  if (n < 2) return 0
  return (
    n * Math.log(n) -
    n +
    0.5 * Math.log(2 * Math.PI * n) +
    1 / (12 * n) -
    1 / (360 * n * n * n)
  )
}

// ln of the number of microstates W(k) = C(N, k) for the macrostate "k on the left".
function lnW(n: number, k: number): number {
  return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k)
}

// Formats 2^n as a readable power of ten.
function powerOfTen(n: number): string {
  const exp = (n * Math.log10(2))
  if (exp < 3) return Math.round(Math.pow(2, n)).toString()
  return `10^${Math.round(exp)}`
}

export function MicrostatesAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(N_MAX)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setN(N_MAX); return }
      setN(N_MIN)
      setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const x = (frac: number) => PAD.left + frac * PLOT_W
    const y = (v: number) => PAD.top + PLOT_H - v * PLOT_H

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('W (relative)', PAD.left - 4, PAD.top - 7)
    ctx.fillText('fraction on the left', PAD.left + PLOT_W - 106, PAD.top + PLOT_H + 24)
    ctx.fillText('0', PAD.left - 4, PAD.top + PLOT_H + 14)
    ctx.fillText('0.5', x(0.5) - 8, PAD.top + PLOT_H + 14)
    ctx.fillText('1', x(1) - 4, PAD.top + PLOT_H + 14)

    // Centre line at 50/50
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.beginPath()
    ctx.moveTo(x(0.5), PAD.top)
    ctx.lineTo(x(0.5), PAD.top + PLOT_H)
    ctx.stroke()
    ctx.setLineDash([])

    // Faint reference distribution at N = 8, to show how much it has sharpened
    const drawCurve = (nn: number, stroke: string, width: number, fill: string | null) => {
      const peak = lnW(nn, Math.round(nn / 2))
      ctx.beginPath()
      for (let px = 0; px <= PLOT_W; px++) {
        const frac = px / PLOT_W
        const k = frac * nn
        const kl = Math.floor(k)
        const t = k - kl
        // interpolate ln W between integer macrostates for a smooth curve
        const a = lnW(nn, Math.min(kl, nn))
        const b = lnW(nn, Math.min(kl + 1, nn))
        const v = Math.exp(a + t * (b - a) - peak)
        const yy = y(v)
        if (px === 0) ctx.moveTo(PAD.left + px, yy)
        else ctx.lineTo(PAD.left + px, yy)
      }
      if (fill) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = width
        ctx.stroke()
        ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
        ctx.lineTo(PAD.left, PAD.top + PLOT_H)
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.fill()
      } else {
        ctx.strokeStyle = stroke
        ctx.lineWidth = width
        ctx.stroke()
      }
    }

    drawCurve(8, 'rgba(167,139,250,0.45)', 1.25, null)
    drawCurve(n, '#10B981', 2.5, 'rgba(16,185,129,0.14)')

    // Bars for the individual macrostates when N is small enough to see them
    if (n <= 40) {
      const peak = lnW(n, Math.round(n / 2))
      for (let k = 0; k <= n; k++) {
        const v = Math.exp(lnW(n, k) - peak)
        const px = x(k / n)
        const h = v * PLOT_H
        ctx.fillStyle = 'rgba(96,165,250,0.35)'
        ctx.fillRect(px - Math.max(1, PLOT_W / n / 2 - 1), PAD.top + PLOT_H - h, Math.max(2, PLOT_W / n - 2), h)
      }
    }

    // Peak marker
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath()
    ctx.arc(x(0.5), y(1), 4, 0, Math.PI * 2)
    ctx.fill()

    // Readouts
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#10B981'
    ctx.fillText(`N = ${n}`, PAD.left + 8, PAD.top + 14)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`total microstates 2^N = ${powerOfTen(n)}`, PAD.left + 8, PAD.top + 30)
    ctx.fillText(`P(all on the left) = 1 / ${powerOfTen(n)}`, PAD.left + 8, PAD.top + 44)
    // Relative width of the peak: sigma/N = 1/(2 sqrt(N))
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`peak width ±${(100 / (2 * Math.sqrt(n))).toFixed(2)}%`, PAD.left + 8, PAD.top + 58)
    ctx.fillStyle = 'rgba(167,139,250,0.7)'
    ctx.fillText('faint curve: N = 8', PAD.left + PLOT_W - 116, PAD.top + 14)
  }, [n])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let raf = 0
    let timer: ReturnType<typeof setTimeout>
    const step = () => {
      setN(prev => {
        if (prev >= N_MAX) { setRunning(false); return N_MAX }
        return Math.min(N_MAX, prev + 2)
      })
      raf = requestAnimationFrame(() => { timer = setTimeout(step, 30) })
    }
    raf = requestAnimationFrame(() => { timer = setTimeout(step, 30) })
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [running, visible])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setN(N_MAX)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Microstates per macrostate</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Microstates per macrostate. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>N particles:</span>
          <input
            type="range" min={N_MIN} max={N_MAX} step={2} value={n}
            onChange={e => { setRunning(false); setN(+e.target.value) }}
            className="w-44 accent-accent-teal"
          />
          <span className="text-text-secondary font-medium font-mono">{n}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          width shrinks as <strong className="text-accent-teal">1/√N</strong>
        </span>
      </div>
    </div>
  )
}
