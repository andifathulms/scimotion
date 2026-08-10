'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 380

const CLOUD_TOP = 24
const CLOUD_BOT = 250
const GROUND_Y = 356

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

// Deterministic PRNG (mulberry32, fixed seed) -- no Math.random anywhere.
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

const R0 = 10e-6 // reference cloud droplet radius, 10 microns (metres)
const R_RAIN = 1000e-6 // a "raindrop", 1 mm radius = ~1,000,000 cloud droplets
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

// Terminal fall speed (m/s) as a function of radius (metres): Stokes drag for the
// smallest droplets, turbulent-wake regime for large drops. Crossover near 163 um.
function terminalV(r: number): number {
  if (r <= 163e-6) return 1.2e8 * r * r
  return 250 * Math.sqrt(r)
}

// How many 10-micron cloud droplets of water are inside a drop of radius r (volume ratio).
const dropletCount = (r: number) => Math.pow(r / R0, 3)

// Radius (metres) at which a drop's fall speed exactly balances the updraft.
function thresholdRadius(updraft: number): number {
  if (updraft <= 0) return 0
  // invert both branches, pick the physical one
  const rStokes = Math.sqrt(updraft / 1.2e8)
  if (rStokes <= 163e-6) return rStokes
  return Math.pow(updraft / 250, 2)
}

type Sat = { x: number; y: number; r: number; alive: boolean; phase: number }

// map metric radius (10um..1000um, log scale) to pixels
const rToPx = (r: number) => 3 + 11 * (Math.log(r / R0) / Math.log(R_RAIN / R0))

const COLLECTOR_X = 300
const DEFAULT_UPDRAFT = 1.5
const GROWTH_STEP = 1.14 // radius multiplier per absorbed batch

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  updraft: { default: DEFAULT_UPDRAFT, min: 0, max: 8, step: 0.1 },
}

export function PrecipitationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const satsRef = useRef<Sat[]>([])
  const frameRef = useRef(0)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('precipitation', SPEC)
  const { updraft } = params
  const [r, setR] = useState(R0)
  const [falling, setFalling] = useState(false)
  const [running, setRunning] = useState(false)

  const updraftRef = useRef(DEFAULT_UPDRAFT)
  const rRef = useRef(R0)
  const yRef = useRef(CLOUD_TOP + 40)
  const fallingRef = useRef(false)
  useEffect(() => {
    updraftRef.current = updraft
  }, [updraft])

  const seed = useCallback(() => {
    const rnd = mulberry32(0x9e3779b9) // fixed seed (deterministic)
    const out: Sat[] = []
    for (let i = 0; i < 46; i++) {
      out.push({
        x: 40 + rnd() * (W - 80),
        y: CLOUD_TOP + 10 + rnd() * (CLOUD_BOT - CLOUD_TOP - 20),
        r: R0 * (0.7 + rnd() * 0.9),
        alive: true,
        phase: rnd() * Math.PI * 2,
      })
    }
    satsRef.current = out
    rRef.current = R0
    yRef.current = CLOUD_TOP + 40
    fallingRef.current = false
    frameRef.current = 0
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // cloud body
    ctx.fillStyle = 'rgba(226,240,248,0.05)'
    ctx.fillRect(0, CLOUD_TOP, W, CLOUD_BOT - CLOUD_TOP)
    ctx.strokeStyle = 'rgba(96,165,250,0.25)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, CLOUD_BOT)
    ctx.lineTo(W, CLOUD_BOT)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('inside the cloud', 10, CLOUD_TOP + 14)
    ctx.fillText('cloud base', 10, CLOUD_BOT - 6)

    // updraft arrows
    const uf = updraftRef.current / 8
    ctx.strokeStyle = `rgba(34,211,238,${(0.12 + 0.25 * uf).toFixed(3)})`
    ctx.lineWidth = 1
    for (let ax = 55; ax < W; ax += 90) {
      const base = frameRef.current * (1 + uf * 3)
      const ay = CLOUD_BOT - 20 - ((base % 90) + ((ax * 7) % 90))
      const y = clamp(ay, CLOUD_TOP + 20, CLOUD_BOT - 10)
      ctx.beginPath()
      ctx.moveTo(ax, y + 10)
      ctx.lineTo(ax, y - 10)
      ctx.moveTo(ax - 3, y - 5)
      ctx.lineTo(ax, y - 10)
      ctx.lineTo(ax + 3, y - 5)
      ctx.stroke()
    }
    ctx.lineWidth = 1

    // remaining small cloud droplets
    for (const s of satsRef.current) {
      if (!s.alive) continue
      const wob = Math.sin(frameRef.current * 0.05 + s.phase) * 1.5
      ctx.beginPath()
      ctx.arc(s.x + wob, s.y, rToPx(s.r), 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(226,240,248,0.5)'
      ctx.fill()
    }

    // the growing collector drop
    const rNow = rRef.current
    const y = yRef.current
    const px = rToPx(rNow)
    ctx.beginPath()
    ctx.arc(COLLECTOR_X, y, px, 0, Math.PI * 2)
    ctx.fillStyle = fallingRef.current ? BLUE : VIOLET
    ctx.fill()
    ctx.strokeStyle = fallingRef.current ? '#93C5FD' : '#C4B5FD'
    ctx.stroke()

    // ground
    ctx.fillStyle = 'rgba(16,185,129,0.18)'
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    ctx.lineTo(W, GROUND_Y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('ground', 10, GROUND_Y + 14)
  }, [])

  const step = useCallback(() => {
    frameRef.current += 1
    const rNow = rRef.current
    const updraftNow = updraftRef.current
    const vt = terminalV(rNow)

    if (!fallingRef.current) {
      // collision-coalescence: sweep out and absorb nearby small droplets, and grow
      const sats = satsRef.current
      const px = rToPx(rNow)
      let absorbed = 0
      for (const s of sats) {
        if (!s.alive) continue
        // drift droplets toward the collector (schematic sweep-out)
        const dx = COLLECTOR_X - s.x
        const dy = yRef.current - s.y
        const d = Math.hypot(dx, dy)
        s.x += (dx / (d + 0.01)) * 1.4
        s.y += (dy / (d + 0.01)) * 1.0
        if (d < px + rToPx(s.r) + 2) {
          s.alive = false
          absorbed += 1
        }
      }
      if (absorbed > 0) {
        rRef.current = Math.min(R_RAIN, rRef.current * Math.pow(GROWTH_STEP, absorbed))
      } else if (frameRef.current % 4 === 0) {
        // steady condensational/coalescent growth even between hits
        rRef.current = Math.min(R_RAIN, rRef.current * 1.03)
      }
      // the collector bobs on the updraft while still light
      const net = updraftNow - vt // positive => held aloft / lifted
      yRef.current = clamp(yRef.current - net * 0.4, CLOUD_TOP + 30, CLOUD_BOT - 10)

      // once fall speed beats the updraft, it can leave the cloud as rain
      if (vt > updraftNow && rRef.current > 60e-6) {
        fallingRef.current = true
        setFalling(true)
      }
    } else {
      // falling: net downward speed = terminal - updraft
      const net = Math.max(0.2, vt - updraftNow)
      yRef.current += net * 2.4
      if (yRef.current >= GROUND_Y) {
        yRef.current = GROUND_Y
        setRunning(false)
      }
    }

    setR(rRef.current)
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // static final frame: a fallen raindrop
        seed()
        for (const s of satsRef.current) s.alive = false
        rRef.current = R_RAIN
        yRef.current = GROUND_Y
        fallingRef.current = true
        setR(R_RAIN)
        setFalling(true)
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
  }, [updraft, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('updraft', DEFAULT_UPDRAFT)
    updraftRef.current = DEFAULT_UPDRAFT
    seed()
    setR(R0)
    setFalling(false)
    draw()
  }

  const play = () => {
    if (yRef.current >= GROUND_Y || rRef.current >= R_RAIN) {
      seed()
      setR(R0)
      setFalling(false)
    }
    setRunning(true)
  }

  const rMicron = r * 1e6
  const vt = terminalV(r)
  const count = dropletCount(r)
  const threshMicron = thresholdRadius(updraft) * 1e6

  const countLabel =
    count >= 1e6
      ? `${(count / 1e6).toFixed(2)}M`
      : count >= 1e3
        ? `${(count / 1e3).toFixed(1)}k`
        : count.toFixed(0)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Droplets grow until they fall
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
          aria-label="Animated diagram: Droplets grow until they fall. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          drop radius <span style={{ color: VIOLET }}>{rMicron.toFixed(0)} µm</span>
        </span>
        <span>
          = <span style={{ color: CYAN }}>{countLabel}</span> cloud droplets
        </span>
        <span>
          fall speed <span style={{ color: GOLD }}>{vt.toFixed(2)} m/s</span>
        </span>
        <span>
          updraft <span style={{ color: BLUE }}>{updraft.toFixed(1)} m/s</span>
        </span>
        <span>
          falls when r &gt; <span style={{ color: CYAN }}>{Math.round(threshMicron)} µm</span>
        </span>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={play}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base disabled:opacity-50"
        >
          <Play size={12} /> Play
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Updraft strength:</span>
          <input
            type="range"
            min={SPEC.updraft.min}
            max={SPEC.updraft.max}
            step={SPEC.updraft.step}
            value={updraft}
            onChange={e => set('updraft', +e.target.value)}
            className="w-32"
            style={{ accentColor: CYAN }}
          />
          <span className="text-text-secondary font-mono">{updraft.toFixed(1)} m/s</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-muted">
          {falling ? (
            <strong style={{ color: BLUE }}>falling as rain</strong>
          ) : (
            <span>held aloft, coalescing</span>
          )}
        </WidgetStatus>
      </div>
    </div>
  )
}
