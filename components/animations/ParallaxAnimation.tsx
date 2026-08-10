'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

// --- top-down geometry panel ---
const SUN_X = 150
const SUN_Y = 92
const AU_PX = 34          // Earth's orbital radius on screen
const N_Y = SUN_Y         // the nearby star sits level with the Sun, off to the right

// --- "what the telescope sees" sky panel ---
const SKY_MID_X = 320
const SKY_MID_Y = 246
const PERIOD_MS = 6000    // one full Earth orbit in wall-clock ms

// Fixed distant-background stars for the sky panel (baked, so the field never
// wanders). These are the far anchors the nearby star appears to shift against.
const BG_STARS: { x: number; y: number; r: number }[] = [
  { x: 70, y: 214, r: 1.1 }, { x: 128, y: 272, r: 0.9 }, { x: 196, y: 226, r: 1.4 },
  { x: 250, y: 280, r: 1.0 }, { x: 372, y: 218, r: 1.2 }, { x: 430, y: 268, r: 0.9 },
  { x: 486, y: 232, r: 1.3 }, { x: 540, y: 276, r: 1.0 }, { x: 100, y: 250, r: 0.8 },
  { x: 410, y: 240, r: 0.8 }, { x: 300, y: 214, r: 0.9 }, { x: 540, y: 216, r: 1.1 },
]

// Screen x of the nearby star grows with its true distance: a more distant star
// is drawn farther from the Sun, and its parallax wedge is correspondingly tighter.
const nearStarX = (d: number) => SUN_X + 14 * d
// Apparent swing in the sky panel, in pixels. Exaggerated for legibility but it
// scales as 1/d — the whole point: closer stars shift more.
const swingPx = (d: number) => Math.min(120, 120 / d)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  dist: { default: 3, min: 1, max: 10, step: 0.5 },
}

export function ParallaxAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { phaseRef.current = 0.25; draw(0.25); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('parallax', SPEC)
  const { dist } = params

  const draw = useCallback((phase: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const d = dist
    const theta = phase * Math.PI * 2
    const Nx = nearStarX(d)
    const A = swingPx(d)

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }

    // ===== top-down geometry panel =====
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('Top-down view: Earth orbits the Sun', 16, 20)

    // "to distant background" arrow off the right edge
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(Nx, N_Y); ctx.lineTo(582, N_Y); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('to distant background →', 452, N_Y - 6)

    // Earth's orbit
    ctx.strokeStyle = 'rgba(96,165,250,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, AU_PX, 0, Math.PI * 2); ctx.stroke()

    // extreme Earth positions (top & bottom of the orbit) define the baseline
    const eTop = { x: SUN_X, y: SUN_Y + AU_PX }
    const eBot = { x: SUN_X, y: SUN_Y - AU_PX }

    // parallax wedge: the two sight-lines from the orbit extremes to the star
    ctx.strokeStyle = 'rgba(129,140,248,0.45)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(eTop.x, eTop.y); ctx.lineTo(Nx, N_Y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(eBot.x, eBot.y); ctx.lineTo(Nx, N_Y); ctx.stroke()
    ctx.setLineDash([])

    // shade the parallax angle at the star
    const aTop = Math.atan2(eTop.y - N_Y, eTop.x - Nx)
    const aBot = Math.atan2(eBot.y - N_Y, eBot.x - Nx)
    ctx.fillStyle = 'rgba(129,140,248,0.18)'
    ctx.beginPath()
    ctx.moveTo(Nx, N_Y)
    ctx.arc(Nx, N_Y, 26, aTop, aBot, true)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#818CF8'
    ctx.fillText('p', Nx - 40, N_Y + 3)

    // baseline marker (1 AU, half-orbit) — the known length that sets the scale
    ctx.strokeStyle = 'rgba(96,165,250,0.6)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(eBot.x - 12, eBot.y); ctx.lineTo(eTop.x - 12, eTop.y); ctx.stroke()
    ctx.fillStyle = 'rgba(96,165,250,0.85)'
    ctx.fillText('1 AU', SUN_X - 46, SUN_Y - AU_PX - 4)

    // current Earth position + live sight-line
    const ex = SUN_X + AU_PX * Math.cos(theta)
    const ey = SUN_Y + AU_PX * Math.sin(theta)
    ctx.strokeStyle = 'rgba(34,211,238,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(Nx, N_Y); ctx.stroke()

    // Sun
    const glow = ctx.createRadialGradient(SUN_X, SUN_Y, 2, SUN_X, SUN_Y, 22)
    glow.addColorStop(0, 'rgba(245,158,11,0.5)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, 22, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(SUN_X, SUN_Y, 7, 0, Math.PI * 2); ctx.fill()

    // Earth
    ctx.fillStyle = '#60A5FA'
    ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill()

    // nearby star
    ctx.fillStyle = '#818CF8'
    ctx.beginPath(); ctx.arc(Nx, N_Y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('nearby star', Nx - 26, N_Y - 12)

    // ===== sky panel =====
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, 196); ctx.lineTo(W, 196); ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('What the telescope sees: the nearby star shifts, the far field stays put', 16, 210)

    // fixed distant background
    for (const s of BG_STARS) {
      ctx.fillStyle = 'rgba(245,240,232,0.32)'
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
    }

    // ghost markers at the two apparent extremes + the swing span
    ctx.fillStyle = 'rgba(129,140,248,0.28)'
    ctx.beginPath(); ctx.arc(SKY_MID_X - A, SKY_MID_Y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(SKY_MID_X + A, SKY_MID_Y, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(129,140,248,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(SKY_MID_X - A, SKY_MID_Y - 16); ctx.lineTo(SKY_MID_X + A, SKY_MID_Y - 16); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(SKY_MID_X - A, SKY_MID_Y - 20); ctx.lineTo(SKY_MID_X - A, SKY_MID_Y - 12); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(SKY_MID_X + A, SKY_MID_Y - 20); ctx.lineTo(SKY_MID_X + A, SKY_MID_Y - 12); ctx.stroke()
    ctx.fillStyle = 'rgba(129,140,248,0.85)'
    ctx.fillText('apparent shift = 2p', SKY_MID_X - 44, SKY_MID_Y - 24)

    // the nearby star's live apparent position
    const apx = SKY_MID_X + A * Math.sin(theta)
    ctx.fillStyle = '#818CF8'
    ctx.beginPath(); ctx.arc(apx, SKY_MID_Y, 5, 0, Math.PI * 2); ctx.fill()
  }, [dist])

  useEffect(() => { draw(phaseRef.current) }, [draw])

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
      phaseRef.current = (phaseRef.current + dt / PERIOD_MS) % 1
      draw(phaseRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    phaseRef.current = 0
    lastRef.current = null
    set('dist', 3)
  }

  const parallaxArcsec = 1 / dist // p (arcsec) = 1 / d (pc), by definition of the parsec

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Measure a star&apos;s distance by its shift</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-indigo text-bg-base text-xs font-medium hover:bg-accent-indigo/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Star distance:</span>
          <input
            type="range" min={SPEC.dist.min} max={SPEC.dist.max} step={SPEC.dist.step} value={dist}
            onChange={ev => { set('dist', +ev.target.value) }}
            className="w-40 accent-accent-indigo"
          />
          <span className="text-text-secondary font-medium">d = {dist.toFixed(1)} pc</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          parallax p = 1/d = <strong className="text-accent-indigo">{parallaxArcsec.toFixed(2)}&Prime;</strong>
        </span>
      </div>
    </div>
  )
}
