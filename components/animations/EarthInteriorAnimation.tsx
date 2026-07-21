'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 400

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const GREEN = '#10B981'

// Real layer radii, km.
const R_EARTH = 6371
const R_CMB = 3480 // core–mantle boundary
const R_ICB = 1220 // inner-core boundary
const R_MOHO = 6336 // ~35 km of continental crust

// Screen geometry.
const CX = 232
const CY = 200
const RPX = 168
const SCALE = RPX / R_EARTH

// Shadow-zone limits in epicentral degrees.
const GRAZE = 103 // last direct P and S to leave the mantle
const PKP_MIN = 142 // first P to come back out through the core

const DEG = Math.PI / 180

type Pt = { x: number; y: number }

// Polar (radius km, angular distance from the epicentre) → canvas, with the
// epicentre rotated to `origin` degrees measured clockwise from straight up.
function toXY(r: number, deltaDeg: number, origin: number): Pt {
  const a = (origin + deltaDeg - 90) * DEG
  return { x: CX + r * SCALE * Math.cos(a), y: CY + r * SCALE * Math.sin(a) }
}

type Ray = {
  kind: 'mantle' | 'pkp' | 'pkikp'
  delta: number // total epicentral distance, degrees
  pts: Pt[] // built at draw time for the current epicentre
  cmbHit: Pt | null // where an S wave would die, if it reaches the core
}

// Mantle turning rays: down, bottoming out, back up. Deeper turning point →
// larger epicentral distance, up to the ~103° ray that grazes the core.
const MANTLE = [0.2, 0.36, 0.52, 0.66, 0.79, 0.9, 1].map(s => ({
  delta: GRAZE * Math.pow(s, 0.86),
  rTurn: R_EARTH - (R_EARTH - R_CMB) * Math.pow(s, 1.1),
}))

// Core-penetrating rays. d1 is the mantle down-leg, d2 the span inside the
// core, rMin the deepest radius reached. These are schematic: they reproduce
// the observed emergence distances, not a computed travel-time model.
const CORE = [
  { d1: 34, d2: 76, rMin: 2600, inner: false },
  { d1: 33, d2: 92, rMin: 2250, inner: false },
  { d1: 32, d2: 108, rMin: 1900, inner: false },
  { d1: 24, d2: 126, rMin: 820, inner: true },
  { d1: 20, d2: 140, rMin: 380, inner: true },
]

function buildRays(origin: number): Ray[] {
  const out: Ray[] = []

  for (const m of MANTLE) {
    const pts: Pt[] = []
    const N = 40
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * m.delta
      const r = R_EARTH - (R_EARTH - m.rTurn) * Math.pow(Math.sin((Math.PI * d) / m.delta), 0.8)
      pts.push(toXY(r, d, origin))
    }
    out.push({ kind: 'mantle', delta: m.delta, pts, cmbHit: null })
  }

  for (const c of CORE) {
    const pts: Pt[] = []
    const total = 2 * c.d1 + c.d2
    // down-leg through the mantle
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      const r = R_EARTH - (R_EARTH - R_CMB) * Math.pow(u, 1.35)
      pts.push(toXY(r, u * c.d1, origin))
    }
    const cmbHit = toXY(R_CMB, c.d1, origin)
    // leg inside the core, bent sharply toward the centre by the velocity drop
    for (let i = 1; i <= 30; i++) {
      const u = i / 30
      const r = R_CMB - (R_CMB - c.rMin) * Math.pow(Math.sin(Math.PI * u), 0.75)
      pts.push(toXY(r, c.d1 + u * c.d2, origin))
    }
    // up-leg through the mantle
    for (let i = 1; i <= 16; i++) {
      const u = i / 16
      const r = R_CMB + (R_EARTH - R_CMB) * Math.pow(u, 1 / 1.35)
      pts.push(toXY(r, c.d1 + c.d2 + u * c.d1, origin))
    }
    out.push({ kind: c.inner ? 'pkikp' : 'pkp', delta: total, pts, cmbHit })
  }

  return out
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = 'rgba(245,240,232,0.5)',
  size = 9
) {
  ctx.font = `${size}px monospace`
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

// A ring sector on the surface, used to shade the shadow zones.
function surfaceBand(
  ctx: CanvasRenderingContext2D,
  origin: number,
  from: number,
  to: number,
  color: string,
  thickness = 11
) {
  for (const s of [1, -1]) {
    const a0 = (origin + s * from - 90) * DEG
    const a1 = (origin + s * to - 90) * DEG
    ctx.beginPath()
    ctx.arc(CX, CY, RPX, Math.min(a0, a1), Math.max(a0, a1))
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.stroke()
  }
}

const STATIONS = Array.from({ length: 25 }, (_, i) => (i - 12) * 15)

export function EarthInteriorAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const progRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [origin, setOrigin] = useState(0) // epicentre position, degrees
  const [wave, setWave] = useState<'p' | 's'>('s')

  const originRef = useRef(origin)
  const waveRef = useRef(wave)
  useEffect(() => {
    originRef.current = origin
  }, [origin])
  useEffect(() => {
    waveRef.current = wave
  }, [wave])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const org = originRef.current
    const mode = waveRef.current
    const prog = progRef.current
    const rays = buildRays(org)

    ctx.clearRect(0, 0, W, H)

    // ---- layers -----------------------------------------------------------
    const disc = (r: number, fill: string, stroke: string, lw = 1.2) => {
      ctx.beginPath()
      ctx.arc(CX, CY, r * SCALE, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = stroke
      ctx.lineWidth = lw
      ctx.stroke()
    }
    disc(R_EARTH, 'rgba(34,211,238,0.05)', 'rgba(34,211,238,0.55)', 1.6)
    disc(R_MOHO, 'rgba(34,211,238,0.05)', 'rgba(34,211,238,0.22)', 1)
    disc(R_CMB, 'rgba(245,158,11,0.10)', `${GOLD}AA`, 1.5)
    disc(R_ICB, 'rgba(167,139,250,0.18)', `${VIOLET}CC`, 1.4)

    label(ctx, 'mantle', CX - 22, CY - RPX + 46, 'rgba(34,211,238,0.6)', 9)
    label(ctx, 'liquid outer core', CX - 46, CY - R_CMB * SCALE + 20, GOLD, 9)
    label(ctx, 'solid inner core', CX - 40, CY + R_ICB * SCALE + 15, VIOLET, 8)

    // ---- shadow zones -----------------------------------------------------
    if (mode === 's') {
      surfaceBand(ctx, org, GRAZE, 180, 'rgba(34,211,238,0.16)', 13)
      surfaceBand(ctx, org, GRAZE, 180, 'rgba(34,211,238,0.5)', 2)
    } else {
      surfaceBand(ctx, org, GRAZE, PKP_MIN, 'rgba(245,158,11,0.18)', 13)
      surfaceBand(ctx, org, GRAZE, PKP_MIN, 'rgba(245,158,11,0.55)', 2)
    }

    // ---- rays -------------------------------------------------------------
    const partial = (pts: Pt[], p: number) => {
      const n = Math.max(2, Math.floor(pts.length * p))
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }

    for (const ray of rays) {
      if (mode === 's') {
        if (ray.kind === 'mantle') {
          ctx.strokeStyle = `${CYAN}CC`
          ctx.lineWidth = 1.3
          partial(ray.pts, prog)
        } else if (ray.cmbHit) {
          // An S wave reaching the core simply stops: shear needs rigidity.
          const stub = ray.pts.slice(0, 17)
          ctx.strokeStyle = `${CYAN}88`
          ctx.lineWidth = 1.2
          partial(stub, prog)
          if (prog > 0.85) {
            const { x, y } = ray.cmbHit
            ctx.strokeStyle = GOLD
            ctx.lineWidth = 1.6
            ctx.beginPath()
            ctx.moveTo(x - 4, y - 4)
            ctx.lineTo(x + 4, y + 4)
            ctx.moveTo(x + 4, y - 4)
            ctx.lineTo(x - 4, y + 4)
            ctx.stroke()
          }
        }
      } else {
        ctx.strokeStyle =
          ray.kind === 'mantle' ? `${GOLD}CC` : ray.kind === 'pkp' ? `${BLUE}CC` : `${VIOLET}DD`
        ctx.lineWidth = ray.kind === 'pkikp' ? 1.5 : 1.3
        partial(ray.pts, prog)
      }
    }

    // ---- stations ---------------------------------------------------------
    for (const dRaw of STATIONS) {
      const delta = Math.abs(dRaw)
      const { x, y } = toXY(R_EARTH, dRaw, org)
      const nx = (x - CX) / RPX
      const ny = (y - CY) / RPX
      let col = GREEN
      if (delta > GRAZE && delta < PKP_MIN) col = 'rgba(245,240,232,0.22)'
      else if (delta >= PKP_MIN) col = BLUE
      ctx.beginPath()
      ctx.moveTo(x + nx * 9, y + ny * 9)
      ctx.lineTo(x - ny * 4, y + nx * 4)
      ctx.lineTo(x + ny * 4, y - nx * 4)
      ctx.closePath()
      ctx.fillStyle = col
      ctx.fill()
    }

    // ---- epicentre --------------------------------------------------------
    const ep = toXY(R_EARTH, 0, org)
    ctx.beginPath()
    ctx.arc(ep.x, ep.y, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ep.x, ep.y, 5.5 + 9 * (1 - prog), 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(245,158,11,${0.5 * (1 - prog)})`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // degree ticks every 30°
    for (let d = -180; d < 180; d += 30) {
      const a = toXY(R_EARTH, d, org)
      const b = toXY(R_EARTH * 1.045, d, org)
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // ---- captions ---------------------------------------------------------
    ctx.font = '11px monospace'
    ctx.fillStyle = mode === 's' ? CYAN : GOLD
    ctx.fillText(
      mode === 's' ? 'S waves — shear, cannot cross a liquid' : 'P waves — compressional, cross everything',
      12,
      20
    )
    label(
      ctx,
      mode === 's'
        ? `no direct S anywhere beyond Δ = ${GRAZE}°: a shadow over 39% of the surface`
        : `P shadow between Δ = ${GRAZE}° and ${PKP_MIN}°, from refraction at the core`,
      12,
      34,
      'rgba(245,240,232,0.5)',
      9
    )

    const legend: [string, string][] =
      mode === 's'
        ? [
            ['direct S through the mantle', CYAN],
            ['S absorbed at the core–mantle boundary', GOLD],
          ]
        : [
            ['P turning in the mantle (Δ < 103°)', GOLD],
            ['PKP through the outer core (Δ > 142°)', BLUE],
            ['PKIKP through the inner core', VIOLET],
          ]
    legend.forEach(([t, c], i) => {
      const y = H - 78 + i * 14
      ctx.strokeStyle = c
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(430, y - 3)
      ctx.lineTo(446, y - 3)
      ctx.stroke()
      label(ctx, t, 452, y, 'rgba(245,240,232,0.5)', 8)
    })

    const keys: [string, string][] = [
      ['records P and S', GREEN],
      ['records nothing direct', 'rgba(245,240,232,0.3)'],
      ['records P only, no S', BLUE],
    ]
    keys.forEach(([t, c], i) => {
      const y = H - 34 + i * 12
      ctx.beginPath()
      ctx.arc(436, y - 3, 3, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
      label(ctx, t, 446, y, 'rgba(245,240,232,0.45)', 8)
    })

    label(ctx, 'radii to scale · ray paths schematic', 12, H - 12, 'rgba(245,240,232,0.28)', 8)
    label(ctx, `6371 / 3480 / 1220 km`, 12, H - 24, 'rgba(245,240,232,0.28)', 8)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        progRef.current = 1
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    draw()
  }, [draw, origin, wave])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = () => {
      progRef.current += 0.006
      if (progRef.current > 1.35) progRef.current = 0
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // Clicking or dragging on the globe moves the epicentre.
  const place = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * W
    const y = ((e.clientY - box.top) / box.height) * H
    const deg = (Math.atan2(y - CY, x - CX) / DEG + 90 + 360) % 360
    setOrigin(Math.round(deg > 180 ? deg - 360 : deg))
  }

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    progRef.current = 0
    setOrigin(0)
    originRef.current = 0
    setWave('s')
    waveRef.current = 's'
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · The shadow zones that mapped the core
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg cursor-crosshair"
          style={{ background: '#0F0D0A' }}
          onPointerDown={place}
          onPointerMove={e => {
            if (e.buttons === 1) place(e)
          }}
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
        <div className="flex items-center gap-1.5">
          {(
            [
              ['s', 'S waves'],
              ['p', 'P waves'],
            ] as const
          ).map(([k, t]) => (
            <button
              key={k}
              onClick={() => setWave(k)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                wave === k ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              style={wave === k ? { boxShadow: `inset 0 0 0 1px ${k === 's' ? CYAN : GOLD}` } : undefined}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Epicentre:</span>
          <input
            type="range"
            min={-180}
            max={180}
            step={5}
            value={origin}
            onChange={e => setOrigin(+e.target.value)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{origin}°</span>
        </div>
      </div>
      <div className="animation-controls flex-wrap gap-3 text-xs text-text-muted">
        <span>Drag on the globe to move the quake — the shadow moves with it, never with the Earth.</span>
      </div>
    </div>
  )
}
