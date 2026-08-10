'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const PAD = { left: 44, right: 16, top: 16, bottom: 34 }
const BETA_MAX = 0.999
const GAMMA_CAP = 8
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const gammaOf = (b: number) => 1 / Math.sqrt(1 - b * b)

export function LorentzFactorAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setBeta(0.87); return }
      setBeta(0)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [beta, setBeta] = useState(0.6)
  const [running, setRunning] = useState(false)

  const x = useCallback((b: number) => PAD.left + (b / BETA_MAX) * PLOT_W, [])
  const y = useCallback((g: number) => PAD.top + PLOT_H - (Math.min(g, GAMMA_CAP) / GAMMA_CAP) * PLOT_H, [])

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

    // gridline at gamma = 1 (baseline)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.1)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, y(1))
    ctx.lineTo(PAD.left + PLOT_W, y(1))
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('γ (Lorentz)', PAD.left - 2, PAD.top - 4)
    ctx.fillText('β = v/c', PAD.left + PLOT_W - 48, PAD.top + PLOT_H + 22)
    ctx.fillText('1', PAD.left - 14, y(1) + 3)
    ctx.fillText(`${GAMMA_CAP}`, PAD.left - 14, y(GAMMA_CAP) + 3)

    // gamma curve
    ctx.strokeStyle = '#10B981'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    let started = false
    for (let b = 0; b <= BETA_MAX + 1e-9; b += 0.004) {
      const yy = y(gammaOf(b))
      if (!started) { ctx.moveTo(x(b), yy); started = true }
      else ctx.lineTo(x(b), yy)
    }
    ctx.stroke()

    // guide line at current beta
    const g = gammaOf(beta)
    const bx = x(beta)
    const by = y(g)
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(bx, PAD.top + PLOT_H)
    ctx.lineTo(bx, by)
    ctx.stroke()
    ctx.setLineDash([])

    // current-point marker (gold)
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill()
    const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 12)
    grd.addColorStop(0, 'rgba(245,158,11,0.4)')
    grd.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill()

    // label near marker
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = '#F59E0B'
    ctx.fillText(`γ = ${g.toFixed(2)}`, Math.min(bx + 8, W - 80), Math.max(by - 6, PAD.top + 12))
  }, [beta, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      setBeta(prev => {
        if (prev >= BETA_MAX) { setRunning(false); return BETA_MAX }
        return +Math.min(prev + 0.012, BETA_MAX).toFixed(3)
      })
      raf = requestAnimationFrame(() => setTimeout(step, 40))
    }
    raf = requestAnimationFrame(() => setTimeout(step, 40))
    return () => cancelAnimationFrame(raf)
  }, [running])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setBeta(0.6)
  }

  const gamma = gammaOf(beta)

  // notable values
  const notes: [number, string][] = [[0.87, '~2'], [0.99, '~7']]

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Lorentz factor</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>v/c:</span>
          <input
            type="range" min={0} max={BETA_MAX} step={0.001} value={beta}
            onChange={e => { setBeta(+e.target.value); setRunning(false) }}
            className="w-40 accent-accent-teal"
          />
          <span className="text-text-secondary font-medium font-mono">{(beta * 100).toFixed(1)}%</span>
        </label>
        <div className="ml-auto flex gap-4 text-xs">
          {notes.map(([b, g]) => (
            <span key={b} className="text-text-secondary font-mono">
              β={b} → <strong className="text-accent-teal">γ{g}</strong>
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        β = <strong className="text-accent-teal font-mono">{beta.toFixed(3)}</strong> ·
        γ = <strong className="text-accent-gold font-mono">{gamma.toFixed(3)}</strong> —
        1 second on the moving clock = <strong className="text-accent-gold font-mono">{gamma.toFixed(2)}</strong> seconds at rest.
      </p>
    </div>
  )
}
