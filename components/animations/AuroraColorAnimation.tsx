'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360

const CYAN = '#22D3EE' // field accent
const GOLD = '#F59E0B'
const MUTE = 'rgba(245,240,232,0.5)'
const FAINT = 'rgba(245,240,232,0.26)'

// Deterministic PRNG — fixed seed. No Math.random / Date.now.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hex = (c: string, a: number) =>
  `${c}${Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, '0')}`

// Altitude range shown, in km.
const ALT_MIN = 80
const ALT_MAX = 400

// Emission layers: each is a gas / transition that dominates a band.
type Band = {
  lo: number
  hi: number
  gas: string
  color: string
  colorName: string
  line: string
  transition: string
}
const BANDS: Band[] = [
  {
    lo: 300,
    hi: 400,
    gas: 'Oxygen (O)',
    color: '#F0435A',
    colorName: 'red',
    line: '630.0 nm',
    transition: 'slow O transition — only the thin high air lets it emit before a collision steals the energy',
  },
  {
    lo: 100,
    hi: 300,
    gas: 'Oxygen (O)',
    color: '#2FE38A',
    colorName: 'green',
    line: '557.7 nm',
    transition: "oxygen's fast green line — the most common auroral color",
  },
  {
    lo: 80,
    hi: 100,
    gas: 'Nitrogen (N₂⁺)',
    color: '#A78BFA',
    colorName: 'blue / purple',
    line: '427.8 nm',
    transition: 'ionized nitrogen, excited in the denser low air — edges the fast lower curtains',
  },
]

const bandAt = (alt: number): Band => {
  for (const b of BANDS) if (alt >= b.lo && alt <= b.hi) return b
  // clamp to nearest
  return alt > BANDS[0].hi ? BANDS[0] : BANDS[BANDS.length - 1]
}

// Map altitude (km) → canvas y. High altitude = top of canvas.
const PLOT_TOP = 30
const PLOT_BOT = H - 40
const altToY = (alt: number) =>
  PLOT_BOT - ((alt - ALT_MIN) / (ALT_MAX - ALT_MIN)) * (PLOT_BOT - PLOT_TOP)

const COL_X = 120 // left edge of the atmosphere column
const COL_W = 300 // width of the column

type Spark = { x: number; y: number; life: number; seed: number }

export function AuroraColorAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const lastRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  const [altitude, setAltitude] = useState(180) // km
  const [running, setRunning] = useState(false)

  const altRef = useRef(altitude)
  useEffect(() => {
    altRef.current = altitude
  }, [altitude])

  const sparksRef = useRef<Spark[]>([])
  const rand = useRef(mulberry32(0x9a17))

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const alt = altRef.current
    const f = frameRef.current
    const band = bandAt(alt)
    const yTarget = altToY(alt)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // ---- atmosphere column with banded emission colors ----
    for (const b of BANDS) {
      const y0 = altToY(Math.min(ALT_MAX, b.hi))
      const y1 = altToY(Math.max(ALT_MIN, b.lo))
      const active = b === band
      const grd = ctx.createLinearGradient(COL_X, y0, COL_X + COL_W, y0)
      grd.addColorStop(0, hex(b.color, active ? 0.1 : 0.04))
      grd.addColorStop(0.5, hex(b.color, active ? 0.22 : 0.07))
      grd.addColorStop(1, hex(b.color, active ? 0.1 : 0.04))
      ctx.fillStyle = grd
      ctx.fillRect(COL_X, y0, COL_W, y1 - y0)
      ctx.strokeStyle = hex(b.color, active ? 0.55 : 0.2)
      ctx.lineWidth = active ? 1.6 : 1
      ctx.strokeRect(COL_X, y0, COL_W, y1 - y0)
      // band label
      ctx.fillStyle = hex(b.color, active ? 0.95 : 0.45)
      ctx.font = active ? 'bold 10px monospace' : '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${b.gas} · ${b.colorName}`, COL_X + 8, (y0 + y1) / 2 - 2)
      ctx.fillStyle = hex(b.color, active ? 0.7 : 0.35)
      ctx.font = '9px monospace'
      ctx.fillText(`${b.line}  ·  ${b.lo}–${b.hi} km`, COL_X + 8, (y0 + y1) / 2 + 12)
    }

    // ---- altitude axis on the left ----
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(COL_X - 8, PLOT_TOP)
    ctx.lineTo(COL_X - 8, PLOT_BOT)
    ctx.stroke()
    ctx.fillStyle = MUTE
    ctx.font = '9px monospace'
    ctx.textAlign = 'right'
    for (const km of [100, 150, 200, 250, 300, 350, 400]) {
      const y = altToY(km)
      ctx.beginPath()
      ctx.moveTo(COL_X - 12, y)
      ctx.lineTo(COL_X - 8, y)
      ctx.strokeStyle = 'rgba(245,240,232,0.18)'
      ctx.stroke()
      ctx.fillStyle = MUTE
      ctx.fillText(`${km}`, COL_X - 16, y + 3)
    }
    ctx.save()
    ctx.translate(COL_X - 42, (PLOT_TOP + PLOT_BOT) / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = FAINT
    ctx.fillText('altitude (km)', 0, 0)
    ctx.restore()

    // ---- ground reference at the bottom ----
    ctx.fillStyle = 'rgba(96,165,250,0.15)'
    ctx.fillRect(COL_X, PLOT_BOT, COL_W, PLOT_BOT + 6 < H ? 6 : 4)
    ctx.fillStyle = FAINT
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillText('↓ toward the ground · denser air', COL_X + COL_W / 2, PLOT_BOT + 18)

    // ---- incoming particle beam from above, striking the selected altitude ----
    ctx.strokeStyle = hex(GOLD, 0.5)
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(COL_X + COL_W / 2, PLOT_TOP - 22)
    ctx.lineTo(COL_X + COL_W / 2, yTarget)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = hex(GOLD, 0.85)
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('solar-wind particle ↓', COL_X + COL_W / 2, PLOT_TOP - 26)

    // ---- excitation point + emitted-light burst at the chosen altitude ----
    const pulse = 0.6 + 0.4 * Math.sin(f * 0.15)
    const cx = COL_X + COL_W / 2
    const gr = ctx.createRadialGradient(cx, yTarget, 1, cx, yTarget, 30)
    gr.addColorStop(0, hex(band.color, 0.95 * pulse))
    gr.addColorStop(0.5, hex(band.color, 0.35 * pulse))
    gr.addColorStop(1, hex(band.color, 0))
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(cx, yTarget, 30, 0, Math.PI * 2)
    ctx.fill()
    // the excited atom
    ctx.beginPath()
    ctx.arc(cx, yTarget, 4, 0, Math.PI * 2)
    ctx.fillStyle = hex(band.color, 0.95)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.stroke()

    // emitted photons (deterministic sparks radiating out)
    for (const s of sparksRef.current) {
      const t = 1 - s.life
      const ang = s.seed * Math.PI * 2
      const rad = 6 + t * 26
      const px = cx + Math.cos(ang) * rad
      const py = yTarget + Math.sin(ang) * rad
      ctx.beginPath()
      ctx.arc(px, py, 1.4, 0, Math.PI * 2)
      ctx.fillStyle = hex(band.color, s.life * 0.9)
      ctx.fill()
    }

    // ---- emission-line readout box on the right ----
    const bx = COL_X + COL_W + 24
    const by = 40
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    ctx.strokeStyle = hex(band.color, 0.5)
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.roundRect(bx, by, 120, 110, 8)
    ctx.fill()
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.85)'
    ctx.font = 'bold 10px monospace'
    ctx.fillText('emission', bx + 12, by + 20)
    ctx.fillStyle = hex(band.color, 0.95)
    ctx.font = 'bold 13px monospace'
    ctx.fillText(band.colorName, bx + 12, by + 42)
    ctx.fillStyle = MUTE
    ctx.font = '10px monospace'
    ctx.fillText(band.gas, bx + 12, by + 62)
    ctx.fillText(band.line, bx + 12, by + 78)
    ctx.fillStyle = FAINT
    ctx.font = '9px monospace'
    ctx.fillText(`at ${Math.round(alt)} km`, bx + 12, by + 96)

    // color swatch
    ctx.fillStyle = hex(band.color, 0.9)
    ctx.beginPath()
    ctx.roundRect(bx, by + 122, 120, 22, 6)
    ctx.fill()

    ctx.textAlign = 'left'
  }, [])

  const update = useCallback(
    (steps: number) => {
      const sp = sparksRef.current
      for (const s of sp) s.life -= 0.02 * steps
      // remove dead
      sparksRef.current = sp.filter(s => s.life > 0)
      // emit new photons periodically (deterministic timing)
      if (frameRef.current % 6 < steps && sparksRef.current.length < 40) {
        for (let i = 0; i < 3; i++) {
          sparksRef.current.push({ x: 0, y: 0, life: 1, seed: rand.current() })
        }
      }
    },
    []
  )

  const seedStatic = useCallback(() => {
    sparksRef.current = []
    for (let i = 0; i < 12; i++) {
      sparksRef.current.push({ x: 0, y: 0, life: 0.3 + rand.current() * 0.6, seed: rand.current() })
    }
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        rand.current = mulberry32(0x9a17)
        frameRef.current = 10
        seedStatic()
        render()
      } else {
        setRunning(true)
      }
    },
  })

  // devicePixelRatio-aware backing store, sized once on mount.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render()
  }, [render])

  useEffect(() => {
    render()
  }, [render, altitude])

  useEffect(() => {
    if (!running) {
      lastRef.current = null
      cancelAnimationFrame(rafRef.current)
      return
    }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      const steps = dt / 16.7
      frameRef.current += steps
      update(steps)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, update, render])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    lastRef.current = null
    frameRef.current = 0
    sparksRef.current = []
    rand.current = mulberry32(0x9a17)
    setAltitude(180)
    altRef.current = 180
    render()
  }

  const band = bandAt(altitude)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Altitude and gas set the color
        </span>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          altitude: <span className="text-text-secondary">{Math.round(altitude)} km</span>
        </span>
        <span>
          gas: <span style={{ color: band.color }}>{band.gas}</span>
        </span>
        <span>
          color: <span style={{ color: band.color }}>{band.colorName}</span>
        </span>
        <span className="ml-auto text-text-muted">line {band.line} — {band.transition}</span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Altitude:</span>
          <input
            type="range"
            min={ALT_MIN}
            max={ALT_MAX}
            step={1}
            value={Math.round(altitude)}
            onChange={e => setAltitude(+e.target.value)}
            className="w-40"
            style={{ accentColor: CYAN }}
          />
          <span className="font-mono text-text-secondary">{Math.round(altitude)} km</span>
        </div>
        <span className="ml-auto text-xs text-text-muted">
          each color is a specific atomic transition
        </span>
      </div>
    </div>
  )
}
