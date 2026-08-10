'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const LEFT = 60
const RIGHT = 560
const AXIS_Y = 262
const LOG_MAX = 10  // 10^10 pc ≈ 14 Gpc, roughly the observable horizon (axis runs from 10^0 = 1 pc)
const PLOT_W = RIGHT - LEFT

const PERIOD_MS = 5200 // one calibration pulse from bottom rung to top

// x-position for a distance given in parsecs, on the log axis.
const xOf = (dpc: number) => LEFT + (Math.log10(dpc) / LOG_MAX) * PLOT_W

// The rungs, near (bottom) to far (top). Ranges in parsecs, deliberately
// overlapping: each method is calibrated on the one below where they share reach.
// intrinsic = the method's own added fractional uncertainty per rung.
type Rung = { name: string; note: string; dmin: number; dmax: number; color: string; y: number; intrinsic: number }
const RUNGS: Rung[] = [
  { name: 'Redshift · Hubble law', note: 'to the observable horizon', dmin: 3e7, dmax: 1.4e10, color: '#A78BFA', y: 70, intrinsic: 0.03 },
  { name: 'Type Ia supernovae', note: 'standard candles, ~3 Gpc', dmin: 1e6, dmax: 3e9, color: '#60A5FA', y: 118, intrinsic: 0.04 },
  { name: 'Cepheid variables', note: 'period–luminosity, ~30 Mpc', dmin: 3e2, dmax: 3e7, color: '#F59E0B', y: 166, intrinsic: 0.03 },
  { name: 'Trigonometric parallax', note: 'pure geometry, Gaia to ~10 kpc', dmin: 1, dmax: 3e4, color: '#818CF8', y: 214, intrinsic: 0.02 },
]

// Cumulative fractional uncertainty, bottom rung to top: each rung inherits
// everything below it and adds its own — this is why errors compound upward.
function cumulativeErrors(baseErr: number): number[] {
  const out: number[] = []
  let acc = Math.abs(baseErr)
  // walk from the bottom rung (last in array) up to the top (first)
  for (let i = RUNGS.length - 1; i >= 0; i--) {
    acc += RUNGS[i].intrinsic
    out[i] = acc
  }
  return out
}

// Tick labels along the axis.
const TICKS: { dpc: number; label: string }[] = [
  { dpc: 1, label: '1 pc' },
  { dpc: 1e3, label: '1 kpc' },
  { dpc: 1e6, label: '1 Mpc' },
  { dpc: 1e9, label: '1 Gpc' },
  { dpc: 1e10, label: '10 Gpc' },
]

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  baseErr: { default: 0, min: -0.08, max: 0.08, step: 0.01 },
}

export function DistanceLadderAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { pulseRef.current = 1; draw(1); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const pulseRef = useRef(0) // 0..1 position of the calibration pulse climbing the ladder
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('distance-ladder', SPEC)
  const { baseErr } = params

  const draw = useCallback((pulse: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const errs = cumulativeErrors(baseErr)

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    // title
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('Each rung is calibrated by the one below it, on the range where they overlap', 16, 20)

    // axis
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(LEFT, AXIS_Y); ctx.lineTo(RIGHT, AXIS_Y); ctx.stroke()
    for (const t of TICKS) {
      const x = xOf(t.dpc)
      ctx.strokeStyle = 'rgba(255,245,235,0.06)'
      ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, AXIS_Y); ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(t.label, x - 14, AXIS_Y + 15)
    }
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('log distance →', RIGHT - 78, AXIS_Y + 15)

    // which rung the pulse is currently lighting up (bottom→top over the pulse cycle)
    const activeIdx = RUNGS.length - 1 - Math.min(RUNGS.length - 1, Math.floor(pulse * RUNGS.length))

    // overlap connectors between adjacent rungs (drawn first, behind bars)
    for (let i = 0; i < RUNGS.length - 1; i++) {
      const upper = RUNGS[i]
      const lower = RUNGS[i + 1]
      const ox1 = xOf(Math.max(upper.dmin, lower.dmin))
      const ox2 = xOf(Math.min(upper.dmax, lower.dmax))
      if (ox2 > ox1) {
        ctx.fillStyle = 'rgba(245,240,232,0.05)'
        ctx.fillRect(ox1, upper.y - 2, ox2 - ox1, lower.y - upper.y + 4)
        ctx.fillStyle = 'rgba(245,240,232,0.4)'
        ctx.fillText('calibrates', (ox1 + ox2) / 2 - 24, (upper.y + lower.y) / 2 + 3)
      }
    }

    // rung bars
    RUNGS.forEach((r, i) => {
      const x1 = xOf(r.dmin)
      const x2 = xOf(r.dmax)
      const active = i === activeIdx
      // bar
      ctx.fillStyle = active ? r.color : `${r.color}66`
      const barH = 16
      const by = r.y - barH / 2
      ctx.beginPath()
      const rad = 5
      ctx.moveTo(x1 + rad, by)
      ctx.arcTo(x2, by, x2, by + barH, rad)
      ctx.arcTo(x2, by + barH, x1, by + barH, rad)
      ctx.arcTo(x1, by + barH, x1, by, rad)
      ctx.arcTo(x1, by, x2, by, rad)
      ctx.closePath(); ctx.fill()

      // label
      ctx.fillStyle = active ? '#F5F0E8' : 'rgba(245,240,232,0.75)'
      ctx.font = '11px monospace'
      ctx.fillText(r.name, x1, by - 5)
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(r.note, x1, by + barH + 11)
      ctx.font = '10px monospace'

      // compounded-uncertainty whisker at the far end of the bar
      const uw = Math.min(70, errs[i] * 260)
      ctx.strokeStyle = baseErr !== 0 ? '#F472B6' : 'rgba(244,114,182,0.5)'
      ctx.lineWidth = 1.25
      ctx.beginPath(); ctx.moveTo(x2 - uw, r.y); ctx.lineTo(x2 + uw, r.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x2 - uw, r.y - 3); ctx.lineTo(x2 - uw, r.y + 3); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x2 + uw, r.y - 3); ctx.lineTo(x2 + uw, r.y + 3); ctx.stroke()
      ctx.fillStyle = baseErr !== 0 ? '#F472B6' : 'rgba(244,114,182,0.6)'
      ctx.fillText(`±${(errs[i] * 100).toFixed(0)}%`, x2 + uw + 4, r.y + 3)
    })

    // inferred H0 at the top: a distance scale inflated by (1+baseErr) deflates H0 = v/d
    const h0 = 70 / (1 + baseErr)
    ctx.font = '11px monospace'
    ctx.fillStyle = baseErr !== 0 ? '#F472B6' : 'rgba(245,240,232,0.6)'
    ctx.fillText(`inferred H₀ ≈ ${h0.toFixed(1)} km/s/Mpc`, LEFT, 40)
  }, [baseErr])

  useEffect(() => { draw(pulseRef.current) }, [draw])

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
      pulseRef.current = (pulseRef.current + dt / PERIOD_MS) % 1
      draw(pulseRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    pulseRef.current = 0
    lastRef.current = null
    set('baseErr', 0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Reach of the ladder, and how errors climb it</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-indigo text-bg-base text-xs font-medium hover:bg-accent-indigo/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Error at base rung:</span>
          <input
            type="range" min={SPEC.baseErr.min} max={SPEC.baseErr.max} step={SPEC.baseErr.step} value={baseErr}
            onChange={ev => { set('baseErr', +ev.target.value) }}
            className="w-32 accent-accent-indigo"
          />
          <span className="text-text-secondary font-medium">{(baseErr * 100).toFixed(0)}%</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          a base error propagates <strong className="text-accent-pink">all the way up</strong>
        </span>
      </div>
    </div>
  )
}
