'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 360
const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const ORANGE = '#FB923C'

const GROUND_Y = 268
const BEAM_W = 74 // fixed cross-sectional width of the parallel beam (pixels)
const N_RAYS = 7

// The beam carries fixed power across its width BEAM_W. When it lands at
// elevation e, its footprint on the ground has width BEAM_W / sin(e), so the
// intensity per unit ground area scales as sin(elevation) = cos(theta), where
// theta is the sun's angle from the vertical.
function footprintWidth(elevDeg: number): number {
  const e = (Math.max(1, elevDeg) * Math.PI) / 180
  return BEAM_W / Math.sin(e)
}

function intensity(elevDeg: number): number {
  return Math.sin((elevDeg * Math.PI) / 180) // = cos(theta from vertical), 0..1
}

// Fixed patch used as a reference on the ground so the growing/shrinking
// footprint reads against a constant scale.
const PATCH_CX = 300

function drawScene(ctx: CanvasRenderingContext2D, elevDeg: number, t: number) {
  ctx.fillStyle = '#0F0D0A'
  ctx.fillRect(0, 0, W, H)

  // ground
  ctx.beginPath()
  ctx.moveTo(0, GROUND_Y)
  ctx.lineTo(W, GROUND_Y)
  ctx.strokeStyle = 'rgba(245,240,232,0.4)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(245,240,232,0.05)'
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

  const e = (elevDeg * Math.PI) / 180
  const fp = footprintWidth(elevDeg)
  const inten = intensity(elevDeg)

  // footprint on the ground, centred on the reference patch
  const fpL = PATCH_CX - fp / 2
  const fpR = PATCH_CX + fp / 2

  // beam direction (coming down-right toward the ground from upper left)
  const dirX = Math.cos(e)
  const dirY = Math.sin(e)

  // Draw the illuminated footprint band
  const bandColor = inten > 0.6 ? CYAN : inten > 0.33 ? GOLD : ORANGE
  ctx.fillStyle = `${bandColor}55`
  ctx.fillRect(fpL, GROUND_Y - 4, fp, 8)
  ctx.strokeStyle = bandColor
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(fpL, GROUND_Y)
  ctx.lineTo(fpR, GROUND_Y)
  ctx.stroke()

  // The parallel rays: N_RAYS rays across the fixed beam width, all parallel,
  // landing evenly spread across the footprint.
  const rayLen = 230
  for (let i = 0; i < N_RAYS; i++) {
    const f = i / (N_RAYS - 1)
    const gx = fpL + f * fp // landing point on ground
    // travel back up the beam direction
    const sx = gx - dirX * rayLen
    const sy = GROUND_Y - dirY * rayLen
    // animated dashes moving along the ray
    ctx.save()
    ctx.strokeStyle = `${GOLD}CC`
    ctx.lineWidth = 1.4
    ctx.setLineDash([8, 8])
    ctx.lineDashOffset = -(t * 40) % 16
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(gx, GROUND_Y)
    ctx.stroke()
    ctx.restore()
    // arrowhead at ground
    ctx.beginPath()
    ctx.moveTo(gx, GROUND_Y)
    ctx.lineTo(gx - dirX * 8 - dirY * 4, GROUND_Y - dirY * 8 + dirX * 4)
    ctx.lineTo(gx - dirX * 8 + dirY * 4, GROUND_Y - dirY * 8 - dirX * 4)
    ctx.closePath()
    ctx.fillStyle = `${GOLD}CC`
    ctx.fill()
  }

  // The Sun disc up the beam
  const sunX = PATCH_CX - dirX * (rayLen + 8)
  const sunY = GROUND_Y - dirY * (rayLen + 8)
  const g = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 22)
  g.addColorStop(0, '#FFE9A8')
  g.addColorStop(0.55, GOLD)
  g.addColorStop(1, 'rgba(245,158,11,0)')
  ctx.beginPath()
  ctx.arc(sunX, sunY, 22, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()

  // elevation-angle arc at the ground reference
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(245,240,232,0.5)'
  ctx.lineWidth = 1
  ctx.arc(PATCH_CX, GROUND_Y, 40, Math.PI, Math.PI + e, false)
  ctx.stroke()
  ctx.fillStyle = 'rgba(245,240,232,0.7)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`elevation ${elevDeg.toFixed(0)}°`, PATCH_CX - 150, GROUND_Y + 22)
  ctx.fillText(`θ from vertical ${(90 - elevDeg).toFixed(0)}°`, PATCH_CX - 150, GROUND_Y + 36)

  // vertical dotted reference (straight-down)
  ctx.beginPath()
  ctx.setLineDash([2, 4])
  ctx.strokeStyle = 'rgba(245,240,232,0.25)'
  ctx.moveTo(PATCH_CX, GROUND_Y)
  ctx.lineTo(PATCH_CX, GROUND_Y - 120)
  ctx.stroke()
  ctx.setLineDash([])

  // intensity bar (right side)
  const barX = W - 46
  const barTop = 60
  const barH = 170
  ctx.strokeStyle = 'rgba(245,240,232,0.3)'
  ctx.lineWidth = 1
  ctx.strokeRect(barX, barTop, 20, barH)
  ctx.fillStyle = `${bandColor}CC`
  ctx.fillRect(barX, barTop + barH * (1 - inten), 20, barH * inten)
  ctx.fillStyle = 'rgba(245,240,232,0.7)'
  ctx.textAlign = 'center'
  ctx.fillText('I / I₀', barX + 10, barTop - 8)
  ctx.fillText(inten.toFixed(2), barX + 10, barTop + barH + 14)

  // labels
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(245,240,232,0.72)'
  ctx.font = '11px monospace'
  ctx.fillText('Same beam power, spread over the footprint', 14, 24)
  ctx.font = '10px monospace'
  ctx.fillStyle = `${bandColor}DD`
  const regime = inten > 0.6 ? 'high sun · summer · concentrated' : inten > 0.33 ? 'moderate sun' : 'low sun · winter · spread thin'
  ctx.fillText(regime, 14, 40)
}

export function SunAngleAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setElev(65)
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const tRef = useRef(0)
  const sweepDirRef = useRef(1)

  const [running, setRunning] = useState(false)
  const [elev, setElev] = useState(65) // sun elevation in degrees, 5..85
  const [tick, setTick] = useState(0) // forces redraw for ray animation

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
    drawScene(ctx, elev, tRef.current)
  }, [elev])

  useEffect(() => {
    draw()
  }, [draw, tick])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      tRef.current += 0.016
      // slowly sweep the elevation back and forth so the footprint breathes
      setElev(prev => {
        let next = prev + sweepDirRef.current * 0.4
        if (next >= 85) {
          next = 85
          sweepDirRef.current = -1
        } else if (next <= 5) {
          next = 5
          sweepDirRef.current = 1
        }
        return next
      })
      setTick(t => t + 1)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    tRef.current = 0
    sweepDirRef.current = 1
    setElev(65)
    setTick(t => t + 1)
  }

  const inten = intensity(elev)
  const fpRel = footprintWidth(elev) / BEAM_W

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1" style={{ marginBottom: 8 }}>
        <span>
          elevation: <span style={{ color: '#F5F0E8' }}>{elev.toFixed(0)}°</span>
        </span>
        <span>
          θ from vertical: <span style={{ color: '#F5F0E8' }}>{(90 - elev).toFixed(0)}°</span>
        </span>
        <span>
          intensity I = I₀·cosθ: <span style={{ color: CYAN }}>{inten.toFixed(2)}</span>
        </span>
        <span>
          footprint: <span style={{ color: ORANGE }}>×{fpRel.toFixed(1)}</span>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', maxWidth: W, aspectRatio: `${W} / ${H}`, background: 'var(--color-canvas)', borderRadius: 8 }}
      />
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-accent-gold text-bg-base"
        >
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-hover text-text-secondary"
        >
          <RotateCcw size={12} /> Reset
        </button>
        <label className="flex items-center gap-2 text-xs text-text-secondary font-mono">
          <span className="text-text-muted">sun elevation</span>
          <input
            type="range"
            min={5}
            max={85}
            step={1}
            value={elev}
            onChange={e => {
              setRunning(false)
              setElev(Number(e.target.value))
              setTick(t => t + 1)
            }}
            style={{ accentColor: CYAN }}
          />
        </label>
      </div>
    </div>
  )
}
