'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const BG = '#0F0D0A'
const GREEN = '#10B981'
const GOLD = '#F59E0B'
const RED = '#F87171'
const VIOLET = '#A78BFA'

// A symmetric top pivoted at its lower tip. Gravity acts at the centre of mass
// a distance d up the spin axis, producing a torque τ = m·g·d·sin(θ) that is
// HORIZONTAL and perpendicular to the axis. Because τ = dL/dt is perpendicular
// to the spin angular momentum L, the axis does not fall — it precesses.
// Precession rate: Ω = τ / (L·sinθ) = m·g·d / (I·ω_spin)  (independent of tilt).
const M = 0.2 // kg
const G = 9.8 // m/s²
const D = 0.1 // m, pivot → centre of mass along the axis
const I_SPIN = 0.0008 // kg·m², spin moment of inertia of the disc
const TILT = (32 * Math.PI) / 180 // fixed tilt of the axis from vertical
const OMEGA_MIN = 60 // rad/s
const OMEGA_MAX = 360 // rad/s

// torque magnitude (constant for fixed tilt) and precession rate
const TORQUE = M * G * D * Math.sin(TILT)
const precessionRate = (spin: number) => (M * G * D) / (I_SPIN * spin)

// Isometric projection: z is vertical (up on screen), x/y span the ground plane.
const CX = 200
const CY = 250
const SCALE = 150 // pixels per unit axis length
const project = (x: number, y: number, z: number): [number, number] => [
  CX + (x - y) * 0.7071 * SCALE,
  CY - z * SCALE + (x + y) * 0.7071 * 0.42 * SCALE,
]

function arrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, width: number
) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 10 * Math.cos(a - 0.4), y2 - 10 * Math.sin(a - 0.4))
  ctx.lineTo(x2 - 10 * Math.cos(a + 0.4), y2 - 10 * Math.sin(a + 0.4))
  ctx.closePath(); ctx.fill()
}

export function GyroscopePrecessionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const spinRef = useRef(120) // spin rate ω_spin (rad/s)
  const phiRef = useRef(0.6) // precession azimuth
  const spokeRef = useRef(0) // cosmetic disc-spin phase
  const playingRef = useRef(false)

  const [spin, setSpin] = useState(120)
  const [playing, setPlaying] = useState(false)

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

    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    const phi = phiRef.current
    const st = Math.sin(TILT)
    const ct = Math.cos(TILT)
    // unit vector along the spin axis
    const n = { x: st * Math.cos(phi), y: st * Math.sin(phi), z: ct }
    // tangential (+φ) horizontal direction — the way L and τ point
    const tHat = { x: -Math.sin(phi), y: Math.cos(phi), z: 0 }

    // ---- ground plane + the circle the axis tip sweeps out ----
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const [sx, sy] = project(st * Math.cos(a), st * Math.sin(a), ct)
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
    }
    ctx.stroke()

    const [px, py] = project(0, 0, 0) // pivot
    const [tx, ty] = project(n.x, n.y, n.z) // axis tip / disc centre
    const [comx, comy] = project(n.x * D * 6, n.y * D * 6, n.z * D * 6) // COM marker (scaled for visibility)

    // vertical reference line from the pivot
    const [vzx, vzy] = project(0, 0, 1)
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(vzx, vzy); ctx.stroke()
    ctx.setLineDash([])

    // ---- gravity torque τ (horizontal, tangential) drawn at the COM ----
    // Its tip is a short step along the +φ tangential direction from the COM.
    const [teX, teY] = project(
      n.x * D * 6 + tHat.x * 0.45,
      n.y * D * 6 + tHat.y * 0.45,
      n.z * D * 6
    )
    arrow(ctx, comx, comy, teX, teY, RED, 2.5)

    // ---- the spin axis / shaft ----
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke()

    // pivot point
    ctx.fillStyle = 'rgba(245,240,232,0.8)'
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill()

    // ---- spinning disc, drawn as an ellipse perpendicular to the axis ----
    // Build two axes spanning the disc plane (perpendicular to n).
    const e1 = { x: -Math.sin(phi), y: Math.cos(phi), z: 0 }
    const e2 = {
      x: n.y * e1.z - n.z * e1.y,
      y: n.z * e1.x - n.x * e1.z,
      z: n.x * e1.y - n.y * e1.x,
    }
    const discR = 0.34
    ctx.beginPath()
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const dx = n.x + discR * (Math.cos(a) * e1.x + Math.sin(a) * e2.x)
      const dy = n.y + discR * (Math.cos(a) * e1.y + Math.sin(a) * e2.y)
      const dz = n.z + discR * (Math.cos(a) * e1.z + Math.sin(a) * e2.z)
      const [sx, sy] = project(dx, dy, dz)
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(96,165,250,0.18)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.7)'
    ctx.lineWidth = 2
    ctx.stroke()

    // a spoke that whirls to convey the spin rate
    const sp = spokeRef.current
    for (let k = 0; k < 2; k++) {
      const a = sp + k * Math.PI
      const dx = n.x + discR * (Math.cos(a) * e1.x + Math.sin(a) * e2.x)
      const dy = n.y + discR * (Math.cos(a) * e1.y + Math.sin(a) * e2.y)
      const dz = n.z + discR * (Math.cos(a) * e1.z + Math.sin(a) * e2.z)
      const [sx, sy] = project(dx, dy, dz)
      ctx.strokeStyle = 'rgba(245,240,232,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke()
    }

    // ---- L vector along the axis (length grows with spin) ----
    const spinNow = spinRef.current
    const lLen = 0.55 + 0.55 * ((spinNow - OMEGA_MIN) / (OMEGA_MAX - OMEGA_MIN))
    const [lx, ly] = project(n.x * lLen, n.y * lLen, n.z * lLen)
    arrow(ctx, px, py, lx, ly, GREEN, 3)

    // gravity arrow at the COM (straight down)
    const [gx, gy] = project(n.x * D * 6, n.y * D * 6, n.z * D * 6 - 0.4)
    arrow(ctx, comx, comy, gx, gy, VIOLET, 2)

    // COM dot
    ctx.fillStyle = GOLD
    ctx.beginPath(); ctx.arc(comx, comy, 4, 0, Math.PI * 2); ctx.fill()

    // ---- labels ----
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = GREEN; ctx.fillText('L (spin)', lx + 6, ly)
    ctx.fillStyle = RED; ctx.fillText('τ = r×mg', teX + 6, teY + 4)
    ctx.fillStyle = VIOLET; ctx.fillText('mg', gx + 6, gy)

    // precession direction ring arrow
    const Om = precessionRate(spinNow)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('axis sweeps a horizontal circle → precession', CX, H - 14)

    // on-canvas readout of the key relation
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText(`Ω = τ / L = ${Om.toFixed(2)} rad/s`, 400, 40)
    ctx.fillText(`period ≈ ${(2 * Math.PI / Om).toFixed(1)} s`, 400, 58)
  }, [])

  useEffect(() => {
    const loop = () => {
      const spinNow = spinRef.current
      const Om = precessionRate(spinNow)
      if (playingRef.current) {
        phiRef.current += Om * 0.016
        spokeRef.current += spinNow * 0.016 * 0.06 // scaled down so the spoke stays visible
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  const { ref, triggered } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // static frame: a tilted, spinning top caught mid-precession
        draw()
        return
      }
      playingRef.current = true
      setPlaying(true)
    },
  })

  const togglePlay = () => {
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  const resetAll = () => {
    playingRef.current = false
    setPlaying(false)
    phiRef.current = 0.6
    spokeRef.current = 0
    spinRef.current = 120
    setSpin(120)
  }

  const Om = precessionRate(spin)

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Spin it up and watch precession slow
        </span>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ background: BG, aspectRatio: `${W} / ${H}` }}
        />
      </div>
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>ω_spin = <strong style={{ color: GREEN }}>{spin.toFixed(0)} rad/s</strong></span>
        <span>τ = m·g·d·sinθ = <strong style={{ color: RED }}>{TORQUE.toFixed(3)} N·m</strong></span>
        <span>Ω = τ / L = <strong className="text-accent-gold">{Om.toFixed(2)} rad/s</strong></span>
        <span>faster spin → slower precession</span>
        {!triggered && <span className="text-text-muted">scroll to start</span>}
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={13} /> {playing ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>spin</span>
          <input
            type="range" min={OMEGA_MIN} max={OMEGA_MAX} step={5} value={spin}
            onChange={e => {
              spinRef.current = +e.target.value
              setSpin(spinRef.current)
            }}
            className="w-44"
            style={{ accentColor: GREEN }}
          />
        </label>
      </div>
    </div>
  )
}
