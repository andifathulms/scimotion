'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 290
const PAD = { left: 54, right: 18, top: 20, bottom: 40 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const X_MIN = -0.7, X_MAX = 1.7   // log10(a / AU)
const Y_MIN = -1.1, Y_MAX = 2.6   // log10(T / yr)

type Planet = { name: string; short: string; a: number; T: number; e: number }

// Semi-major axis in AU, sidereal period in Julian years, orbital eccentricity.
const PLANETS: Planet[] = [
  { name: 'Mercury', short: 'Me', a: 0.3871, T: 0.2408, e: 0.2056 },
  { name: 'Venus', short: 'V', a: 0.7233, T: 0.6152, e: 0.0068 },
  { name: 'Earth', short: 'E', a: 1.0000, T: 1.0000, e: 0.0167 },
  { name: 'Mars', short: 'Ma', a: 1.5237, T: 1.8808, e: 0.0934 },
  { name: 'Jupiter', short: 'J', a: 5.2034, T: 11.862, e: 0.0484 },
  { name: 'Saturn', short: 'S', a: 9.5371, T: 29.457, e: 0.0542 },
  { name: 'Uranus', short: 'U', a: 19.1913, T: 84.021, e: 0.0472 },
  { name: 'Neptune', short: 'N', a: 30.0690, T: 164.79, e: 0.0086 },
]

const X_TICKS: [number, string][] = [[0.3, '0.3'], [1, '1'], [3, '3'], [10, '10'], [30, '30']]
const Y_TICKS: [number, string][] = [[0.1, '0.1'], [1, '1'], [10, '10'], [100, '100']]

export function HarmonicLawAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setRevealed(PLANETS.length); return }
      setRevealed(0)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState(2)
  const [revealed, setRevealed] = useState(PLANETS.length)
  const [running, setRunning] = useState(false)

  const x = useCallback((logA: number) => PAD.left + ((logA - X_MIN) / (X_MAX - X_MIN)) * PLOT_W, [])
  const y = useCallback((logT: number) => PAD.top + PLOT_H - ((logT - Y_MIN) / (Y_MAX - Y_MIN)) * PLOT_H, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Decade gridlines
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (const [v] of X_TICKS) {
      const px = x(Math.log10(v))
      ctx.beginPath(); ctx.moveTo(px, PAD.top); ctx.lineTo(px, PAD.top + PLOT_H); ctx.stroke()
    }
    for (const [v] of Y_TICKS) {
      const py = y(Math.log10(v))
      ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(PAD.left + PLOT_W, py); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    for (const [v, label] of X_TICKS) ctx.fillText(label, x(Math.log10(v)) - 6, PAD.top + PLOT_H + 15)
    for (const [v, label] of Y_TICKS) ctx.fillText(label, PAD.left - 10 - label.length * 6, y(Math.log10(v)) + 3)
    ctx.fillText('semi-major axis a (AU, log scale)', PAD.left + PLOT_W - 200, PAD.top + PLOT_H + 30)
    ctx.fillText('T (yr)', PAD.left - 46, PAD.top + 6)

    // Reference line log T = 1.5 log a
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x(X_MIN), y(1.5 * X_MIN))
    ctx.lineTo(x(X_MAX), y(1.5 * X_MAX))
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('slope 3/2  →  T² = a³', PAD.left + 14, y(1.5 * (X_MIN + 0.28)) - 8)

    // Planets
    PLANETS.forEach((p, i) => {
      if (i >= revealed) return
      const px = x(Math.log10(p.a))
      const py = y(Math.log10(p.T))
      const isSel = i === selected
      if (isSel) {
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = 'rgba(96,165,250,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(PAD.left, py); ctx.lineTo(px, py); ctx.lineTo(px, PAD.top + PLOT_H); ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(245,158,11,0.22)'
        ctx.fill()
      }
      ctx.beginPath(); ctx.arc(px, py, isSel ? 5.5 : 4, 0, Math.PI * 2)
      ctx.fillStyle = isSel ? '#F59E0B' : '#10B981'
      ctx.fill()
      ctx.font = isSel ? 'bold 10px monospace' : '10px monospace'
      ctx.fillStyle = isSel ? '#F59E0B' : 'rgba(245,240,232,0.5)'
      ctx.fillText(isSel ? p.name : p.short, px + 8, py + (i === 0 ? 12 : -7))
    })
  }, [selected, revealed, x, y])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setRevealed(prev => {
        if (prev >= PLANETS.length) { setRunning(false); return prev }
        return prev + 1
      })
    }, 320)
    return () => clearInterval(id)
  }, [running])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setSelected(2)
    setRevealed(PLANETS.length)
  }

  const p = PLANETS[selected]
  const ratio = (p.T * p.T) / (p.a * p.a * p.a)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The harmonic law, T² = a³</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The harmonic law, T² = a³. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Planet:</span>
          <input
            type="range" min={0} max={PLANETS.length - 1} step={1} value={selected}
            onChange={e => { setSelected(+e.target.value); setRevealed(PLANETS.length); setRunning(false) }}
            className="w-40 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{p.name}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          a = <strong className="text-accent-gold">{p.a.toFixed(3)} AU</strong>
          {'  ·  '}
          T = <strong className="text-accent-gold">{p.T.toFixed(3)} yr</strong>
          {'  ·  '}
          e = <strong className="text-accent-gold">{p.e.toFixed(4)}</strong>
          {'  ·  '}
          T²/a³ = <strong className="text-accent-gold">{ratio.toFixed(4)}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
