'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'

// Top-down view. The storm is centred here; controls area sits below.
const CX = 250
const CY = 175
const R_EYE = 22
const R_WALL = 46
const R_MAX = 150

const OMEGA_EARTH = 7.292e-5 // rad/s

const LAT_MIN = 0
const LAT_MAX = 40
const DEFAULT_LAT = 18

const N = 260
const TRAIL = 10

type Pt = { x: number; y: number }
type Parcel = { r: number; a: number; age: number; trail: Pt[] }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// How well the storm can organise: below ~3° there is essentially no Coriolis to
// start the spin, and it climbs to a coherent vortex by ~12°.
const orgOf = (lat: number) => clamp((lat - 3) / 9, 0, 1)

const fOf = (lat: number) => 2 * OMEGA_EARTH * Math.sin((lat * Math.PI) / 180)

function formatF(f: number): string {
  if (f <= 0) return '0'
  const e = Math.floor(Math.log10(f))
  return `${(f / Math.pow(10, e)).toFixed(2)}e${e}`
}

export function HurricaneStructureAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const parcelsRef = useRef<Parcel[]>([])
  const latRef = useRef(DEFAULT_LAT)

  const [lat, setLat] = useState(DEFAULT_LAT)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    latRef.current = lat
  }, [lat])

  const spawn = useCallback((): Parcel => {
    return {
      r: R_WALL + Math.random() * (R_MAX - R_WALL + 30),
      a: Math.random() * Math.PI * 2,
      age: Math.floor(Math.random() * 200),
      trail: [],
    }
  }, [])

  const seed = useCallback(() => {
    parcelsRef.current = Array.from({ length: N }, spawn)
  }, [spawn])

  const step = useCallback(() => {
    const org = orgOf(latRef.current)
    // Cyclonic rotation and inward drift both scale with organisation.
    const omega = 0.004 + 0.05 * org
    const inflow = 0.1 + 1.2 * org
    const jitter = (1 - org) * 1.0

    for (const p of parcelsRef.current) {
      // Canvas y points down, so subtracting the angle turns the flow
      // counterclockwise on screen — cyclonic, as in the northern hemisphere.
      p.a -= omega * (p.r > R_WALL ? 1 : 0.4)
      if (p.r > R_WALL) p.r -= inflow
      else p.r += (R_WALL - p.r) * 0.08
      // Without enough Coriolis the inflow never coheres: noise dominates.
      p.a += (Math.random() - 0.5) * jitter * 0.12
      p.r += (Math.random() - 0.5) * jitter * 3.2
      p.age += 1

      if (p.r < R_EYE - 4 || p.r > R_MAX + 34 || p.age > 620) {
        const s = spawn()
        p.r = s.r
        p.a = s.a
        p.age = 0
        p.trail = []
        continue
      }
      const x = CX + p.r * Math.cos(p.a)
      const y = CY + p.r * Math.sin(p.a)
      p.trail.push({ x, y })
      if (p.trail.length > TRAIL) p.trail.shift()
    }
  }, [spawn])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const curLat = latRef.current
    const org = orgOf(curLat)
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'

    // faint sea background
    ctx.fillStyle = 'rgba(34,211,238,0.04)'
    ctx.fillRect(0, 0, W, H)

    // eyewall ring + eye, sharpening with organisation
    if (org > 0.12) {
      ctx.beginPath()
      ctx.arc(CX, CY, R_WALL, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(245,158,11,${(0.3 + 0.6 * org).toFixed(3)})`
      ctx.lineWidth = 2 + 4 * org
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(CX, CY, R_EYE, 0, Math.PI * 2)
      ctx.fillStyle = '#0F0D0A'
      ctx.fill()
      ctx.strokeStyle = `rgba(245,240,232,${(0.2 + 0.3 * org).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = `rgba(245,240,232,${(0.35 + 0.35 * org).toFixed(3)})`
      ctx.fillText('eye', CX - 8, CY + 3)
    }

    // parcel trails — the rainbands
    for (const p of parcelsRef.current) {
      if (p.trail.length < 2) continue
      const col = p.r < R_WALL + 14 ? GOLD : p.r < R_MAX * 0.6 ? CYAN : BLUE
      for (let i = 1; i < p.trail.length; i++) {
        const alpha = (i / p.trail.length) * (0.35 + 0.5 * org)
        ctx.beginPath()
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
        ctx.lineTo(p.trail[i].x, p.trail[i].y)
        ctx.strokeStyle =
          col +
          Math.floor(clamp(alpha, 0, 1) * 255)
            .toString(16)
            .padStart(2, '0')
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }

    // cyclonic rotation arrows around the eyewall when organised
    if (org > 0.3) {
      ctx.strokeStyle = `rgba(167,139,250,${(0.4 * org).toFixed(3)})`
      ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = 1.4
      for (let k = 0; k < 4; k++) {
        const a0 = (k / 4) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(CX, CY, R_WALL + 18, a0, a0 + 1.0, true)
        ctx.stroke()
        const tip = a0 - 1.0
        const tx = CX + (R_WALL + 18) * Math.cos(tip)
        const ty = CY + (R_WALL + 18) * Math.sin(tip)
        ctx.beginPath()
        ctx.arc(tx, ty, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // ---- latitude band gauge on the right ----
    const gx = 470
    const gTop = 40
    const gBot = 300
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(gx, gTop)
    ctx.lineTo(gx, gBot)
    ctx.stroke()
    // the "no-formation" band within ~5 deg of the equator
    const latY = (l: number) => gBot - (l / LAT_MAX) * (gBot - gTop)
    ctx.fillStyle = 'rgba(96,165,250,0.14)'
    ctx.fillRect(gx - 6, latY(5), 12, gBot - latY(5))
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(96,165,250,0.7)'
    ctx.fillText('no spin-up', gx + 10, latY(2.5))
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    for (const l of [0, 10, 20, 30, 40]) {
      const y = latY(l)
      ctx.beginPath()
      ctx.moveTo(gx - 4, y)
      ctx.lineTo(gx + 4, y)
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.stroke()
      ctx.fillText(`${l}°`, gx + 8, y + 3)
    }
    const my = latY(curLat)
    ctx.beginPath()
    ctx.arc(gx, my, 4, 0, Math.PI * 2)
    ctx.fillStyle = curLat < 5 ? BLUE : GOLD
    ctx.fill()

    // ---- readout panel ----
    ctx.fillStyle = 'rgba(15,13,10,0.82)'
    ctx.fillRect(10, 12, 190, 70)
    ctx.strokeStyle = 'rgba(255,245,235,0.1)'
    ctx.lineWidth = 1
    ctx.strokeRect(10, 12, 190, 70)
    ctx.font = '10px monospace'
    ctx.fillStyle = CYAN
    ctx.fillText(`latitude   ${curLat.toFixed(0)}°`, 18, 28)
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`f = 2Ωsinφ  ${formatF(fOf(curLat))} s⁻¹`, 18, 42)
    ctx.fillText('organisation', 18, 56)
    ctx.fillStyle = 'rgba(255,245,235,0.08)'
    ctx.fillRect(96, 48, 96, 9)
    ctx.fillStyle = org < 0.15 ? BLUE : GOLD
    ctx.fillRect(96, 48, 96 * org, 9)
    ctx.fillStyle = org < 0.15 ? BLUE : GOLD
    ctx.font = 'bold 10px monospace'
    ctx.fillText(
      org < 0.15 ? 'too little Coriolis — no eye' : 'organised vortex',
      18,
      72
    )

    // reminder: the energy is thermal, not rotational
    ctx.font = '8px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('energy source: warm ocean — Coriolis only shapes the spin', 10, H - 8)
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
        settle(240)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    settle(90)
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
  }, [lat, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setLat(DEFAULT_LAT)
    latRef.current = DEFAULT_LAT
    seed()
    settle(90)
    draw()
  }

  const org = orgOf(lat)
  const label =
    lat < 5
      ? 'within ~5° of the equator — the storm cannot organise'
      : org < 0.6
        ? 'weak Coriolis — a loose, broad circulation'
        : 'strong enough to build a tight eye and eyewall'

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Structure and the Coriolis band
        </span>
        <button
          onClick={reset}
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
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Latitude:</span>
          <input
            type="range"
            min={LAT_MIN}
            max={LAT_MAX}
            step={1}
            value={lat}
            onChange={e => setLat(+e.target.value)}
            className="w-44"
            style={{ accentColor: CYAN }}
          />
          <span className="font-mono text-text-secondary">{lat.toFixed(0)}°</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">{label}</span>
      </div>
    </div>
  )
}
