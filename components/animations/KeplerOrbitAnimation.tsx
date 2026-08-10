'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300
const CX = 300
const CY = 150
const SEGMENTS = 8          // equal-time wedges per orbit
const PERIOD_MS = 9000      // one orbit in wall-clock ms

// Solve Kepler's equation M = E - e sin E for the eccentric anomaly E.
function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - M
    const fp = 1 - e * Math.cos(E)
    const d = f / fp
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  ecc: { default: 0.4, min: 0, max: 0.75, step: 0.01 },
}

export function KeplerOrbitAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const phaseRef = useRef(0)          // orbital phase in [0, 1)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('kepler-orbit', SPEC)
  const { ecc } = params
  const [readout, setReadout] = useState({ r: 1, v: 1 })

  // Semi-major axis in pixels. Chosen so the semi-minor axis stays pinned at
  // 128px (and the whole ellipse stays inside the 600x300 canvas) for every e
  // the slider allows: a ranges 128px at e=0 to ~194px at e=0.75.
  const semiMajor = useCallback((e: number) => Math.min(215, 128 / Math.sqrt(1 - e * e)), [])

  const draw = useCallback((phase: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const e = ecc
    const a = semiMajor(e)
    const b = a * Math.sqrt(1 - e * e)
    const focusX = CX + a * e   // star sits at the focus, orbit centred on CX

    // Position on the ellipse for a given orbital phase (fraction of period).
    const at = (p: number) => {
      const M = 2 * Math.PI * (p - Math.floor(p))
      const E = eccentricAnomaly(M, e)
      return { x: CX + a * Math.cos(E), y: CY + b * Math.sin(E), E }
    }

    ctx.clearRect(0, 0, W, H)

    // Faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // Equal-time wedges swept from the focus
    for (let k = 0; k < SEGMENTS; k++) {
      const start = k / SEGMENTS
      const end = (k + 1) / SEGMENTS
      if (phase <= start) continue
      const stop = Math.min(phase, end)
      ctx.beginPath()
      ctx.moveTo(focusX, CY)
      const steps = 36
      for (let i = 0; i <= steps; i++) {
        const p = start + ((stop - start) * i) / steps
        const q = at(p)
        ctx.lineTo(q.x, q.y)
      }
      ctx.closePath()
      ctx.fillStyle = k % 2 === 0 ? 'rgba(167,139,250,0.30)' : 'rgba(96,165,250,0.24)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,245,235,0.16)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Orbit path
    ctx.beginPath()
    ctx.ellipse(CX, CY, a, b, 0, 0, Math.PI * 2)
    ctx.strokeStyle = '#10B981'
    ctx.lineWidth = 2
    ctx.stroke()

    // Major axis + centre marker
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.moveTo(CX - a, CY); ctx.lineTo(CX + a, CY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(CX, CY, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fill()

    // Star at the focus
    const glow = ctx.createRadialGradient(focusX, CY, 2, focusX, CY, 22)
    glow.addColorStop(0, 'rgba(245,158,11,0.55)')
    glow.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(focusX, CY, 22, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(focusX, CY, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    // Planet + radius vector
    const pos = at(phase)
    ctx.beginPath()
    ctx.moveTo(focusX, CY); ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = 'rgba(245,240,232,0.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#60A5FA'
    ctx.fill()

    // Apsides
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(244,114,182,0.85)'
    ctx.beginPath(); ctx.arc(CX + a, CY, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillText('perihelion', CX + a - 62, CY - 10)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.beginPath(); ctx.arc(CX - a, CY, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillText('aphelion', CX - a + 8, CY - 10)

    // Legend
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`each shaded wedge = ${(100 / SEGMENTS).toFixed(1)}% of one period`, 14, H - 14)

    // Readout: r/a and speed relative to a circular orbit of the same a.
    const rNorm = 1 - e * Math.cos(pos.E)
    setReadout({ r: rNorm, v: Math.sqrt(Math.max(0, 2 / rNorm - 1)) })
  }, [ecc, semiMajor])

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
        <span className="animation-label"><Play size={13} /> Interactive · Equal areas in equal times</span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Eccentricity:</span>
          <input
            type="range" min={SPEC.ecc.min} max={SPEC.ecc.max} step={SPEC.ecc.step} value={ecc}
            onChange={ev => { set('ecc', +ev.target.value); phaseRef.current = 0; lastRef.current = null }}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-medium">e = {ecc.toFixed(2)}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          r = <strong className="text-accent-gold">{readout.r.toFixed(2)}a</strong>
          {'  ·  '}
          speed = <strong className="text-accent-gold">{readout.v.toFixed(2)}×</strong> circular
        </span>
      </div>
    </div>
  )
}
