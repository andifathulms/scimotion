'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 260
const PAD = { left: 50, right: 16, top: 18, bottom: 36 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const DEG_MAX = 180
const Y_MAX = 3 // T / T0 cap

// Arithmetic-geometric mean -> exact pendulum period ratio T/T0 = 1 / AGM(1, cos(theta0/2)).
function agm(a: number, b: number): number {
  for (let i = 0; i < 60; i++) {
    const na = (a + b) / 2
    const nb = Math.sqrt(a * b)
    a = na; b = nb
    if (Math.abs(a - b) < 1e-12) break
  }
  return a
}
function ratio(deg: number): number {
  if (deg <= 0) return 1
  const k = Math.cos((deg * Math.PI) / 360)
  return 1 / agm(1, k)
}

export function PendulumPeriodAnimation() {
  const { ref, reset: triggerReset, visible } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setDeg(90); return }
      setDeg(5)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [deg, setDeg] = useState(90)
  const [running, setRunning] = useState(false)

  const x = useCallback((d: number) => PAD.left + (d / DEG_MAX) * PLOT_W, [])
  const y = useCallback((r: number) => PAD.top + PLOT_H - ((Math.min(r, Y_MAX) - 1) / (Y_MAX - 1)) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('T / T₀', PAD.left - 42, PAD.top + 6)
    ctx.fillText('1.0', PAD.left - 28, y(1) + 3)
    ctx.fillText('amplitude θ₀', PAD.left + PLOT_W - 78, PAD.top + PLOT_H + 24)
    for (const g of [45, 90, 135]) ctx.fillText(`${g}°`, x(g) - 8, PAD.top + PLOT_H + 16)

    // small-angle prediction (flat line at 1.0)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(x(0), y(1)); ctx.lineTo(x(DEG_MAX), y(1)); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('small-angle formula', x(3), y(1) - 6)

    // exact curve
    ctx.strokeStyle = '#10B981'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let started = false
    for (let d = 1; d <= 176; d += 1) {
      const r = ratio(d)
      if (r > Y_MAX + 0.5) break
      const yy = y(r)
      if (!started) { ctx.moveTo(x(d), yy); started = true } else ctx.lineTo(x(d), yy)
    }
    ctx.stroke()

    // current marker
    const r = ratio(deg)
    const mx = x(deg), my = y(r)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.beginPath(); ctx.moveTo(mx, PAD.top + PLOT_H); ctx.lineTo(mx, my); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fill()
  }, [deg, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running || !visible) return
    let raf = 0
    const step = () => {
      setDeg(prev => {
        if (prev >= 160) { setRunning(false); return prev }
        return prev + 1
      })
      raf = requestAnimationFrame(() => setTimeout(step, 35))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 35))
    return () => cancelAnimationFrame(raf)
  }, [running, visible])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setDeg(90)
  }

  const r = ratio(deg)
  const pct = ((r - 1) * 100).toFixed(r > 2 ? 0 : 1)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Period vs amplitude</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Period vs amplitude. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>θ₀:</span>
          <input
            type="range" min={5} max={175} value={deg}
            onChange={e => { setDeg(+e.target.value); setRunning(false) }}
            className="w-44 accent-accent-teal"
          />
          <span className="text-text-secondary font-medium">{deg}°</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          True period is <strong className="text-accent-gold">{pct}%</strong> longer than the small-angle formula
        </WidgetStatus>
      </div>
    </div>
  )
}
