'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 320
const CX = 300
const CY = 160

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const CYAN = '#22D3EE'

// Deterministic pseudo-random in [0,1). Math.random() is fine in these
// client-only widgets, but a seed keeps the particle field stable across
// re-renders so scrubbing looks coherent rather than reshuffling every frame.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

type Particle = { ang: number; rad: number; z: number; size: number; hue: number }

// A fixed field of gas/dust parcels, each with a starting angle, radius, and
// vertical offset. The stage parameter reshapes the whole field.
const N = 260
const rng = makeRng(0x5eed1234)
const PARTICLES: Particle[] = Array.from({ length: N }, () => {
  const ang = rng() * Math.PI * 2
  const rad = Math.sqrt(rng()) // uniform-ish over the area
  const z = (rng() - 0.5) * 2 // -1..1, vertical position in the sphere
  const size = 0.7 + rng() * 1.3
  const hue = rng()
  return { ang, rad, z, size, hue }
})

// Planets that condense out of the disk in the final stage.
const PLANETS = [
  { orbit: 0.30, size: 3.0, color: PINK, phase: 0.0 },
  { orbit: 0.44, size: 3.4, color: BLUE, phase: 1.1 },
  { orbit: 0.60, size: 5.2, color: GOLD, phase: 2.3 },
  { orbit: 0.78, size: 4.3, color: CYAN, phase: 3.6 },
]

const STAGE_LABELS = [
  'Diffuse cloud, barely turning',
  'Collapse begins — spinning up',
  'Flattening into a disk',
  'Star ignites at the center',
  'Planets accrete in the plane',
]

// stage p in [0,1] maps continuously across the five labelled phases.
function labelFor(p: number): string {
  const idx = Math.min(STAGE_LABELS.length - 1, Math.floor(p * (STAGE_LABELS.length - 1) + 0.001))
  return STAGE_LABELS[idx]
}

export function SolarSystemFormationAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pRef = useRef(0)          // stage progress 0..1
  const spinRef = useRef(0)       // accumulated rotation phase
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(0)

  const draw = useCallback((p: number, spin: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // --- shape parameters driven by stage p ---
    // Overall size shrinks as it collapses (240px cloud -> ~150px disk).
    const outer = 240 - 90 * p
    // Flattening: z (vertical) is squashed toward the plane as p rises.
    const flat = 1 - 0.94 * Math.min(1, p * 1.2)
    // Spin rate factor grows as radius shrinks (angular momentum): faster later.
    const collapse = Math.min(1, p)

    // Disk plane guide once flattening is underway
    if (p > 0.35) {
      const a = Math.min(0.5, (p - 0.35) * 1.5)
      ctx.strokeStyle = `rgba(129,140,248,${(0.18 * a).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.ellipse(CX, CY, outer * 0.92, outer * 0.92 * (0.06 + flat * 0.5), 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // --- particles ---
    // Each parcel spins around the axis; inner parcels spin faster (angular
    // momentum: v grows as r shrinks). We render back-to-front by vertical y.
    type Draw = { x: number; y: number; r: number; color: string; alpha: number }
    const items: Draw[] = []
    for (const pt of PARTICLES) {
      // Radius in pixels, pulled inward as it collapses.
      const r = pt.rad * outer
      // Faster rotation for smaller radius and later stage.
      const speed = (0.4 + 1.6 * (1 - pt.rad)) * (0.3 + 2.2 * collapse)
      const ang = pt.ang + spin * speed
      const px = Math.cos(ang) * r
      // vertical offset from the plane, squashed by flattening
      const zpix = pt.z * outer * 0.55 * flat
      // simple oblique projection: plane tilted so we see it edge-on-ish
      const sx = CX + px
      const sy = CY + Math.sin(ang) * r * 0.32 + zpix
      const col =
        pt.hue < 0.25 ? INDIGO : pt.hue < 0.5 ? VIOLET : pt.hue < 0.72 ? BLUE : pt.hue < 0.88 ? CYAN : PINK
      // parcels near center glow warmer as the star forms
      const central = r < outer * 0.18 && p > 0.55
      items.push({
        x: sx, y: sy, r: pt.size * (0.9 + 0.5 * (1 - pt.rad)),
        color: central ? GOLD : col,
        alpha: central ? 0.9 : 0.28 + 0.5 * (1 - pt.rad),
      })
    }
    items.sort((a, b) => a.y - b.y)
    for (const it of items) {
      ctx.globalAlpha = it.alpha
      ctx.fillStyle = it.color
      ctx.beginPath(); ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // --- the star igniting at the center ---
    if (p > 0.55) {
      const grow = Math.min(1, (p - 0.55) / 0.25)
      const rad = 4 + 9 * grow
      const g = ctx.createRadialGradient(CX, CY, 1, CX, CY, rad + 18)
      g.addColorStop(0, `rgba(245,158,11,${(0.85 * grow).toFixed(3)})`)
      g.addColorStop(1, 'rgba(245,158,11,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(CX, CY, rad + 18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = GOLD
      ctx.beginPath(); ctx.arc(CX, CY, rad, 0, Math.PI * 2); ctx.fill()
    }

    // --- planets condensing in the final stage ---
    if (p > 0.78) {
      const em = Math.min(1, (p - 0.78) / 0.22)
      for (const pl of PLANETS) {
        const rr = pl.orbit * outer
        const ang = pl.phase + spin * (0.6 + 0.9 * (1 - pl.orbit))
        // draw the orbit in the plane
        ctx.strokeStyle = `rgba(245,240,232,${(0.12 * em).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(CX, CY, rr, rr * 0.32, 0, 0, Math.PI * 2)
        ctx.stroke()
        const sx = CX + Math.cos(ang) * rr
        const sy = CY + Math.sin(ang) * rr * 0.32
        ctx.globalAlpha = em
        ctx.fillStyle = pl.color
        ctx.beginPath(); ctx.arc(sx, sy, pl.size, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    // Rotation-direction arrow: everything goes the same way
    if (p > 0.15) {
      const a = Math.min(0.6, (p - 0.15) * 1.2)
      ctx.strokeStyle = `rgba(129,140,248,${a.toFixed(3)})`
      ctx.fillStyle = `rgba(129,140,248,${a.toFixed(3)})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(CX, CY, outer * 0.98, -0.5, 0.5)
      ctx.stroke()
      const ex = CX + Math.cos(0.5) * outer * 0.98
      const ey = CY + Math.sin(0.5) * outer * 0.98
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - 7, ey - 1)
      ctx.lineTo(ex - 3, ey + 7)
      ctx.closePath(); ctx.fill()
    }

    // Label
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.font = '11px monospace'
    ctx.fillText(labelFor(p), 14, H - 14)
  }, [])

  useEffect(() => { draw(pRef.current, spinRef.current) }, [draw])

  // When the slider sets a stage, sync progress and redraw.
  useEffect(() => {
    if (running) return
    pRef.current = stage / 100
    draw(pRef.current, spinRef.current)
  }, [stage, running, draw])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const DURATION_MS = 11000
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      // advance the collapse; rotation always turns (faster as it collapses)
      pRef.current = Math.min(1, pRef.current + dt / DURATION_MS)
      spinRef.current += (dt / 1000) * (0.6 + 2.4 * pRef.current)
      setStage(Math.round(pRef.current * 100))
      draw(pRef.current, spinRef.current)
      if (pRef.current >= 1) { setRunning(false); return }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const toggle = () => {
    if (pRef.current >= 1) { pRef.current = 0; spinRef.current = 0; setStage(0); setRunning(true); return }
    setRunning(r => !r)
  }
  const resetAll = () => {
    triggerReset(); setRunning(false)
    pRef.current = 0; spinRef.current = 0; lastRef.current = null
    setStage(0); draw(0, 0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Cloud → disk → planets</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-bg-base text-xs font-medium transition-colors"
          style={{ background: INDIGO }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {pRef.current >= 1 ? 'Replay' : 'Play'}</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Stage:</span>
          <input
            type="range" min={0} max={100} step={1} value={stage}
            onChange={ev => { setRunning(false); setStage(+ev.target.value) }}
            className="w-40"
            style={{ accentColor: INDIGO }}
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Radius <strong style={{ color: INDIGO }}>↓</strong> · spin <strong style={{ color: GOLD }}>↑</strong> · flattening into a plane
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Conservation of angular momentum spins the shrinking cloud up and flattens it into a disk — so every planet ends up orbiting the same way, in the same plane.
      </p>
    </div>
  )
}
