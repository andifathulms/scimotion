'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

// Orbit view lives on the left; the radial-velocity curve on the right.
const BX = 165           // barycentre x
const BY = 150           // barycentre y
const PLANET_ORBIT = 96  // planet's orbital radius in px (fixed)
const MASS_TO_PX = 3.2   // star wobble radius per Jupiter mass (exaggerated for view)
const PERIOD_MS = 8000

const PLOT_L = 330
const PLOT_R = 584
const PLOT_TOP = 40
const PLOT_BOT = 260
const PLOT_MID = (PLOT_TOP + PLOT_BOT) / 2
const K_MAX = 46         // px amplitude that pins the RV axis (max mass)

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  mass: { default: 4, min: 0.5, max: 12, step: 0.1 },
}

export function RadialVelocityAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { phaseRef.current = 0.12; draw(0.12); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('radial-velocity', SPEC)
  const { mass } = params
  const [readout, setReadout] = useState({ rv: 0, k: 0 })

  // Star's reflex-orbit radius grows with planet mass (m_star held fixed).
  const starOrbit = useCallback((m: number) => m * MASS_TO_PX, [])

  // Line-of-sight velocity of the star, normalised to [-1, 1], observer to the
  // right. theta = 2*pi*phase. Star at angle theta; planet on the opposite side.
  const rvUnit = (phase: number) => -Math.sin(2 * Math.PI * phase)

  const draw = useCallback((phase: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const sr = starOrbit(mass)
    const theta = 2 * Math.PI * phase
    const starX = BX + sr * Math.cos(theta)
    const starY = BY + sr * Math.sin(theta)
    const planetX = BX - PLANET_ORBIT * Math.cos(theta)
    const planetY = BY - PLANET_ORBIT * Math.sin(theta)

    // Star velocity toward observer (+x is toward Earth). vx = -sr*w*sin(theta).
    const vTowards = -Math.sin(theta)   // sign only; +ve = approaching (blueshift)
    const kNorm = sr / (12 * MASS_TO_PX) // amplitude relative to max mass = 12

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }

    // --- orbit view ---
    // planet orbit path
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(BX, BY, PLANET_ORBIT, PLANET_ORBIT, 0, 0, Math.PI * 2); ctx.stroke()
    // star orbit path (small)
    ctx.strokeStyle = 'rgba(129,140,248,0.35)'
    ctx.beginPath(); ctx.ellipse(BX, BY, Math.max(sr, 1), Math.max(sr, 1), 0, 0, Math.PI * 2); ctx.stroke()

    // barycentre marker
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(BX - 5, BY - 5); ctx.lineTo(BX + 5, BY + 5)
    ctx.moveTo(BX + 5, BY - 5); ctx.lineTo(BX - 5, BY + 5); ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('barycentre', BX - 26, BY + 20)

    // rigid rod star—barycentre—planet
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1.25
    ctx.beginPath(); ctx.moveTo(starX, starY); ctx.lineTo(planetX, planetY); ctx.stroke()

    // planet
    ctx.fillStyle = '#60A5FA'
    ctx.beginPath(); ctx.arc(planetX, planetY, 6, 0, Math.PI * 2); ctx.fill()

    // star — tinted by its current Doppler state
    const shiftColor = vTowards > 0.02 ? '#60A5FA' : vTowards < -0.02 ? '#F472B6' : '#F59E0B'
    const glow = ctx.createRadialGradient(starX, starY, 3, starX, starY, 26)
    glow.addColorStop(0, vTowards > 0.02 ? 'rgba(96,165,250,0.5)' : vTowards < -0.02 ? 'rgba(244,114,182,0.5)' : 'rgba(245,158,11,0.5)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(starX, starY, 26, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(starX, starY, 11, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = shiftColor
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(starX, starY, 13, 0, Math.PI * 2); ctx.stroke()

    // observer direction (to Earth, at right of the orbit view)
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(BX + PLANET_ORBIT + 14, 40); ctx.lineTo(BX + PLANET_ORBIT + 14, 260); ctx.stroke()
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(starX, starY); ctx.lineTo(BX + PLANET_ORBIT + 14, starY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.save(); ctx.translate(BX + PLANET_ORBIT + 26, 150); ctx.rotate(-Math.PI / 2)
    ctx.fillText('to Earth →', -22, 0); ctx.restore()

    // shift label near the star
    ctx.fillStyle = shiftColor
    ctx.fillText(vTowards > 0.02 ? 'blueshift' : vTowards < -0.02 ? 'redshift' : '—', starX - 20, starY - 18)

    // --- RV curve panel ---
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, PLOT_TOP); ctx.lineTo(PLOT_L, PLOT_BOT); ctx.lineTo(PLOT_R, PLOT_BOT)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,245,235,0.10)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(PLOT_L, PLOT_MID); ctx.lineTo(PLOT_R, PLOT_MID); ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('RV', PLOT_L - 24, PLOT_TOP + 8)
    ctx.fillText('0', PLOT_L - 14, PLOT_MID + 3)
    ctx.fillStyle = 'rgba(96,165,250,0.85)'
    ctx.fillText('toward (blue)', PLOT_L + 6, PLOT_TOP + 14)
    ctx.fillStyle = 'rgba(244,114,182,0.85)'
    ctx.fillText('away (red)', PLOT_L + 6, PLOT_BOT - 6)

    const amp = kNorm * K_MAX
    const xOf = (p: number) => PLOT_L + p * (PLOT_R - PLOT_L)
    const yOf = (p: number) => PLOT_MID - rvUnit(p) * amp

    // full sinusoid, faint
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.22)'
    ctx.lineWidth = 1.25
    for (let i = 0; i <= 200; i++) {
      const p = i / 200
      if (i === 0) ctx.moveTo(xOf(p), yOf(p)); else ctx.lineTo(xOf(p), yOf(p))
    }
    ctx.stroke()

    // traced portion up to current phase
    ctx.beginPath()
    ctx.strokeStyle = '#10B981'
    ctx.lineWidth = 2
    const steps = Math.max(1, Math.round(phase * 200))
    for (let i = 0; i <= steps; i++) {
      const p = (i / 200)
      if (i === 0) ctx.moveTo(xOf(p), yOf(p)); else ctx.lineTo(xOf(p), yOf(p))
    }
    ctx.stroke()

    // marker at current phase, coloured by shift
    ctx.fillStyle = shiftColor
    ctx.beginPath(); ctx.arc(xOf(phase), yOf(phase), 4, 0, Math.PI * 2); ctx.fill()

    // amplitude bracket K
    ctx.strokeStyle = 'rgba(16,185,129,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PLOT_R - 8, PLOT_MID); ctx.lineTo(PLOT_R - 8, PLOT_MID - amp); ctx.stroke()
    ctx.fillStyle = 'rgba(16,185,129,0.9)'
    ctx.fillText('K', PLOT_R - 6, PLOT_MID - amp / 2)

    setReadout({ rv: rvUnit(phase) * kNorm, k: kNorm })
  }, [mass, starOrbit])

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
    draw(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · A heavier planet, a bigger wobble</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: A heavier planet, a bigger wobble. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Planet mass:</span>
          <input
            type="range" min={SPEC.mass.min} max={SPEC.mass.max} step={SPEC.mass.step} value={mass}
            onChange={ev => { set('mass', +ev.target.value) }}
            className="w-36 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">{mass.toFixed(1)} M<sub>J</sub></span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          wobble K ∝ <strong className="text-accent-gold">{readout.k.toFixed(2)}</strong>
          {'  ·  '}
          RV = <strong className={readout.rv > 0 ? 'text-accent-blue' : 'text-accent-pink'}>{readout.rv >= 0 ? '+' : ''}{readout.rv.toFixed(2)}</strong>
        </WidgetStatus>
      </div>
    </div>
  )
}
