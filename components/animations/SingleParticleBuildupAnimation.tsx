'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 260

// Double-slit intensity: I(x) = cos^2(a*x) * sinc^2(b*x), normalized so max = 1 at x = 0.
const A = 14
const B = 3
function sinc(t: number): number {
  if (t === 0) return 1
  const u = Math.PI * t
  return Math.sin(u) / u
}
function intensity(x: number): number {
  return Math.cos(A * x) ** 2 * sinc(B * x) ** 2
}

type Point = { px: number; py: number; gold: boolean }

// Rejection-sample one x in [-1, 1] weighted by I(x), then map to a screen point.
function samplePoint(): Point {
  while (true) {
    const x = Math.random() * 2 - 1
    if (Math.random() < intensity(x)) {
      const px = W / 2 + x * (W / 2 - 20)
      const py = H / 2 + (Math.random() - 0.5) * (H - 40)
      return { px, py, gold: Math.random() < 0.18 }
    }
  }
}

export function SingleParticleBuildupAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        const seed = Array.from({ length: 3000 }, samplePoint)
        pointsRef.current = seed
        setCount(seed.length)
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef<Point[]>([])
  const [count, setCount] = useState(0)
  const [speed, setSpeed] = useState(6)
  const [running, setRunning] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const pts = pointsRef.current
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      ctx.fillStyle = p.gold ? 'rgba(245,158,11,0.55)' : 'rgba(16,185,129,0.5)'
      ctx.beginPath()
      ctx.arc(p.px, p.py, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('detection screen', 10, H - 10)
  }, [])

  useEffect(() => { draw() }, [draw, count])

  useEffect(() => {
    if (!running) return
    let raf = 0
    const step = () => {
      for (let i = 0; i < speed; i++) pointsRef.current.push(samplePoint())
      setCount(pointsRef.current.length)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running, speed])

  const reset = () => {
    triggerReset()
    setRunning(false)
    pointsRef.current = []
    setCount(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Single-particle buildup</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-teal text-bg-base text-xs font-medium hover:bg-accent-teal/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input
            type="range" min={1} max={30} value={speed}
            onChange={e => setSpeed(+e.target.value)}
            className="w-24 accent-accent-teal"
          />
          <span className="text-text-secondary font-medium">{speed}/frame</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">Electrons landed: <strong className="text-accent-teal">{count.toLocaleString()}</strong></span>
      </div>
    </div>
  )
}
