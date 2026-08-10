'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const CX = 300            // star centre x
const SY = 78             // star centre y
const R = 46              // star radius in px
const PATH_L = 44         // planet enters here
const PATH_R = 556        // planet leaves here
const PERIOD_MS = 7000    // one crossing in wall-clock ms

const PLOT_TOP = 186      // y for flux = FMAX
const PLOT_BOT = 282      // y for flux = FMIN
const FMAX = 1.006
const FMIN = 0.882

// Area of overlap between the stellar disk (radius R) and the planet disk
// (radius r) whose centres are separated by d. This is what makes the light
// curve have ingress, a flat bottom, and egress rather than a sharp notch.
function overlapArea(bigR: number, r: number, d: number): number {
  if (d >= bigR + r) return 0
  if (d <= Math.abs(bigR - r)) return Math.PI * Math.min(bigR, r) ** 2
  const R2 = bigR * bigR
  const r2 = r * r
  const a = Math.acos((d * d + r2 - R2) / (2 * d * r))
  const b = Math.acos((d * d + R2 - r2) / (2 * d * bigR))
  const tri = 0.5 * Math.sqrt(Math.max(0, (-d + r + bigR) * (d + r - bigR) * (d - r + bigR) * (d + r + bigR)))
  return r2 * a + R2 * b - tri
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  ratio: { default: 0.22, min: 0.06, max: 0.3, step: 0.01 },
  impact: { default: 0.15, min: 0, max: 0.95, step: 0.01 },
}

export function TransitMethodAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { phaseRef.current = 0.5; draw(0.5); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('transit-method', SPEC)
  const { ratio, impact } = params
  const [readout, setReadout] = useState({ depth: 0, flux: 1 })

  const planetR = useCallback((rp: number) => rp * R, [])

  // Flux (fraction of the star's light we receive) when the planet centre sits
  // at horizontal position px, for the current planet size and impact parameter.
  const fluxAt = useCallback((px: number, rp: number, b: number) => {
    const r = planetR(rp)
    const py = SY + b * R
    const d = Math.hypot(px - CX, py - SY)
    const blocked = overlapArea(R, r, d)
    return 1 - blocked / (Math.PI * R * R)
  }, [planetR])

  const yOfFlux = (f: number) => PLOT_BOT - ((f - FMIN) / (FMAX - FMIN)) * (PLOT_BOT - PLOT_TOP)

  const draw = useCallback((phase: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rp = ratio
    const b = impact
    const r = planetR(rp)
    const depth = rp * rp
    const px = PATH_L + phase * (PATH_R - PATH_L)
    const py = SY + b * R

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }

    // --- scene: star + planet ---
    const glow = ctx.createRadialGradient(CX, SY, R * 0.4, CX, SY, R + 26)
    glow.addColorStop(0, 'rgba(245,158,11,0.30)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(CX, SY, R + 26, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = '#F59E0B'
    ctx.beginPath(); ctx.arc(CX, SY, R, 0, Math.PI * 2); ctx.fill()

    // planet's transit chord across the disk
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PATH_L, py); ctx.lineTo(PATH_R, py); ctx.stroke()
    ctx.setLineDash([])

    // planet
    ctx.fillStyle = '#818CF8'
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(15,13,10,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke()

    // --- light curve panel ---
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PATH_L, PLOT_TOP - 4); ctx.lineTo(PATH_L, PLOT_BOT); ctx.lineTo(PATH_R, PLOT_BOT)
    ctx.stroke()

    // baseline flux = 1.0
    const yBase = yOfFlux(1)
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(PATH_L, yBase); ctx.lineTo(PATH_R, yBase); ctx.stroke()

    // dashed line at the transit floor, 1 - depth
    const yFloor = yOfFlux(1 - depth)
    ctx.strokeStyle = 'rgba(129,140,248,0.5)'
    ctx.beginPath(); ctx.moveTo(PATH_L, yFloor); ctx.lineTo(PATH_R, yFloor); ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('flux', PATH_L - 2, PLOT_TOP - 8)
    ctx.fillText('1.00', PATH_R - 30, yBase - 4)
    ctx.fillStyle = 'rgba(129,140,248,0.85)'
    ctx.fillText(`δ = ${(depth * 100).toFixed(2)}%`, PATH_R - 74, yFloor + 12)

    // full theoretical curve, faint
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(129,140,248,0.25)'
    ctx.lineWidth = 1.25
    let started = false
    for (let x = PATH_L; x <= PATH_R; x += 3) {
      const y = yOfFlux(fluxAt(x, rp, b))
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // traced portion up to the current position, bright
    ctx.beginPath()
    ctx.strokeStyle = '#22D3EE'
    ctx.lineWidth = 2
    started = false
    for (let x = PATH_L; x <= px; x += 2) {
      const y = yOfFlux(fluxAt(x, rp, b))
      if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // moving readout dot on the curve
    const fNow = fluxAt(px, rp, b)
    ctx.fillStyle = '#22D3EE'
    ctx.beginPath(); ctx.arc(px, yOfFlux(fNow), 3.5, 0, Math.PI * 2); ctx.fill()

    // depth arrow annotation
    ctx.strokeStyle = 'rgba(129,140,248,0.6)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PATH_L + 14, yBase); ctx.lineTo(PATH_L + 14, yFloor); ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('depth', PATH_L + 20, (yBase + yFloor) / 2 + 3)

    setReadout({ depth, flux: fNow })
  }, [ratio, impact, planetR, fluxAt])

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
        <span className="animation-label"><Play size={13} /> Interactive · Reading planet size off the transit dip</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Reading planet size off the transit dip. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Planet size:</span>
          <input
            type="range" min={SPEC.ratio.min} max={SPEC.ratio.max} step={SPEC.ratio.step} value={ratio}
            onChange={ev => { set('ratio', +ev.target.value) }}
            className="w-28 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">R<sub>p</sub>/R<sub>★</sub> = {ratio.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Geometry:</span>
          <input
            type="range" min={SPEC.impact.min} max={SPEC.impact.max} step={SPEC.impact.step} value={impact}
            onChange={ev => { set('impact', +ev.target.value) }}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">b = {impact.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          depth = <strong className="text-accent-gold">{(readout.depth * 100).toFixed(2)}%</strong>
        </span>
      </div>
    </div>
  )
}
