'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 400
const BG = '#0F0D0A'

const CX = 300
const CY = 205
const R0 = 172 // rim radius where air starts
const R_MIN = 20 // radius at which a parcel is reabsorbed

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'

const AGE_MAX = 220
const OMEGA = (2.2 * Math.PI) / AGE_MAX // angular sweep per frame
const K = 2.24 / AGE_MAX // radial shrink rate per frame
const TRAIL = 46
const NPARCELS = 6

type Parcel = { age: number; theta0: number }

// rotate a screen-space vector 90° to the visual RIGHT of its direction
// (with y pointing down, "up" (0,-1) maps to "right" (1,0))
function right90(x: number, y: number): [number, number] {
  return [-y, x]
}

export function CoriolisWindAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const parcelsRef = useRef<Parcel[]>([])
  const spawnRef = useRef(0)

  const [north, setNorth] = useState(true)
  const [playing, setPlaying] = useState(false)

  const northRef = useRef(north)
  useEffect(() => {
    northRef.current = north
  }, [north])

  const seed = useCallback(() => {
    const out: Parcel[] = []
    for (let i = 0; i < NPARCELS; i++) {
      out.push({ age: -(i * (AGE_MAX / NPARCELS)), theta0: i * 2.399 })
    }
    parcelsRef.current = out
    spawnRef.current = NPARCELS
  }, [])

  // position of a parcel at a given age, given hemisphere sign
  const posAt = (theta0: number, age: number, sign: number): [number, number, number] => {
    const r = R0 * Math.exp(-K * age)
    const theta = theta0 + sign * OMEGA * age
    return [CX + r * Math.cos(theta), CY + r * Math.sin(theta), r]
  }

  const step = useCallback(() => {
    for (const p of parcelsRef.current) {
      p.age += 1
      const r = R0 * Math.exp(-K * p.age)
      if (r <= R_MIN || p.age > AGE_MAX) {
        p.age = 0
        p.theta0 = spawnRef.current * 2.399
        spawnRef.current += 1
      }
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== Math.round(W * dpr)) {
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)
    ctx.font = '11px monospace'

    const sign = northRef.current ? 1 : -1

    // ---- pressure field: isobars, HIGH outside, LOW at centre ----
    for (let i = 1; i <= 5; i++) {
      const rr = (R0 * i) / 5
      ctx.beginPath()
      ctx.arc(CX, CY, rr, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(96,165,250,${(0.06 + 0.03 * (5 - i)).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
    // low centre
    ctx.beginPath()
    ctx.arc(CX, CY, R_MIN, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(34,211,238,0.12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(34,211,238,0.5)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = CYAN
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('L', CX, CY + 6)
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(96,165,250,0.7)'
    ctx.fillText('HIGH pressure', CX, CY - R0 + 14)
    ctx.fillText('HIGH pressure', CX, CY + R0 - 6)
    ctx.textAlign = 'left'

    // ---- parcels + trails ----
    parcelsRef.current.forEach((p, idx) => {
      if (p.age < 1) return
      // trail
      ctx.beginPath()
      let moved = false
      for (let t = Math.max(1, p.age - TRAIL); t <= p.age; t++) {
        const [x, y] = posAt(p.theta0, t, sign)
        if (!moved) {
          ctx.moveTo(x, y)
          moved = true
        } else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = idx === 0 ? 'rgba(245,158,11,0.85)' : 'rgba(245,158,11,0.4)'
      ctx.lineWidth = idx === 0 ? 2.2 : 1.5
      ctx.stroke()

      const [hx, hy] = posAt(p.theta0, p.age, sign)
      ctx.beginPath()
      ctx.arc(hx, hy, idx === 0 ? 5 : 3.2, 0, Math.PI * 2)
      ctx.fillStyle = GOLD
      ctx.fill()
    })

    // ---- force decomposition on the highlighted parcel ----
    const lead = parcelsRef.current[0]
    if (lead && lead.age >= 6 && lead.age < AGE_MAX - 4) {
      const [x, y, r] = posAt(lead.theta0, lead.age, sign)
      const theta = lead.theta0 + sign * OMEGA * lead.age
      // velocity (analytic tangent of the spiral)
      let vx = -K * r * Math.cos(theta) + r * sign * OMEGA * -Math.sin(theta)
      let vy = -K * r * Math.sin(theta) + r * sign * OMEGA * Math.cos(theta)
      const vm = Math.hypot(vx, vy) || 1
      vx /= vm
      vy /= vm

      // pressure-gradient force: radially inward toward the low
      const inx = (CX - x) / (r || 1)
      const iny = (CY - y) / (r || 1)
      const L = 46
      ctx.strokeStyle = BLUE
      ctx.lineWidth = 2.4
      drawArrow(ctx, x, y, x + inx * L, y + iny * L)
      ctx.fillStyle = BLUE
      ctx.fillText('pressure-gradient', x + inx * L + 6, y + iny * L + 4)

      // Coriolis deflection: 90° to the right of motion (NH), left (SH)
      let [rx, ry] = right90(vx, vy)
      rx *= sign
      ry *= sign
      ctx.strokeStyle = CYAN
      ctx.lineWidth = 2.4
      drawArrow(ctx, x, y, x + rx * L, y + ry * L)
      ctx.fillStyle = CYAN
      ctx.fillText('Coriolis', x + rx * L + 6, y + ry * L + 4)
    }

    // spin-sense label
    ctx.fillStyle = GOLD
    ctx.textAlign = 'left'
    const spin = sign > 0 ? 'counterclockwise (NH low)' : 'clockwise (SH low)'
    ctx.fillText(`wind spirals in ${spin}`, 14, H - 16)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('air is deflected instead of flowing straight into the low', 14, 24)
  }, [])

  const settle = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) step()
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(150)
        draw()
      } else {
        setPlaying(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(40)
    draw()
  }, [seed, settle, draw])

  useEffect(() => {
    if (!playing) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, step, draw])

  useEffect(() => {
    if (!playing) draw()
  }, [north, playing, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setPlaying(false)
    triggerReset()
    seed()
    settle(40)
    draw()
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: BG, aspectRatio: `${W} / ${H}` }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          hemisphere = <strong className="text-accent-gold">{north ? 'Northern' : 'Southern'}</strong>
        </span>
        <span>
          deflection = <strong style={{ color: CYAN }}>{north ? 'to the right' : 'to the left'}</strong>
        </span>
        <span>
          circulation = <strong style={{ color: GOLD }}>{north ? 'counterclockwise' : 'clockwise'}</strong>
        </span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setPlaying(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <button
          onClick={() => setNorth(n => !n)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          Flip hemisphere → {north ? 'Southern' : 'Northern'}
        </button>
      </div>
    </div>
  )
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 8 * Math.cos(a - 0.4), y2 - 8 * Math.sin(a - 0.4))
  ctx.lineTo(x2 - 8 * Math.cos(a + 0.4), y2 - 8 * Math.sin(a + 0.4))
  ctx.closePath()
  ctx.fill()
}
