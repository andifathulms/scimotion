'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380
const CX = W / 2
const CY = H / 2 + 6
const RX = 220 // orbit semi-axes (drawn as an oblique, nearly circular ellipse)
const RY = 112

const CYAN = '#22D3EE'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const ORANGE = '#FB923C'
const TILT = 23.4 // degrees

// The four key stations, given by orbital angle (measured so that the axis,
// which points to a FIXED direction in space, leans toward the Sun in December
// and away in June). Angle 0 = right of Sun.
type Station = {
  angle: number // position around the orbit, radians
  date: string
  sunward: 'North' | 'South' | 'Neither'
  north: string
  south: string
  perihelion?: boolean
}

const STATIONS: Station[] = [
  { angle: Math.PI / 2, date: 'Jun 21 solstice', sunward: 'North', north: 'summer', south: 'winter' },
  { angle: Math.PI, date: 'Sep 22 equinox', sunward: 'Neither', north: 'autumn', south: 'spring' },
  { angle: (3 * Math.PI) / 2, date: 'Dec 21 solstice', sunward: 'South', north: 'winter', south: 'summer', perihelion: true },
  { angle: 2 * Math.PI, date: 'Mar 20 equinox', sunward: 'Neither', north: 'spring', south: 'autumn' },
]

const FRAMES_PER_LEG = 60 // frames spent travelling between stations

// Position on the orbit for a given angle. The Sun sits at the centre.
function orbitPos(angle: number): { x: number; y: number } {
  return { x: CX + RX * Math.cos(angle), y: CY - RY * Math.sin(angle) }
}

function drawEarth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sunwardHemisphere: number, // -1 South leans sunward (toward Sun at centre-left), +1 North, 0 neither
  big: boolean
) {
  const r = big ? 26 : 9
  // The axis tilts a fixed direction in space; we render that as a constant
  // screen-space lean, and shade the hemisphere pointing toward the Sun.
  const axAngle = (-TILT * Math.PI) / 180 // fixed lean in the drawing plane

  // globe
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = big ? '#12324a' : '#1b3a52'
  ctx.fill()
  ctx.strokeStyle = `${BLUE}88`
  ctx.lineWidth = 1
  ctx.stroke()

  if (big) {
    // day/night terminator: the half facing the Sun (toward centre) is lit.
    const toSun = Math.atan2(CY - y, CX - x)
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, toSun - Math.PI / 2, toSun + Math.PI / 2)
    ctx.closePath()
    ctx.fillStyle = `${GOLD}22`
    ctx.fill()
    ctx.restore()

    // highlight the hemisphere tilted sunward
    if (sunwardHemisphere !== 0) {
      const capColor = sunwardHemisphere > 0 ? CYAN : ORANGE
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.clip()
      ctx.beginPath()
      // top cap = North, bottom cap = South
      if (sunwardHemisphere > 0) ctx.rect(x - r, y - r, 2 * r, r)
      else ctx.rect(x - r, y, 2 * r, r)
      ctx.fillStyle = `${capColor}44`
      ctx.fill()
      ctx.restore()
    }
  }

  // rotation axis (fixed lean), extended past the poles
  const ax = Math.sin(axAngle)
  const ay = -Math.cos(axAngle)
  const L = r + (big ? 16 : 5)
  ctx.beginPath()
  ctx.moveTo(x - ax * L, y - ay * L)
  ctx.lineTo(x + ax * L, y + ay * L)
  ctx.strokeStyle = big ? '#F5F0E8AA' : '#F5F0E855'
  ctx.lineWidth = big ? 1.5 : 1
  ctx.stroke()

  if (big) {
    // N / S pole markers
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#F5F0E8CC'
    ctx.fillText('N', x - ax * (L + 8), y - ay * (L + 8) + 3)
    ctx.fillText('S', x + ax * (L + 8), y + ay * (L + 8) + 3)
  }
}

export function SeasonsOrbitAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setStationIdx(2) // Dec solstice, static
        setLeg(0)
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [stationIdx, setStationIdx] = useState(0)
  const [leg, setLeg] = useState(0) // 0..1 progress from station i to i+1

  // interpolated orbital angle for the moving Earth
  const a0 = STATIONS[stationIdx].angle
  const a1 = STATIONS[(stationIdx + 1) % STATIONS.length].angle
  // ensure we always move forward (increasing angle)
  const a1adj = a1 <= a0 ? a1 + 2 * Math.PI : a1
  const angle = a0 + (a1adj - a0) * leg

  const nearest = leg < 0.5 ? stationIdx : (stationIdx + 1) % STATIONS.length
  const station = STATIONS[nearest]
  const atStation = leg < 0.06 || leg > 0.94

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

    // orbit path
    ctx.beginPath()
    ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    ctx.stroke()

    // "nearly circular" note
    ctx.fillStyle = 'rgba(245,240,232,0.34)'
    ctx.textAlign = 'center'
    ctx.fillText('orbit is nearly circular (eccentricity exaggerated by viewing angle)', CX, H - 10)

    // Sun at centre
    const sunGrad = ctx.createRadialGradient(CX, CY, 4, CX, CY, 34)
    sunGrad.addColorStop(0, '#FFE9A8')
    sunGrad.addColorStop(0.5, GOLD)
    sunGrad.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.beginPath()
    ctx.arc(CX, CY, 34, 0, Math.PI * 2)
    ctx.fillStyle = sunGrad
    ctx.fill()
    ctx.beginPath()
    ctx.arc(CX, CY, 15, 0, Math.PI * 2)
    ctx.fillStyle = '#FFD873'
    ctx.fill()
    ctx.fillStyle = '#F5F0E8'
    ctx.textAlign = 'center'
    ctx.fillText('Sun', CX, CY + 3)

    // small ghost Earths + labels at each station
    for (const s of STATIONS) {
      const p = orbitPos(s.angle)
      const hemi = s.sunward === 'North' ? 1 : s.sunward === 'South' ? -1 : 0
      drawEarth(ctx, p.x, p.y, hemi, false)
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.font = '9px monospace'
      const outX = CX + (RX + 30) * Math.cos(s.angle)
      const outY = CY - (RY + 26) * Math.sin(s.angle)
      ctx.textAlign = outX < CX - 20 ? 'right' : outX > CX + 20 ? 'left' : 'center'
      ctx.fillText(s.date, outX, outY)
      if (s.perihelion) {
        ctx.fillStyle = `${CYAN}AA`
        ctx.fillText('~perihelion (early Jan)', outX, outY + 11)
      }
    }

    // The travelling Earth (big)
    const ep = orbitPos(angle)
    const sunwardNow = station.sunward === 'North' ? 1 : station.sunward === 'South' ? -1 : 0
    // Determine lean-toward-sun continuously by the axis' fixed direction:
    // North leans sunward on the sunward-left arc (angle near pi/2), etc.
    const northLean = Math.sin(angle) // >0 near Jun solstice: North toward Sun
    const hemiNow = Math.abs(northLean) < 0.2 ? 0 : northLean > 0 ? 1 : -1
    drawEarth(ctx, ep.x, ep.y, atStation ? sunwardNow : hemiNow, true)

    // ray from Sun toward Earth
    ctx.beginPath()
    ctx.setLineDash([3, 4])
    ctx.moveTo(CX, CY)
    ctx.lineTo(ep.x, ep.y)
    ctx.strokeStyle = `${GOLD}44`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])

    // top-left title
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.7)'
    ctx.font = '11px monospace'
    ctx.fillText('Axis tilt 23.4° — fixed direction in space', 14, 22)
  }, [angle, station, atStation])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    let hold = 0
    const loop = () => {
      setLeg(prev => {
        // pause briefly at each station
        if ((prev < 0.02 || prev > 0.98) && hold < 40) {
          hold += 1
          return prev
        }
        hold = 0
        const next = prev + 1 / FRAMES_PER_LEG
        if (next >= 1) {
          setStationIdx(s => (s + 1) % STATIONS.length)
          return 0
        }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStationIdx(0)
    setLeg(0)
  }

  const sunwardLabel =
    station.sunward === 'Neither' ? 'neither (equinox)' : `${station.sunward}ern Hemisphere`
  const sunwardColor =
    station.sunward === 'North' ? CYAN : station.sunward === 'South' ? ORANGE : 'rgba(245,240,232,0.6)'

  return (
    <div ref={ref} className="animation-block">
      <div
        className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1"
        style={{ marginBottom: 8 }}
      >
        <span>
          date: <span style={{ color: '#F5F0E8' }}>{station.date}</span>
        </span>
        <span>
          tilted toward Sun: <span style={{ color: sunwardColor }}>{sunwardLabel}</span>
        </span>
        <span>
          North: <span style={{ color: CYAN }}>{station.north}</span>
        </span>
        <span>
          South: <span style={{ color: ORANGE }}>{station.south}</span>
        </span>
      </div>
      <canvas
          role="img"
          aria-label="Animated diagram: Seasons orbit. Values are reported below the diagram."
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
        <span className="text-xs text-text-muted font-mono">
          The hemispheres are always in opposite seasons.
        </span>
      </div>
    </div>
  )
}
