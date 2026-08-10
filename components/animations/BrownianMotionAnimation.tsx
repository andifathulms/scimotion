'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 280
const MAX_TRAIL = 300

type Particle = {
  x: number
  y: number
  trail: { x: number; y: number }[]
  color: string
  size: number
  stepScale: number
}

const COLORS = ['#F59E0B', '#A78BFA', '#10B981', '#60A5FA', '#F472B6']

function makeParticle(i: number): Particle {
  return {
    x: W / 2 + (Math.random() - 0.5) * 60,
    y: H / 2 + (Math.random() - 0.5) * 60,
    trail: [],
    color: COLORS[i % COLORS.length],
    size: 5,
    stepScale: 1,
  }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  count: { default: 3, min: 1, max: 5, step: 1 },
  stepSize: { default: 4, min: 1, max: 12, step: 1 },
}

export function BrownianMotionAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('brownian-motion', SPEC)
  const { count, stepSize } = params
  const [showTrail, setShowTrail] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(0)

  const init = (n: number) => {
    particlesRef.current = Array.from({ length: n }, (_, i) => makeParticle(i))
    elapsedRef.current = 0
    setElapsed(0)
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

    // Center cross
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
    ctx.setLineDash([])

    particlesRef.current.forEach(p => {
      if (showTrail && p.trail.length > 1) {
        for (let i = 1; i < p.trail.length; i++) {
          const alpha = (i / p.trail.length) * 0.7
          ctx.beginPath()
          ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
          ctx.lineTo(p.trail[i].x, p.trail[i].y)
          ctx.strokeStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
      }

      // Glow
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16)
      g.addColorStop(0, p.color + '55')
      g.addColorStop(1, p.color + '00')
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2)
      ctx.fillStyle = g; ctx.fill()

      // Dot
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color; ctx.fill()
    })

    // MSD label
    if (particlesRef.current.length > 0 && elapsedRef.current > 5) {
      const msd = particlesRef.current.reduce((acc, p) => {
        const dx = p.x - W / 2; const dy = p.y - H / 2
        return acc + dx * dx + dy * dy
      }, 0) / particlesRef.current.length
      ctx.fillStyle = 'rgba(255,245,235,0.35)'
      ctx.font = '10px monospace'
      ctx.fillText(`MSD = ${Math.round(msd)} px²   t = ${elapsedRef.current}`, 10, H - 10)
    }
  }

  useEffect(() => {
    init(count)
    draw()
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) { draw(); return }
    const tick = () => {
      particlesRef.current.forEach(p => {
        const angle = Math.random() * Math.PI * 2
        const step = (Math.random() * 0.5 + 0.5) * stepSize
        p.x = Math.max(6, Math.min(W - 6, p.x + Math.cos(angle) * step))
        p.y = Math.max(6, Math.min(H - 6, p.y + Math.sin(angle) * step))
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > MAX_TRAIL) p.trail.shift()
      })
      elapsedRef.current += 1
      if (elapsedRef.current % 5 === 0) setElapsed(elapsedRef.current)
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, stepSize]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
  }, [triggered])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    init(count)
    triggerReset()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Brownian Motion</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas role="img" aria-label="Animated diagram: Brownian Motion. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors">
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Particles:</span>
          <input type="range" min={SPEC.count.min} max={SPEC.count.max} step={SPEC.count.step} value={count}
            onChange={e => set('count', +e.target.value)}
            className="w-16 accent-accent-gold" />
          <span className="font-mono">{count}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Step:</span>
          <input type="range" min={SPEC.stepSize.min} max={SPEC.stepSize.max} step={SPEC.stepSize.step} value={stepSize}
            onChange={e => set('stepSize', +e.target.value)}
            className="w-16 accent-accent-gold" />
          <span className="font-mono">{stepSize}px</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={showTrail} onChange={e => setShowTrail(e.target.checked)}
            className="accent-accent-gold" />
          Trail
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">t = {elapsed}</WidgetStatus>
      </div>
    </div>
  )
}
