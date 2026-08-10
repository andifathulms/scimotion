'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 260
const CX = W / 2
const CY = 118 // vertical centre of the vessel
const BASE_HALF = 46 // half-height of the vessel at r = 1.0
const VESSEL_X0 = 40
const VESSEL_X1 = W - 40
const N_PARTICLES = 130
const BASE_SPEED = 2.6 // px/frame at r = 1.0

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const GREEN = '#10B981'

type Particle = { x: number; yn: number; speed: number }

const rand = () => Math.random()

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  radius: { default: 1, min: 0.3, max: 1.5, step: 0.01 },
}

export function VascularResistanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const partsRef = useRef<Particle[]>([])
  const { params, set, permalink, isDefault, restored } = useWidgetParams('vascular-resistance', SPEC)
  const { radius } = params
  const [running, setRunning] = useState(false)
  const radiusRef = useRef(radius)
  useEffect(() => {
    radiusRef.current = radius
  })

  // fourth-power law at fixed driving pressure
  const flowRel = radius ** 4 // Q ∝ r^4
  const resistRel = 1 / radius ** 4 // R ∝ 1/r^4

  const seed = useCallback(() => {
    const out: Particle[] = []
    for (let i = 0; i < N_PARTICLES; i++) {
      out.push({
        x: VESSEL_X0 + rand() * (VESSEL_X1 - VESSEL_X0),
        yn: rand() * 2 - 1, // normalized position across the vessel, [-1, 1]
        speed: 0.85 + rand() * 0.3,
      })
    }
    partsRef.current = out
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const r = radiusRef.current
    const half = BASE_HALF * r

    ctx.clearRect(0, 0, W, H)

    // faint grid
    ctx.strokeStyle = 'rgba(244,114,182,0.06)'
    ctx.lineWidth = 1
    for (let gx = 0; gx <= W; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }

    // baseline (r = 1) vessel outline, for comparison
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(VESSEL_X0, CY - BASE_HALF); ctx.lineTo(VESSEL_X1, CY - BASE_HALF); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(VESSEL_X0, CY + BASE_HALF); ctx.lineTo(VESSEL_X1, CY + BASE_HALF); ctx.stroke()
    ctx.setLineDash([])

    // current vessel walls
    ctx.strokeStyle = 'rgba(245,240,232,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(VESSEL_X0, CY - half); ctx.lineTo(VESSEL_X1, CY - half); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(VESSEL_X0, CY + half); ctx.lineTo(VESSEL_X1, CY + half); ctx.stroke()

    // lumen tint
    ctx.fillStyle = 'rgba(244,114,182,0.05)'
    ctx.fillRect(VESSEL_X0, CY - half, VESSEL_X1 - VESSEL_X0, 2 * half)

    // blood particles
    for (const p of partsRef.current) {
      const y = CY + p.yn * half
      ctx.beginPath()
      ctx.arc(p.x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = PINK
      ctx.fill()
    }

    // radius caliper
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(VESSEL_X0 + 16, CY - half); ctx.lineTo(VESSEL_X0 + 16, CY + half); ctx.stroke()
    ctx.fillStyle = BLUE
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`radius ${r.toFixed(2)}×`, VESSEL_X0 + 22, CY - half - 8)

    // readouts (top-right)
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = GREEN
    ctx.fillText(`flow  ${(r ** 4 * 100).toFixed(1)}%`, W - 16, 30)
    ctx.fillStyle = GOLD
    ctx.fillText(`resistance  ${(100 / r ** 4).toFixed(0)}%`, W - 16, 50)

    ctx.textAlign = 'left'
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('Q ∝ r⁴   ·   R ∝ 1/r⁴   (at fixed ΔP)', 16, H - 14)

    // callout when radius is halved
    if (Math.abs(r - 0.5) < 0.03) {
      ctx.fillStyle = GOLD
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('half the radius → 1/16 the flow', CX, CY + BASE_HALF + 34)
    }
  }, [])

  const step = useCallback(() => {
    const r = radiusRef.current
    const half = BASE_HALF * r
    const v = BASE_SPEED * r * r // mean velocity ∝ r^2 (since Q/A = r^4/r^2)
    for (const p of partsRef.current) {
      p.x += v * p.speed
      if (p.x > VESSEL_X1) {
        p.x = VESSEL_X0
        p.yn = rand() * 2 - 1
      }
      // keep within the current lumen
      if (Math.abs(p.yn * half) > half) p.yn = rand() * 2 - 1
    }
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [radius, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('radius', 1)
    radiusRef.current = 1
    seed()
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Poiseuille&apos;s fourth-power law
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Vessel radius:</span>
          <input
            type="range" min={SPEC.radius.min} max={SPEC.radius.max} step={SPEC.radius.step} value={radius}
            onChange={e => set('radius', +e.target.value)}
            className="w-44 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{radius.toFixed(2)}×</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          flow <strong style={{ color: GREEN }}>{(flowRel * 100).toFixed(0)}%</strong>{' '}
          · resistance <strong style={{ color: GOLD }}>{(resistRel * 100).toFixed(0)}%</strong>
        </span>
      </div>
    </div>
  )
}
