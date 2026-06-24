'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 44, right: 16, top: 16, bottom: 34 }
const T_MAX = 100
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// RMS distance traveled by a diffusing particle: r = sqrt(2 * D * t)
function rms(t: number, D: number): number {
  return Math.sqrt(2 * D * t)
}

export function DiffusionScalingAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setT(T_MAX); return }
      setT(0)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [t, setT] = useState(T_MAX)
  const [D, setD] = useState(2)
  const [running, setRunning] = useState(false)

  const rMax = rms(T_MAX, D)

  const x = useCallback((v: number) => PAD.left + (v / T_MAX) * PLOT_W, [])
  const y = useCallback(
    (v: number) => PAD.top + PLOT_H - (rMax > 0 ? v / rMax : 0) * PLOT_H,
    [rMax]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

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
    ctx.fillText('distance (RMS)', PAD.left - 2, PAD.top - 4)
    ctx.fillText('time t', PAD.left + PLOT_W - 40, PAD.top + PLOT_H + 22)

    // square-root curve: r = sqrt(2 D t)
    ctx.strokeStyle = '#F472B6'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    for (let v = 0; v <= T_MAX; v++) {
      const yy = y(rms(v, D))
      if (v === 0) ctx.moveTo(x(v), yy)
      else ctx.lineTo(x(v), yy)
    }
    ctx.stroke()

    // "twice as far takes four times as long" annotation markers
    // base time t1 (a quarter of max), distance x1; then 4*t1 gives 2*x1
    const t1 = T_MAX / 4
    const t2 = T_MAX
    const r1 = rms(t1, D)
    const r2 = rms(t2, D)
    ;[
      { tt: t1, rr: r1, label: 'x at t' },
      { tt: t2, rr: r2, label: '2x at 4t' },
    ].forEach(({ tt, rr, label }) => {
      const px = x(tt)
      const py = y(rr)
      ctx.setLineDash([3, 3])
      ctx.strokeStyle = 'rgba(96,165,250,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(px, PAD.top + PLOT_H); ctx.lineTo(px, py); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(px, py); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#60A5FA'
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.font = '10px monospace'
      ctx.fillText(label, Math.min(px + 6, W - 70), py + 14)
    })

    // marker at current t
    const cx = x(t)
    const cr = rms(t, D)
    const cy = y(cr)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cx, PAD.top + PLOT_H); ctx.lineTo(cx, PAD.top); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#F472B6'
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill()

    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#F472B6'
    ctx.fillText(`r = ${cr.toFixed(1)}`, Math.min(cx + 8, W - 80), Math.max(cy - 6, PAD.top + 12))
  }, [t, D, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      setT(prev => {
        if (prev >= T_MAX) { setRunning(false); return T_MAX }
        return prev + 1
      })
      raf = requestAnimationFrame(() => setTimeout(step, 35))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 35))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setT(T_MAX)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Diffusion scaling (√t)</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>t:</span>
          <input
            type="range" min={0} max={T_MAX} value={t}
            onChange={e => { setT(+e.target.value); setRunning(false) }}
            className="w-40 accent-accent-pink"
          />
          <span className="text-text-secondary font-medium">{t}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>D (temperature):</span>
          <input
            type="range" min={0.5} max={6} step={0.5} value={D}
            onChange={e => { setD(+e.target.value); setRunning(false) }}
            className="w-28 accent-accent-pink"
          />
          <span className="text-text-secondary font-medium font-mono">{D.toFixed(1)}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          twice as far → <strong className="text-accent-pink">4×</strong> the time
        </span>
      </div>
    </div>
  )
}
