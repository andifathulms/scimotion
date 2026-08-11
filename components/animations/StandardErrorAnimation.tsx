'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 44, right: 16, top: 18, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const SIGMA = 1
const N_MIN = 1
const N_MAX = 500
const X_RANGE = 1.6 // x-axis spans ±X_RANGE around the mean

// inset (SE vs n curve)
const INS = { x: W - 188, y: PAD.top + 6, w: 170, h: 74 }

const se = (n: number) => SIGMA / Math.sqrt(n)

export function StandardErrorAnimation() {
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setN(N_MAX); return }
      setN(N_MIN)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [n, setN] = useState(N_MAX)
  const [running, setRunning] = useState(false)

  const xToPx = useCallback((x: number) => PAD.left + ((x + X_RANGE) / (2 * X_RANGE)) * PLOT_W, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const seN = se(n)
    // tallest possible bell (at n = N_MAX) sets the vertical scale so the curve grows visibly
    const seMin = se(N_MAX)
    const peakRef = 1 / seMin // peak of unnormalized gaussian ~ 1/SE

    // axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('density', PAD.left - 2, PAD.top - 5)
    ctx.fillText('sample mean', PAD.left + PLOT_W - 70, PAD.top + PLOT_H + 22)

    // x ticks
    ctx.fillStyle = 'rgba(255,245,235,0.25)'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ;[-1, 0, 1].forEach(t => {
      const px = xToPx(t)
      ctx.fillText(t === 0 ? 'μ' : `${t > 0 ? '+' : ''}${t}`, px, PAD.top + PLOT_H + 14)
    })
    ctx.textAlign = 'left'

    // bell curve: y = exp(-x^2 / (2*SE^2)) / SE, scaled so the narrowest bell fills the plot
    const peakH = (peakRef / peakRef) * PLOT_H * 0.92 // = PLOT_H * 0.92 at n = N_MAX
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + PLOT_H)
    grad.addColorStop(0, 'rgba(167,139,250,0.85)')
    grad.addColorStop(1, 'rgba(167,139,250,0.08)')

    ctx.beginPath()
    for (let px = 0; px <= PLOT_W; px++) {
      const x = -X_RANGE + (px / PLOT_W) * 2 * X_RANGE
      const yUnnorm = Math.exp(-(x * x) / (2 * seN * seN)) / seN
      const h = (yUnnorm / peakRef) * peakH
      const py = PAD.top + PLOT_H - h
      if (px === 0) ctx.moveTo(PAD.left + px, py)
      else ctx.lineTo(PAD.left + px, py)
    }
    // close to baseline for fill
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // stroke the curve outline
    ctx.beginPath()
    ctx.strokeStyle = '#A78BFA'
    ctx.lineWidth = 2.5
    for (let px = 0; px <= PLOT_W; px++) {
      const x = -X_RANGE + (px / PLOT_W) * 2 * X_RANGE
      const yUnnorm = Math.exp(-(x * x) / (2 * seN * seN)) / seN
      const h = (yUnnorm / peakRef) * peakH
      const py = PAD.top + PLOT_H - h
      if (px === 0) ctx.moveTo(PAD.left + px, py)
      else ctx.lineTo(PAD.left + px, py)
    }
    ctx.stroke()

    // ±1 SE markers
    ;[-1, 1].forEach(s => {
      const markX = xToPx(s * seN)
      if (markX <= PAD.left || markX >= PAD.left + PLOT_W) return
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(167,139,250,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(markX, PAD.top)
      ctx.lineTo(markX, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.setLineDash([])
    })
    // SE bracket label
    ctx.fillStyle = '#A78BFA'
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`SE = σ/√n = ${seN.toFixed(3)}`, PAD.left + 6, PAD.top + 14)

    // ── inset: SE vs n following 1/√n ──
    ctx.fillStyle = 'rgba(255,245,235,0.03)'
    ctx.fillRect(INS.x, INS.y, INS.w, INS.h)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(INS.x, INS.y, INS.w, INS.h)

    const insSeMax = se(N_MIN) // = SIGMA, top of inset
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(167,139,250,0.7)'
    ctx.lineWidth = 1.5
    for (let i = 0; i <= INS.w; i++) {
      const nn = N_MIN + (i / INS.w) * (N_MAX - N_MIN)
      const py = INS.y + INS.h - (se(nn) / insSeMax) * INS.h
      if (i === 0) ctx.moveTo(INS.x + i, py)
      else ctx.lineTo(INS.x + i, py)
    }
    ctx.stroke()

    // dot at current n on inset
    const dotX = INS.x + ((n - N_MIN) / (N_MAX - N_MIN)) * INS.w
    const dotY = INS.y + INS.h - (seN / insSeMax) * INS.h
    ctx.fillStyle = '#A78BFA'
    ctx.beginPath()
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '8px monospace'
    ctx.fillText('SE vs n  (1/√n)', INS.x + 4, INS.y + 10)
    ctx.fillText('n=500', INS.x + INS.w - 32, INS.y + INS.h - 3)
    ctx.fillText('n=1', INS.x + 4, INS.y + INS.h - 3)

    // key-law annotation
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.font = '9px monospace'
    ctx.fillText('halve the error → 4× the data', INS.x, INS.y + INS.h + 16)
  }, [n, xToPx])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let raf = 0
    const step = () => {
      setN(prev => {
        if (prev >= N_MAX) { setRunning(false); return N_MAX }
        // ease faster through high n since SE flattens
        return Math.min(N_MAX, prev + Math.max(1, Math.round(prev * 0.06)))
      })
      raf = requestAnimationFrame(() => setTimeout(step, 40))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 40))
    return () => cancelAnimationFrame(raf)
  }, [running, visible])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setN(N_MAX)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Standard error of the mean</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Standard error of the mean. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>n:</span>
          <input
            type="range" min={N_MIN} max={N_MAX} value={n}
            onChange={e => { setN(+e.target.value); setRunning(false) }}
            className="w-40 accent-accent-violet"
          />
          <span className="text-text-secondary font-medium">{n}</span>
        </label>
        <div className="ml-auto flex gap-4 text-xs">
          <span className="text-text-secondary">σ = <strong className="text-accent-violet">{SIGMA.toFixed(1)}</strong></span>
          <span className="text-text-secondary">SE = <strong className="text-accent-violet">{se(n).toFixed(3)}</strong></span>
        </div>
      </div>
    </div>
  )
}
