'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 340
const CX = 250
const CY = 170

const ACCENT = '#818CF8' // indigo — this article's field colour
const BLUE = '#60A5FA'
const GOLD = '#F59E0B'
const MUTED = 'rgba(255,245,235,0.45)'

// The planet's drawn radius, and the physical radius it stands for (in "Earth
// radii"). Everything below works in these physical units, then scales to pixels.
const RP_PX = 52
const RP_UNITS = 6
const PX_PER_UNIT = RP_PX / RP_UNITS

// Tuned so the near-uniform pull vectors and the tiny residual field are both
// legible on screen; only the *ratio* of arrows within a frame is physical.
const GM = 4200
const RAW_SCALE = 0.9
const RESID_SCALE = 42

// A grid of test points that fall inside the planet disk.
const POINTS: [number, number][] = (() => {
  const pts: [number, number][] = []
  const step = RP_PX / 2.2
  for (let gx = -2; gx <= 2; gx++) {
    for (let gy = -2; gy <= 2; gy++) {
      const px = gx * step
      const py = gy * step
      if (Math.hypot(px, py) <= RP_PX - 4) pts.push([px, py])
    }
  }
  return pts
})()

// Slider distance r (in planet radii, centre-to-centre) → true physical units.
const R_MIN = 12
const R_MAX = 60
const R_REF = R_MAX // weakest tide used as the "×1" reference

// Gravitational pull the distant mass exerts on a point at physical offset
// (ox, oy) from the planet centre, when the mass sits at distance rUnits along +x.
function pull(ox: number, oy: number, rUnits: number): [number, number] {
  const dx = rUnits - ox
  const dy = -oy
  const d2 = dx * dx + dy * dy
  const d = Math.sqrt(d2)
  const a = GM / d2
  return [(a * dx) / d, (a * dy) / d]
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string
) {
  const len = Math.hypot(vx, vy)
  if (len < 0.4) return
  const ex = x + vx
  const ey = y + vy
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(ex, ey)
  ctx.stroke()
  const ang = Math.atan2(vy, vx)
  const head = Math.min(6, len * 0.5)
  ctx.beginPath()
  ctx.moveTo(ex, ey)
  ctx.lineTo(ex - head * Math.cos(ang - 0.4), ey - head * Math.sin(ang - 0.4))
  ctx.lineTo(ex - head * Math.cos(ang + 0.4), ey - head * Math.sin(ang + 0.4))
  ctx.closePath()
  ctx.fill()
}

export function TidalStretchAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rUnits, setRUnits] = useState(24)
  // Morph f: 0 = raw pull toward the mass, 1 = residual (tidal) field.
  const [f, setF] = useState(1)
  const [playing, setPlaying] = useState(false)
  const fRef = useRef(1)
  const rafRef = useRef(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setF(1)
        return
      }
      setF(0)
      setPlaying(true)
    },
  })

  const draw = useCallback((rU: number, morph: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== W * dpr) {
      canvas.width = W * dpr
      canvas.height = H * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    // The distant mass (the Moon), drawn to the right. Screen position is capped
    // so it stays visible even when r is large — labelled "not to scale".
    const moonScreenX = Math.min(CX + rU * PX_PER_UNIT * 0.55, W - 26)
    const scale = RAW_SCALE * (1 - morph) + RESID_SCALE * morph
    const [cx0, cy0] = pull(0, 0, rU) // pull at the planet centre

    // Deformed outline: an ellipse stretched along the mass axis, its
    // eccentricity growing with the strength of the residual field.
    const bulge = morph * Math.min(26, (2 * GM * RP_UNITS) / (rU * rU * rU) * 900)
    ctx.strokeStyle = 'rgba(129,140,248,0.35)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.ellipse(CX, CY, RP_PX + bulge, RP_PX - bulge * 0.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Planet disk.
    const grad = ctx.createRadialGradient(CX - 14, CY - 14, 6, CX, CY, RP_PX)
    grad.addColorStop(0, 'rgba(96,165,250,0.55)')
    grad.addColorStop(1, 'rgba(37,99,235,0.28)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(CX, CY, RP_PX, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.7)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.arc(CX, CY, RP_PX, 0, Math.PI * 2)
    ctx.stroke()

    // The field arrows.
    for (const [px, py] of POINTS) {
      const ox = px / PX_PER_UNIT
      const oy = -py / PX_PER_UNIT
      const [rx, ry] = pull(ox, oy, rU)
      // Morph from raw pull toward residual (raw minus the centre's pull).
      const vx = (rx - morph * cx0) * scale
      const vy = (ry - morph * cy0) * scale
      // Colour by whether the residual stretches outward (indigo) or squeezes
      // inward (blue) along the radial direction from the planet centre.
      const rad = Math.hypot(px, py) || 1
      const outward = (vx * px + vy * py) / rad
      const color = morph > 0.5 && outward > 0 ? ACCENT : BLUE
      drawArrow(ctx, CX + px, CY + py, vx, -vy, color)
    }

    // The mass.
    ctx.fillStyle = '#9CA3AF'
    ctx.beginPath()
    ctx.arc(moonScreenX, CY, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = MUTED
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('Moon →', moonScreenX, CY - 18)
    ctx.fillText('(not to scale)', moonScreenX, CY + 26)
    ctx.textAlign = 'left'

    // Header badge.
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = morph > 0.5 ? ACCENT : GOLD
    ctx.fillText(
      morph > 0.5 ? 'DIFFERENTIAL (tidal) field — two bulges' : 'RAW pull — looks like one direction',
      18,
      26
    )
    ctx.fillStyle = MUTED
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    ctx.fillText('near side', CX - RP_PX - 6, CY + 3)
    ctx.textAlign = 'left'
    ctx.fillText('far side', CX + RP_PX + 6, CY + 3)
  }, [])

  useEffect(() => {
    fRef.current = f
    draw(rUnits, f)
  }, [draw, rUnits, f])

  // Morph raw → residual once, then stop.
  useEffect(() => {
    if (!playing) return
    const step = () => {
      fRef.current = Math.min(1, fRef.current + 0.012)
      setF(fRef.current)
      if (fRef.current >= 1) {
        setPlaying(false)
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  const reset = () => {
    triggerReset()
    setPlaying(false)
    fRef.current = 0
    setF(0)
    setRUnits(24)
  }

  const replay = () => {
    fRef.current = 0
    setF(0)
    setPlaying(true)
  }

  const relStrength = Math.pow(R_REF / rUnits, 3)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label" style={{ color: ACCENT }}>
          <Play size={13} /> Interactive · Why two bulges, not one
        </span>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
        <div className="mt-3 px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            r = <strong style={{ color: ACCENT }}>{rUnits} R⊕</strong>
          </span>
          <span>tidal ∝ 1/r³</span>
          <span>
            stretch ≈ <strong style={{ color: GOLD }}>×{relStrength.toFixed(1)}</strong> (vs r = {R_REF})
          </span>
          <span className="text-text-muted">halve r → ×8 stretch</span>
        </div>
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={replay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          <Play size={12} /> Subtract centre pull
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>distance r:</span>
          <input
            type="range"
            min={R_MIN}
            max={R_MAX}
            step={1}
            value={rUnits}
            onChange={e => setRUnits(+e.target.value)}
            className="w-40"
            style={{ accentColor: ACCENT }}
          />
          <span className="font-mono text-text-secondary">{rUnits} R⊕</span>
        </label>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Each arrow is the pull the Moon exerts on that point. Raw, they all point roughly one way. Subtract the pull
        on the planet&apos;s <em>centre</em> — what actually shapes the tide — and the residual points{' '}
        <strong style={{ color: ACCENT }}>outward on both the near and far sides</strong> (two bulges) and inward on the
        flanks. Because the field is a <em>difference</em> of pulls, it weakens as 1/r³, far faster than gravity&apos;s 1/r².
      </p>
    </div>
  )
}
