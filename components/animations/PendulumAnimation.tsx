'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 280
const PIVOT_X = W / 2
const PIVOT_Y = 40
const G = 9.81
const DT = 0.016

export function PendulumAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const stateRef = useRef({ angle: Math.PI / 3, omega: 0, trail: [] as { x: number; y: number }[] })

  const [running, setRunning] = useState(false)
  const [length, setLength] = useState(160)
  const [initAngle, setInitAngle] = useState(60)
  const [gravity, setGravity] = useState(9.81)
  const [energy, setEnergy] = useState({ ke: 0, pe: 1 })

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)

    const { angle, trail } = stateRef.current
    const L = length
    const bobX = PIVOT_X + L * Math.sin(angle)
    const bobY = PIVOT_Y + L * Math.cos(angle)

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // Trail
    if (trail.length > 1) {
      ctx.beginPath()
      trail.forEach((p, i) => {
        const alpha = i / trail.length
        ctx.strokeStyle = `rgba(245,158,11,${alpha * 0.5})`
        ctx.lineWidth = 1.5
        if (i === 0) ctx.moveTo(p.x, p.y)
        else {
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
        }
      })
    }

    // Rod
    ctx.beginPath()
    ctx.moveTo(PIVOT_X, PIVOT_Y)
    ctx.lineTo(bobX, bobY)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Pivot
    ctx.beginPath()
    ctx.arc(PIVOT_X, PIVOT_Y, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fill()

    // Bob
    ctx.beginPath()
    ctx.arc(bobX, bobY, 14, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(bobX - 4, bobY - 4, 2, bobX, bobY, 14)
    grad.addColorStop(0, '#FB923C')
    grad.addColorStop(1, '#F59E0B')
    ctx.fillStyle = grad
    ctx.fill()

    // Equilibrium line
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.setLineDash([4, 4])
    ctx.moveTo(PIVOT_X, PIVOT_Y)
    ctx.lineTo(PIVOT_X, PIVOT_Y + L + 20)
    ctx.stroke()
    ctx.setLineDash([])

    // Angle arc
    ctx.beginPath()
    ctx.arc(PIVOT_X, PIVOT_Y, 30, Math.PI / 2, Math.PI / 2 + angle, angle < 0)
    ctx.strokeStyle = 'rgba(167,139,250,0.5)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(167,139,250,0.6)'
    ctx.font = '10px monospace'
    ctx.fillText(`${(angle * 180 / Math.PI).toFixed(1)}°`, PIVOT_X + 35, PIVOT_Y + 16)

    // Energy bars
    const maxH = L
    const pe = gravity * L * (1 - Math.cos(angle))
    const totalE = gravity * L * (1 - Math.cos(stateRef.current.angle === angle && !running
      ? (initAngle * Math.PI / 180)
      : (initAngle * Math.PI / 180)))
    const ke = Math.max(0, totalE - pe)
    const normPE = totalE > 0 ? pe / totalE : 0
    const normKE = totalE > 0 ? ke / totalE : 0

    const barX = W - 60
    const barH = 100

    ctx.fillStyle = 'rgba(255,245,235,0.06)'
    ctx.fillRect(barX, H - barH - 20, 16, barH)
    ctx.fillRect(barX + 20, H - barH - 20, 16, barH)

    ctx.fillStyle = '#A78BFA'
    ctx.fillRect(barX, H - 20 - normPE * barH, 16, normPE * barH)
    ctx.fillStyle = '#10B981'
    ctx.fillRect(barX + 20, H - 20 - normKE * barH, 16, normKE * barH)

    ctx.font = '9px monospace'
    ctx.fillStyle = '#A78BFA'
    ctx.fillText('PE', barX + 1, H - 8)
    ctx.fillStyle = '#10B981'
    ctx.fillText('KE', barX + 21, H - 8)

    setEnergy({ ke: normKE, pe: normPE })
  }, [length, gravity, initAngle, running])

  useEffect(() => {
    stateRef.current = { angle: initAngle * Math.PI / 180, omega: 0, trail: [] }
    drawFrame()
  }, [initAngle, length, gravity, drawFrame])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }

    const loop = () => {
      const s = stateRef.current
      const alpha = -(gravity / length) * Math.sin(s.angle)
      s.omega += alpha * DT
      s.omega *= 0.9995
      s.angle += s.omega * DT

      const bobX = PIVOT_X + length * Math.sin(s.angle)
      const bobY = PIVOT_Y + length * Math.cos(s.angle)
      s.trail = [...s.trail, { x: bobX, y: bobY }].slice(-80)

      drawFrame()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, length, gravity, drawFrame])

  useEffect(() => {
    if (triggered && !running) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    stateRef.current = { angle: initAngle * Math.PI / 180, omega: 0, trail: [] }
    drawFrame()
  }

  const period = (2 * Math.PI * Math.sqrt(length / 1000 / gravity)).toFixed(2)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Simple Pendulum</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Angle:</span>
          <input type="range" min={5} max={85} value={initAngle}
            onChange={e => { setInitAngle(+e.target.value); setRunning(false) }}
            className="w-20 accent-accent-gold"
          />
          <span>{initAngle}°</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Length:</span>
          <input type="range" min={60} max={220} step={10} value={length}
            onChange={e => { setLength(+e.target.value); setRunning(false) }}
            className="w-20 accent-accent-gold"
          />
          <span>{length}px</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Gravity:</span>
          <input type="range" min={1} max={20} step={0.5} value={gravity}
            onChange={e => { setGravity(+e.target.value); setRunning(false) }}
            className="w-20 accent-accent-gold"
          />
          <span>{gravity} m/s²</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          T ≈ <strong className="text-accent-gold">{period}s</strong>
        </span>
      </div>
    </div>
  )
}
