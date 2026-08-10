'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 380
const EX = 300 // Earth centre x
const EY = 190 // Earth centre y
const RORBIT = 118 // Moon orbital radius (screen)
const RMOON = 13 // Moon disc radius in overhead view
const INSET_X = 512 // phase-inset centre
const INSET_Y = 96
const INSET_R = 52

const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const INDIGO = '#818CF8'
const MOON_LIT = '#E9E3D2'
const MOON_DARK = '#2A2822'
const SYNODIC = 29.53

// Draw a Moon disc showing a phase, as seen from Earth.
// f = illuminated fraction (0..1); waxing = lit limb on the right.
function drawPhaseDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  f: number,
  waxing: boolean
) {
  // dark base disc
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = MOON_DARK
  ctx.fill()

  if (f > 0.997) {
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = MOON_LIT
    ctx.fill()
  } else if (f >= 0.003) {
    const offMag = R * Math.abs(1 - 2 * f) // terminator half-width
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = MOON_LIT
    ctx.beginPath()
    if (waxing) {
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, false) // right limb, top->bottom
      ctx.ellipse(cx, cy, offMag, R, 0, Math.PI / 2, -Math.PI / 2, f > 0.5)
    } else {
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, true) // left limb, top->bottom
      ctx.ellipse(cx, cy, offMag, R, 0, Math.PI / 2, -Math.PI / 2, f < 0.5)
    }
    ctx.fill()
    ctx.restore()
  }

  // outline
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(245,240,232,0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
}

function phaseName(f: number, waxing: boolean): string {
  if (f < 0.02) return 'New Moon'
  if (f > 0.98) return 'Full Moon'
  if (Math.abs(f - 0.5) < 0.03) return waxing ? 'First Quarter' : 'Last Quarter'
  if (f < 0.5) return waxing ? 'Waxing Crescent' : 'Waning Crescent'
  return waxing ? 'Waxing Gibbous' : 'Waning Gibbous'
}

export function MoonPhaseAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setPhi((3 * Math.PI) / 2) // static first-quarter view
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const draggingRef = useRef(false)

  const [running, setRunning] = useState(false)
  const [phi, setPhi] = useState(Math.PI) // start at new Moon

  // Illuminated fraction seen from Earth and waxing/waning state.
  const f = (1 + Math.cos(phi)) / 2
  const waxing = Math.sin(phi) < 0 // lower half of orbit -> waxing (right-lit)
  const name = phaseName(f, waxing)
  // Progress through the synodic month: new(phi=pi)=0, full(phi=0)=0.5
  const prog = (((phi - Math.PI) / (2 * Math.PI)) % 1 + 1) % 1
  const day = prog * SYNODIC

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

    // ---- Sunlight from the left (parallel rays) ----
    const sunGrad = ctx.createLinearGradient(0, 0, 90, 0)
    sunGrad.addColorStop(0, 'rgba(245,158,11,0.28)')
    sunGrad.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = sunGrad
    ctx.fillRect(0, 0, 90, H)
    ctx.strokeStyle = 'rgba(245,158,11,0.35)'
    ctx.lineWidth = 1
    for (let y = 40; y < H; y += 46) {
      ctx.beginPath()
      ctx.moveTo(6, y)
      ctx.lineTo(64, y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(64, y)
      ctx.lineTo(56, y - 4)
      ctx.moveTo(64, y)
      ctx.lineTo(56, y + 4)
      ctx.stroke()
    }
    ctx.fillStyle = GOLD
    ctx.textAlign = 'left'
    ctx.font = '11px monospace'
    ctx.fillText('Sunlight', 8, 22)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('(always lights the', 8, H - 24)
    ctx.fillText('left half of the Moon)', 8, H - 12)

    // ---- Orbit path ----
    ctx.beginPath()
    ctx.arc(EX, EY, RORBIT, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(245,240,232,0.16)'
    ctx.lineWidth = 1
    ctx.stroke()

    // ---- Earth ----
    ctx.beginPath()
    ctx.arc(EX, EY, 20, 0, Math.PI * 2)
    ctx.fillStyle = '#173a54'
    ctx.fill()
    // Earth's lit (left) half
    ctx.save()
    ctx.beginPath()
    ctx.arc(EX, EY, 20, 0, Math.PI * 2)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(EX - 20, EY - 20, 20, 40)
    ctx.fillStyle = 'rgba(96,165,250,0.35)'
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = `${BLUE}99`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#F5F0E8'
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillText('Earth', EX, EY + 34)

    // ---- Moon position (overhead) ----
    const mx = EX + RORBIT * Math.cos(phi)
    const my = EY - RORBIT * Math.sin(phi)

    // line of sight Earth -> Moon
    ctx.beginPath()
    ctx.setLineDash([3, 4])
    ctx.moveTo(EX, EY)
    ctx.lineTo(mx, my)
    ctx.strokeStyle = `${INDIGO}88`
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])

    // Moon overhead: left half lit (toward Sun), right half dark
    ctx.beginPath()
    ctx.arc(mx, my, RMOON, 0, Math.PI * 2)
    ctx.fillStyle = MOON_DARK
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.arc(mx, my, RMOON, 0, Math.PI * 2)
    ctx.clip()
    ctx.beginPath()
    ctx.rect(mx - RMOON, my - RMOON, RMOON, RMOON * 2)
    ctx.fillStyle = MOON_LIT
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(mx, my, RMOON, 0, Math.PI * 2)
    ctx.strokeStyle = `${INDIGO}CC`
    ctx.lineWidth = 1.5
    ctx.stroke()
    // drag hint ring
    ctx.beginPath()
    ctx.arc(mx, my, RMOON + 5, 0, Math.PI * 2)
    ctx.strokeStyle = `${INDIGO}44`
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.textAlign = 'center'
    ctx.font = '9px monospace'
    ctx.fillText('drag me', mx, my - RMOON - 8)

    // ---- Phase inset: the Moon as seen from Earth ----
    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.textAlign = 'center'
    ctx.font = '10px monospace'
    ctx.fillText('View from Earth', INSET_X, INSET_Y - INSET_R - 12)
    drawPhaseDisc(ctx, INSET_X, INSET_Y, INSET_R, f, waxing)
    ctx.fillStyle = '#F5F0E8'
    ctx.font = '11px monospace'
    ctx.fillText(name, INSET_X, INSET_Y + INSET_R + 18)

    // note: no Earth shadow involved (unless flagged aligned)
    ctx.textAlign = 'right'
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('No Earth shadow here —', W - 10, H - 24)
    ctx.fillText('phase is our viewing angle.', W - 10, H - 12)
  }, [phi, f, waxing, name])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    const loop = () => {
      setPhi(p => (p + 0.0075) % (Math.PI * 2))
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const phiFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return Math.atan2(EY - y, x - EX)
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true
    setRunning(false)
    const a = phiFromEvent(e)
    if (a !== null) setPhi((a % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2))
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return
    const a = phiFromEvent(e)
    if (a !== null) setPhi((a % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2))
  }
  const onUp = () => {
    draggingRef.current = false
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setPhi(Math.PI)
  }

  return (
    <div ref={ref} className="animation-block">
      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1" style={{ marginBottom: 8 }}>
        <span>
          phase: <span style={{ color: '#F5F0E8' }}>{name}</span>
        </span>
        <span>
          illuminated: <span style={{ color: INDIGO }}>{Math.round(f * 100)}%</span>
        </span>
        <span>
          trend: <span style={{ color: waxing ? '#8FE388' : '#F0B37A' }}>{waxing ? 'waxing' : 'waning'}</span>
        </span>
        <span>
          day <span style={{ color: '#F5F0E8' }}>{day.toFixed(1)}</span> of {SYNODIC}
        </span>
      </div>
      <canvas
          role="img"
          aria-label="Animated diagram: Moon phase. Values are reported below the diagram."
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ width: '100%', maxWidth: W, aspectRatio: `${W} / ${H}`, background: 'var(--color-canvas)', borderRadius: 8, touchAction: 'none', cursor: 'pointer' }}
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
        <span className="text-xs text-text-muted font-mono">Drag the Moon around its orbit to change the phase.</span>
      </div>
    </div>
  )
}
