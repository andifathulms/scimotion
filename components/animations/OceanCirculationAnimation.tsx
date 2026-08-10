'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// Map geometry. y = 20 is 70N, y = 280 is 70S, equator at y = 150.
const Y_TOP = 20
const Y_BOT = 280
const Y_EQ = 150
const DEG_PER_PX = 140 / (Y_BOT - Y_TOP)
const ACC_Y = 248 // south of this the Southern Ocean is unobstructed

const OMEGA_EARTH = 7.292e-5 // rad/s

type Basin = { x0: number; x1: number; name: string }
const BASINS: Basin[] = [
  { x0: 40, x1: 244, name: 'Pacific' },
  { x0: 292, x1: 436, name: 'Atlantic' },
  { x0: 476, x1: 578, name: 'Indian' },
]

// Wind-driven gyre cells, in canvas y. `s` is the sign of the streamfunction:
// +1 gives a clockwise gyre (northern subtropical), -1 anticlockwise.
type Cell = { y0: number; y1: number; s: number }
const CELLS: Cell[] = [
  { y0: 22, y1: 76, s: -1 }, // subpolar north
  { y0: 76, y1: 146, s: 1 }, // subtropical north
  { y0: 154, y1: 224, s: -1 }, // subtropical south
  { y0: 224, y1: 246, s: 1 }, // subpolar south
]

// Prevailing zonal winds, positive = eastward. Purely schematic bands.
const WIND: { y: number; u: number; label: string }[] = [
  { y: 36, u: -1, label: 'polar easterlies' },
  { y: 92, u: 1, label: 'westerlies' },
  { y: 130, u: -1, label: 'NE trades' },
  { y: 150, u: 0, label: 'doldrums' },
  { y: 172, u: -1, label: 'SE trades' },
  { y: 212, u: 1, label: 'westerlies' },
  { y: 264, u: 1, label: 'westerlies' },
]

const AMP = 34
const N_PARTICLES = 340
const TRAIL = 9
const DEFAULT_OMEGA = 1

type Pt = { x: number; y: number }
type Particle = { x: number; y: number; age: number; trail: Pt[] }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

function basinAt(x: number): Basin | null {
  for (const b of BASINS) if (x >= b.x0 && x <= b.x1) return b
  return null
}

function windU(y: number): number {
  if (y <= WIND[0].y) return WIND[0].u
  const last = WIND[WIND.length - 1]
  if (y >= last.y) return last.u
  for (let i = 1; i < WIND.length; i++) {
    if (y <= WIND[i].y) {
      const a = WIND[i - 1]
      const b = WIND[i]
      const t = (y - a.y) / (b.y - a.y)
      return a.u + (b.u - a.u) * t
    }
  }
  return 0
}

// Stommel-style streamfunction for one basin cell. `w` is the rotation weight:
// it sets the width of the western boundary layer, so faster rotation squeezes
// the return flow into a narrower, faster jet on the western side.
function psi(x: number, y: number, w: number): number {
  if (y >= ACC_Y || y <= Y_TOP) return 0
  const b = basinAt(x)
  if (!b) return 0
  let cell: Cell | null = null
  for (const c of CELLS) if (y >= c.y0 && y <= c.y1) cell = c
  if (!cell) return 0

  const span = cell.y1 - cell.y0
  const t = (cell.y1 - y) / span // 0 at the southern edge, 1 at the northern
  const L = b.x1 - b.x0
  const u = (x - b.x0) / L
  const delta = L / (2 + 15 * w) // western boundary layer width
  const g = 1 - u - Math.exp((-u * L) / delta)
  return cell.s * AMP * Math.sin(Math.PI * t) * g
}

// Velocity from the streamfunction by central differences, blended against a
// purely zonal wind-driven flow. At zero rotation the blend is all zonal:
// water simply follows the wind, piles against the coast, and no gyre closes.
function velocity(x: number, y: number, w: number): Pt {
  if (y >= ACC_Y) {
    // Unobstructed Southern Ocean: a circumpolar band, wind-driven either way.
    const taper = clamp((Y_BOT - y) / 24, 0.25, 1)
    return { x: 1.7 * taper, y: 0 }
  }
  const h = 1.1
  const dpdy = (psi(x, y + h, w) - psi(x, y - h, w)) / (2 * h)
  const dpdx = (psi(x + h, y, w) - psi(x - h, y, w)) / (2 * h)
  // canvas y points down, so non-divergent flow is u = +dpsi/dy, v = -dpsi/dx
  const ug = dpdy
  const vg = -dpdx
  const uz = windU(y) * 1.7
  return { x: w * ug + (1 - w) * uz, y: w * vg }
}

function spawn(): Particle {
  const b = BASINS[Math.floor(Math.random() * BASINS.length)]
  const inSouthern = Math.random() < 0.16
  const x = inSouthern
    ? 6 + Math.random() * (W - 12)
    : b.x0 + 2 + Math.random() * (b.x1 - b.x0 - 4)
  const y = inSouthern
    ? ACC_Y + Math.random() * (Y_BOT - ACC_Y)
    : Y_TOP + 4 + Math.random() * (ACC_Y - Y_TOP - 8)
  return { x, y, age: Math.floor(Math.random() * 300), trail: [] }
}

function speedColor(sp: number): string {
  if (sp > 2.2) return GOLD
  if (sp > 1.1) return CYAN
  if (sp > 0.4) return BLUE
  return VIOLET
}

function formatF(f: number): string {
  if (f === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(f)))
  return `${(f / Math.pow(10, e)).toFixed(2)}e${e}`
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  omega: { default: DEFAULT_OMEGA, min: 0, max: 2, step: 0.05 },
}

export function OceanCirculationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const partsRef = useRef<Particle[]>([])
  const omegaRef = useRef(DEFAULT_OMEGA)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('ocean-circulation', SPEC)
  const { omega } = params
  const [running, setRunning] = useState(false)

  useEffect(() => {
    omegaRef.current = omega
  }, [omega])

  const seed = useCallback(() => {
    partsRef.current = Array.from({ length: N_PARTICLES }, spawn)
  }, [])

  const step = useCallback(() => {
    const om = omegaRef.current
    const w = 1 - Math.exp(-2.5 * om)

    for (const p of partsRef.current) {
      const v = velocity(p.x, p.y, w)
      p.x += v.x
      p.y += v.y
      p.age += 1

      if (p.y >= ACC_Y) {
        // wrap around the globe in the circumpolar channel
        if (p.x > W + 2) {
          p.x -= W + 4
          p.trail.length = 0
        }
        if (p.x < -2) {
          p.x += W + 4
          p.trail.length = 0
        }
      } else {
        const b = basinAt(p.x)
        if (b) {
          // water piles against the coast rather than crossing it
          p.x = clamp(p.x, b.x0 + 1, b.x1 - 1)
        } else {
          p.x = clamp(p.x, 2, W - 2)
        }
      }
      p.y = clamp(p.y, Y_TOP + 2, Y_BOT - 2)

      const moved = Math.hypot(v.x, v.y)
      if (p.age > 520 || (moved < 0.05 && p.age > 90)) {
        const n = spawn()
        p.x = n.x
        p.y = n.y
        p.age = 0
        p.trail.length = 0
      }

      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > TRAIL) p.trail.shift()
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const om = omegaRef.current
    const w = 1 - Math.exp(-2.5 * om)

    ctx.clearRect(0, 0, W, H)

    // ocean
    ctx.fillStyle = 'rgba(34,211,238,0.05)'
    ctx.fillRect(0, Y_TOP, W, Y_BOT - Y_TOP)

    // continents (the Southern Ocean band below ACC_Y is unobstructed)
    ctx.fillStyle = 'rgba(245,240,232,0.10)'
    let prev = 0
    for (const b of BASINS) {
      if (b.x0 > prev) ctx.fillRect(prev, Y_TOP, b.x0 - prev, ACC_Y - Y_TOP)
      prev = b.x1
    }
    if (prev < W) ctx.fillRect(prev, Y_TOP, W - prev, ACC_Y - Y_TOP)

    // latitude grid
    ctx.strokeStyle = 'rgba(255,245,235,0.07)'
    ctx.lineWidth = 1
    ctx.font = '9px monospace'
    for (const lat of [60, 30, 0, -30, -60]) {
      const y = Y_EQ - lat / DEG_PER_PX
      ctx.beginPath()
      ctx.setLineDash(lat === 0 ? [] : [3, 5])
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.strokeStyle =
        lat === 0 ? 'rgba(255,245,235,0.16)' : 'rgba(255,245,235,0.07)'
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,240,232,0.28)'
      const tag = lat === 0 ? 'EQ' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`
      ctx.fillText(tag, 4, y - 3)
    }

    // prevailing winds, drawn over the land columns
    ctx.font = '8px monospace'
    for (const band of WIND) {
      if (band.u === 0) continue
      for (const lx of [264, 456]) {
        const dir = band.u > 0 ? 1 : -1
        const x0 = lx - dir * 10
        const x1 = lx + dir * 10
        ctx.strokeStyle = 'rgba(245,158,11,0.55)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(x0, band.y)
        ctx.lineTo(x1, band.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x1, band.y)
        ctx.lineTo(x1 - dir * 4, band.y - 3)
        ctx.lineTo(x1 - dir * 4, band.y + 3)
        ctx.closePath()
        ctx.fillStyle = 'rgba(245,158,11,0.55)'
        ctx.fill()
      }
    }

    // tracer trails
    for (const p of partsRef.current) {
      if (p.trail.length < 2) continue
      const a = p.trail[p.trail.length - 2]
      const b = p.trail[p.trail.length - 1]
      const sp = Math.hypot(b.x - a.x, b.y - a.y)
      const col = speedColor(sp)
      ctx.lineWidth = sp > 2.2 ? 1.7 : 1.2
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * 0.8
        ctx.beginPath()
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
        ctx.lineTo(p.trail[i].x, p.trail[i].y)
        ctx.strokeStyle =
          col +
          Math.floor(alpha * 255)
            .toString(16)
            .padStart(2, '0')
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(b.x, b.y, 1.3, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    }

    // readout panel
    const f45 = 2 * OMEGA_EARTH * om * Math.sin(Math.PI / 4)
    const deflect = 45 * (1 - Math.exp(-3 * om))
    ctx.fillStyle = 'rgba(15,13,10,0.78)'
    ctx.fillRect(8, Y_TOP + 6, 168, 46)
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.strokeRect(8, Y_TOP + 6, 168, 46)
    ctx.font = '10px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(`rotation  ${om.toFixed(2)} x Earth`, 15, Y_TOP + 20)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`f at 45N  ${formatF(f45)} s^-1`, 15, Y_TOP + 33)
    ctx.fillStyle = om < 0.02 ? 'rgba(245,240,232,0.4)' : GOLD
    ctx.fillText(`Ekman turn ${deflect.toFixed(0)}deg right`, 15, Y_TOP + 46)

    // little wind -> water deflection glyph, bottom left
    const gx = 40
    const gy = 268
    const ang = (deflect * Math.PI) / 180
    ctx.strokeStyle = 'rgba(245,158,11,0.8)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + 26, gy)
    ctx.stroke()
    ctx.strokeStyle = CYAN
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + 26 * Math.cos(ang), gy + 26 * Math.sin(ang))
    ctx.stroke()
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('wind', gx + 29, gy + 3)
    ctx.fillStyle = CYAN
    ctx.fillText('surface water', gx + 29, gy + 14)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    for (const b of BASINS) ctx.fillText(b.name, b.x0 + 6, Y_BOT - 46)

    if (w > 0.35) {
      ctx.fillStyle = 'rgba(245,158,11,0.75)'
      ctx.font = '8px monospace'
      ctx.fillText('western boundary jet', BASINS[1].x0 + 3, 108)
    }
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
        settle(220)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(60)
    draw()
  }, [seed, settle, draw])

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
  }, [omega, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('omega', DEFAULT_OMEGA)
    omegaRef.current = DEFAULT_OMEGA
    seed()
    settle(60)
    draw()
  }

  const label =
    omega < 0.02
      ? 'no rotation — wind only'
      : omega < 0.45
        ? 'weak rotation — broad, sluggish gyres'
        : omega < 1.5
          ? 'Earth-like — closed gyres, western intensification'
          : 'fast rotation — very narrow boundary jets'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Wind-driven surface circulation
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
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          role="img"
          aria-label="Animated diagram: Wind-driven surface circulation. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Rotation:</span>
          <input
            type="range"
            min={SPEC.omega.min}
            max={SPEC.omega.max}
            step={SPEC.omega.step}
            value={omega}
            onChange={e => set('omega', +e.target.value)}
            className="w-44"
            style={{ accentColor: CYAN }}
          />
          <span className="font-mono text-text-secondary">
            {omega.toFixed(2)}×
          </span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">{label}</WidgetStatus>
      </div>
    </div>
  )
}
