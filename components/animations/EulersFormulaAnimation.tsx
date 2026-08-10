'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 280
const CX = W / 2 - 60
const CY = H / 2
const R = 100

export function EulersFormulaAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const angleRef = useRef(0)
  const rafRef = useRef<number>(0)
  const [running, setRunning] = useState(false)
  const [angle, setAngle] = useState(0)
  const [speed, setSpeed] = useState(1)
  const trailRef = useRef<{ x: number; y: number; t: number }[]>([])

  const draw = (theta: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Right panel: sine wave trace
    const trailX = W - 200
    const trailW = 190

    // Grid lines
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = -2; gx <= 2; gx++) {
      const px = CX + gx * (R / 2)
      ctx.beginPath(); ctx.moveTo(px, CY - R - 10); ctx.lineTo(px, CY + R + 10); ctx.stroke()
    }
    for (let gy = -2; gy <= 2; gy++) {
      const py = CY + gy * (R / 2)
      ctx.beginPath(); ctx.moveTo(CX - R - 10, py); ctx.lineTo(CX + R + 10, py); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(CX - R - 20, CY); ctx.lineTo(CX + R + 20, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, CY - R - 20); ctx.lineTo(CX, CY + R + 20); ctx.stroke()
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('Re', CX + R + 8, CY + 4)
    ctx.fillText('Im', CX + 3, CY - R - 8)

    // Unit circle
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245,158,11,0.2)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Phasor arrow
    const px = CX + R * Math.cos(theta)
    const py = CY - R * Math.sin(theta)
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(px, py)
    ctx.strokeStyle = '#F59E0B'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Arrowhead
    const headAngle = Math.atan2(CY - py, px - CX)
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px - 10 * Math.cos(headAngle - 0.4), py + 10 * Math.sin(headAngle - 0.4))
    ctx.lineTo(px - 10 * Math.cos(headAngle + 0.4), py + 10 * Math.sin(headAngle + 0.4))
    ctx.closePath()
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    // Dot at tip
    ctx.beginPath()
    ctx.arc(px, py, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    // cos(θ) projection on Re axis
    ctx.beginPath()
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(96,165,250,0.6)'
    ctx.lineWidth = 1.2
    ctx.moveTo(px, py)
    ctx.lineTo(px, CY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(px, CY)
    ctx.strokeStyle = 'rgba(96,165,250,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])

    // sin(θ) projection on Im axis
    ctx.beginPath()
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(167,139,250,0.6)'
    ctx.lineWidth = 1.2
    ctx.moveTo(px, py)
    ctx.lineTo(CX, py)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX, py)
    ctx.strokeStyle = 'rgba(167,139,250,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])

    // Labels
    ctx.font = '10px monospace'
    ctx.fillStyle = '#60A5FA'
    ctx.fillText(`cos(θ) = ${Math.cos(theta).toFixed(3)}`, CX - R - 10, CY + R + 22)
    ctx.fillStyle = '#A78BFA'
    ctx.fillText(`sin(θ) = ${Math.sin(theta).toFixed(3)}`, CX - R - 10, CY + R + 36)

    // Right panel: trace area separator
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(trailX - 10, 0)
    ctx.lineTo(trailX - 10, H)
    ctx.stroke()

    // Trace axis
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(trailX, CY)
    ctx.lineTo(trailX + trailW, CY)
    ctx.stroke()

    // cos trace (blue)
    if (trailRef.current.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#60A5FA'
      ctx.lineWidth = 1.5
      for (let i = 0; i < trailRef.current.length; i++) {
        const t = trailRef.current[i]
        const tx = trailX + (i / trailRef.current.length) * trailW
        const ty = CY - t.x * R
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty)
      }
      ctx.stroke()

      // sin trace (violet)
      ctx.beginPath()
      ctx.strokeStyle = '#A78BFA'
      ctx.lineWidth = 1.5
      for (let i = 0; i < trailRef.current.length; i++) {
        const t = trailRef.current[i]
        const tx = trailX + (i / trailRef.current.length) * trailW
        const ty = CY - t.y * R
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty)
      }
      ctx.stroke()
    }

    // Connector dashed line from phasor tip to trace
    const traceY = CY - Math.sin(theta) * R
    ctx.beginPath()
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = 'rgba(245,158,11,0.4)'
    ctx.lineWidth = 1
    ctx.moveTo(px, py)
    ctx.lineTo(trailX + trailW, traceY)
    ctx.stroke()
    ctx.setLineDash([])

    // Trace labels
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.fillText('cos', trailX + 2, CY - R - 2)
    ctx.fillStyle = 'rgba(167,139,250,0.7)'
    ctx.fillText('sin', trailX + 2, CY - R + 10)
  }

  useEffect(() => {
    if (!running) { draw(angle); return }
    const tick = () => {
      angleRef.current += 0.018 * speed
      if (angleRef.current > Math.PI * 4) angleRef.current -= Math.PI * 4
      setAngle(angleRef.current)
      trailRef.current.push({ x: Math.cos(angleRef.current), y: Math.sin(angleRef.current), t: angleRef.current })
      if (trailRef.current.length > 200) trailRef.current.shift()
      draw(angleRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, speed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw(angle) }, [angle])

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
  }, [triggered])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    angleRef.current = 0
    trailRef.current = []
    setRunning(false)
    setAngle(0)
    triggerReset()
    draw(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Euler&apos;s Formula</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Euler&apos;s Formula. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>θ:</span>
          <input type="range" min={0} max={Math.PI * 4} step={0.05} value={angle}
            onChange={e => { setRunning(false); const v = +e.target.value; setAngle(v); angleRef.current = v; draw(v) }}
            className="w-24 accent-accent-gold" />
          <span className="font-mono">{angle.toFixed(2)} rad</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={0.5} max={3} step={0.5} value={speed}
            onChange={e => setSpeed(+e.target.value)}
            className="w-16 accent-accent-gold" />
          <span className="font-mono">{speed}×</span>
        </label>
        <WidgetStatus className="ml-auto font-mono text-xs text-accent-gold">
          e<sup>iθ</sup> = {Math.cos(angle).toFixed(3)} + {Math.sin(angle).toFixed(3)}i
        </WidgetStatus>
      </div>
    </div>
  )
}
