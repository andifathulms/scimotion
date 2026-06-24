'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260
const CX = 130
const CY = H / 2
const R = 80
const WAVE_X = 240
const WAVE_W = W - WAVE_X - 16
const SAMPLES = 200

export function PhasorWaveAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Static phasor at ~45°, with connector and a partial wave.
        const theta = Math.PI / 4
        thetaRef.current = theta
        const partial: number[] = []
        for (let i = 0; i < SAMPLES / 2; i++) {
          partial.push(Math.sin(theta + i * 0.06))
        }
        trailRef.current = partial
        drawScene(theta, trailRef.current)
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const thetaRef = useRef(0)
  const rafRef = useRef<number>(0)
  const trailRef = useRef<number[]>([])
  const [running, setRunning] = useState(false)
  const [omega, setOmega] = useState(1)

  const drawScene = (theta: number, trail: number[]) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Grid lines (left panel)
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = -2; gx <= 2; gx++) {
      const px = CX + gx * (R / 2)
      ctx.beginPath(); ctx.moveTo(px, CY - R - 8); ctx.lineTo(px, CY + R + 8); ctx.stroke()
    }
    for (let gy = -2; gy <= 2; gy++) {
      const py = CY + gy * (R / 2)
      ctx.beginPath(); ctx.moveTo(CX - R - 8, py); ctx.lineTo(CX + R + 8, py); ctx.stroke()
    }

    // Axes (left panel)
    ctx.strokeStyle = 'rgba(255,245,235,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(CX - R - 16, CY); ctx.lineTo(CX + R + 16, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, CY - R - 16); ctx.lineTo(CX, CY + R + 16); ctx.stroke()
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('Re', CX + R + 6, CY + 4)
    ctx.fillText('Im', CX + 3, CY - R - 6)

    // Unit circle
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245,158,11,0.2)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Phasor tip
    const px = CX + R * Math.cos(theta)
    const py = CY - R * Math.sin(theta)

    // sin(θ) projection guide on Im axis (violet)
    ctx.beginPath()
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(167,139,250,0.5)'
    ctx.lineWidth = 1.2
    ctx.moveTo(px, py)
    ctx.lineTo(CX, py)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(CX, py)
    ctx.strokeStyle = 'rgba(167,139,250,0.9)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Phasor arrow (gold)
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

    // Panel separator
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(WAVE_X - 12, 0)
    ctx.lineTo(WAVE_X - 12, H)
    ctx.stroke()

    // Wave axis (right panel)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(WAVE_X, CY)
    ctx.lineTo(WAVE_X + WAVE_W, CY)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,245,235,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('t', WAVE_X + WAVE_W - 8, CY + 16)

    // Scrolling sin wave trace (violet). Newest sample at the leading (left) edge.
    if (trail.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#A78BFA'
      ctx.lineWidth = 1.8
      for (let i = 0; i < trail.length; i++) {
        const tx = WAVE_X + (i / SAMPLES) * WAVE_W
        const ty = CY - trail[i] * R
        if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty)
      }
      ctx.stroke()
    }

    // Horizontal connector from phasor tip to the wave's leading edge (gold dashed)
    const leadY = CY - Math.sin(theta) * R
    ctx.beginPath()
    ctx.setLineDash([2, 3])
    ctx.strokeStyle = 'rgba(245,158,11,0.4)'
    ctx.lineWidth = 1
    ctx.moveTo(px, py)
    ctx.lineTo(WAVE_X, leadY)
    ctx.stroke()
    ctx.setLineDash([])

    // Leading-edge dot on wave
    ctx.beginPath()
    ctx.arc(WAVE_X, leadY, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#A78BFA'
    ctx.fill()

    // Labels
    ctx.font = '10px monospace'
    ctx.fillStyle = '#A78BFA'
    ctx.fillText(`sin(θ) = ${Math.sin(theta).toFixed(3)}`, CX - R - 6, CY + R + 30)
  }

  useEffect(() => {
    if (!running) { drawScene(thetaRef.current, trailRef.current); return }
    const tick = () => {
      thetaRef.current += 0.02 * omega
      if (thetaRef.current > Math.PI * 1000) thetaRef.current -= Math.PI * 1000
      trailRef.current.unshift(Math.sin(thetaRef.current))
      if (trailRef.current.length > SAMPLES) trailRef.current.pop()
      drawScene(thetaRef.current, trailRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, omega]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    thetaRef.current = 0
    trailRef.current = []
    setRunning(false)
    triggerReset()
    drawScene(0, [])
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Phasor &amp; Wave</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas">
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>ω:</span>
          <input type="range" min={0.5} max={4} step={0.5} value={omega}
            onChange={e => setOmega(+e.target.value)}
            className="w-32 accent-accent-violet" />
          <span className="font-mono">{omega.toFixed(1)}×</span>
        </div>
        <span className="ml-auto font-mono text-xs text-accent-violet">
          e<sup>iωt</sup> → sin projection traces the wave
        </span>
      </div>
    </div>
  )
}
