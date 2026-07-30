'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 420
const BG = '#0F0D0A'
const CX = 300
const CY = 220 // planet centre (pushed low so trajectories arc above it)

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const GREEN = '#10B981'
const PINK = '#F472B6'
const FAINT = 'rgba(255,245,235,0.12)'
const DIM = 'rgba(245,240,232,0.45)'

// --- Physics (dimensionless, tuned so the screen reads nicely) ---
// The planet has GM chosen so that a circular orbit at the launch radius R0
// has a clean circular speed. Newton's cannonball is fired horizontally from
// the top of a mountain at radius R0 above the planet centre.
const R_PLANET = 46 // drawn planet radius (px) = the surface
const R0 = 120 // launch radius from centre (px): top of the "mountain"
const GM = 26000 // gravitational parameter (px^3 / s^2, schematic)

// Circular speed at the launch radius: v = sqrt(GM/r).
const V_CIRC = Math.sqrt(GM / R0)
// Escape speed at the launch radius: v_esc = sqrt(2 GM/r) = sqrt(2) * v_circ.
const V_ESC = Math.sqrt((2 * GM) / R0)

// Slider runs from well below circular to just past escape.
const V_MIN = 0.55 * V_CIRC
const V_MAX = 1.12 * V_ESC

type Path = 'suborbital' | 'circular' | 'elliptical' | 'escape'

function classify(v: number): Path {
  if (v < V_CIRC - 0.6) return 'suborbital'
  if (Math.abs(v - V_CIRC) <= 0.6) return 'circular'
  if (v < V_ESC - 0.4) return 'elliptical'
  return 'escape'
}

const PATH_LABEL: Record<Path, string> = {
  suborbital: 'SUBORBITAL — falls back, hits the surface',
  circular: 'CIRCULAR ORBIT — perpetual free fall',
  elliptical: 'ELLIPTICAL ORBIT — still bound, still falling',
  escape: 'ESCAPE — hyperbolic, never returns',
}

const PATH_COLOR: Record<Path, string> = {
  suborbital: PINK,
  circular: GREEN,
  elliptical: INDIGO,
  escape: GOLD,
}

// Integrate the projectile from the launch point with a simple symplectic
// (semi-implicit Euler) step under inverse-square gravity. Returns the polyline
// and whether it struck the surface. Deterministic — no RNG, no clock.
function integrate(v0: number): { pts: [number, number][]; hit: boolean; escaped: boolean } {
  const pts: [number, number][] = []
  // Launch from top of the mountain, moving horizontally (to the right).
  let x = CX
  let y = CY - R0
  let vx = v0
  let vy = 0
  const dt = 0.06
  let hit = false
  let escaped = false

  for (let i = 0; i < 4200; i++) {
    const dx = x - CX
    const dy = y - CY
    const r = Math.hypot(dx, dy)
    if (r <= R_PLANET) {
      hit = true
      pts.push([x, y])
      break
    }
    // acceleration toward the centre, magnitude GM/r^2
    const a = GM / (r * r)
    vx -= (dx / r) * a * dt
    vy -= (dy / r) * a * dt
    x += vx * dt
    y += vy * dt
    pts.push([x, y])
    // Unbound trajectories run off; stop once far away.
    if (r > 640) {
      escaped = true
      break
    }
  }
  return { pts, hit, escaped }
}

export function OrbitVelocityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const progRef = useRef(0) // how many points of the path are drawn so far
  const playingRef = useRef(false)
  const speedRef = useRef(V_CIRC)

  const [speed, setSpeed] = useState(V_CIRC)
  const [playing, setPlaying] = useState(false)

  const draw = useCallback((v: number, progress: number) => {
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
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    const path = classify(v)
    const color = PATH_COLOR[path]
    const { pts, hit } = integrate(v)

    // Planet body.
    const grad = ctx.createRadialGradient(CX - 14, CY - 16, 8, CX, CY, R_PLANET)
    grad.addColorStop(0, '#3b4a6b')
    grad.addColorStop(1, '#141b2b')
    ctx.fillStyle = grad
    ctx.beginPath(); ctx.arc(CX, CY, R_PLANET, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.5)'
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(CX, CY, R_PLANET, 0, Math.PI * 2); ctx.stroke()

    // Reference circular orbit ring (dashed).
    ctx.strokeStyle = 'rgba(16,185,129,0.28)'
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(CX, CY, R0, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])

    // The mountain / cannon launch point.
    ctx.fillStyle = DIM
    ctx.font = '10px monospace'
    ctx.fillText('cannon', CX + 6, CY - R0 - 8)

    // Full faint trajectory (ghost) so the whole path is visible.
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
    ctx.stroke()

    // Animated portion of the trajectory, bright.
    const nDraw = Math.min(progress, pts.length)
    ctx.strokeStyle = color
    ctx.lineWidth = 2.4
    ctx.beginPath()
    for (let i = 0; i < nDraw; i++) {
      const [px, py] = pts[i]
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Projectile head + free-fall acceleration arrow (always toward centre).
    if (nDraw > 0) {
      const [hx, hy] = pts[nDraw - 1]
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill()

      // Gravity vector: always points at the planet centre — the object is
      // in continuous free fall no matter which path it is on.
      const gdx = CX - hx
      const gdy = CY - hy
      const gr = Math.hypot(gdx, gdy) || 1
      const ax = (gdx / gr) * 30
      const ay = (gdy / gr) * 30
      ctx.strokeStyle = 'rgba(244,114,182,0.9)'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + ax, hy + ay); ctx.stroke()
      // arrowhead
      const ang = Math.atan2(ay, ax)
      ctx.beginPath()
      ctx.moveTo(hx + ax, hy + ay)
      ctx.lineTo(hx + ax - 6 * Math.cos(ang - 0.4), hy + ay - 6 * Math.sin(ang - 0.4))
      ctx.lineTo(hx + ax - 6 * Math.cos(ang + 0.4), hy + ay - 6 * Math.sin(ang + 0.4))
      ctx.closePath()
      ctx.fillStyle = 'rgba(244,114,182,0.9)'
      ctx.fill()
      ctx.fillStyle = 'rgba(244,114,182,0.9)'
      ctx.fillText('g (free fall)', hx + ax + 4, hy + ay + 4)

      // Impact marker.
      if (hit && nDraw >= pts.length) {
        ctx.fillStyle = PINK
        ctx.font = 'bold 11px monospace'
        ctx.fillText('impact', hx + 6, hy)
      }
    }

    // Outcome badge.
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = color
    ctx.fillText(PATH_LABEL[path], 16, 24)

    // Speed reference scale bar.
    ctx.font = '10px monospace'
    ctx.fillStyle = FAINT
    ctx.fillText('dashed ring = circular-orbit radius', 16, H - 12)
  }, [])

  // Redraw whenever the speed changes while paused.
  useEffect(() => {
    if (!playingRef.current) {
      const { pts } = integrate(speed)
      progRef.current = pts.length
      draw(speed, pts.length)
    }
  }, [speed, draw])

  const loop = useCallback(() => {
    const { pts } = integrate(speedRef.current)
    progRef.current += 14
    draw(speedRef.current, progRef.current)
    if (progRef.current >= pts.length) {
      playingRef.current = false
      setPlaying(false)
      progRef.current = pts.length
      return
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [draw])

  const play = useCallback(() => {
    playingRef.current = true
    setPlaying(true)
    progRef.current = 0
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }, [loop])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      speedRef.current = V_CIRC
      setSpeed(V_CIRC)
      if (reduced) {
        const { pts } = integrate(V_CIRC)
        progRef.current = pts.length
        draw(V_CIRC, pts.length)
        return
      }
      play()
    },
  })

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const toggle = () => {
    if (playingRef.current) {
      playingRef.current = false
      setPlaying(false)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    } else {
      play()
    }
  }

  const onSpeed = (val: number) => {
    playingRef.current = false
    setPlaying(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    speedRef.current = val
    setSpeed(val)
  }

  const reset = () => {
    playingRef.current = false
    setPlaying(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    triggerReset()
    speedRef.current = V_CIRC
    setSpeed(V_CIRC)
  }

  const path = classify(speed)
  const vRatio = speed / V_CIRC // in units of local circular speed

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Newton&apos;s cannonball: how fast to fall forever</span>
        <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: BG }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>launch speed: <span style={{ color: INDIGO }}>{vRatio.toFixed(2)}× v_circ</span></span>
        <span>circular v=√(GM/r): <span className="text-accent-blue">1.00×</span></span>
        <span>escape v=√(2GM/r): <span className="text-accent-gold">{(V_ESC / V_CIRC).toFixed(2)}×</span></span>
        <span>path: <span style={{ color: PATH_COLOR[path] }}>{path}</span></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          {playing ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Launch</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>speed:</span>
          <input
            type="range"
            min={V_MIN}
            max={V_MAX}
            step={0.1}
            value={speed}
            onChange={e => onSpeed(+e.target.value)}
            className="w-40"
            style={{ accentColor: INDIGO }}
          />
        </div>
        <span className="text-xs text-text-muted font-mono ml-auto self-center">
          {path === 'suborbital' ? 'too slow — gravity wins, it crashes'
            : path === 'circular' ? 'just right — falling, but missing forever'
            : path === 'elliptical' ? 'bound but eccentric — rises then falls back'
            : 'past escape — hyperbolic, gone for good'}
        </span>
      </div>
    </div>
  )
}
