'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 260
const PX_PER_SEC = 150 // horizontal scroll speed of the trace
const HR = 72 // fixed heart rate (beats/min) — cardiac output held constant
const INTERVAL = 60 / HR // seconds per beat

// pressure -> y pixel. Map the physiological window [50,150] mmHg to the canvas.
const P_MIN = 50
const P_MAX = 150
const Y_TOP = 26
const Y_BOT = H - 28
const yForP = (p: number) => Y_BOT - ((p - P_MIN) / (P_MAX - P_MIN)) * (Y_BOT - Y_TOP)

const PINK = '#F472B6'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'

const SHAPE_MIN = 0.086 // lowest value the normalized shape reaches (diastole)

// One arterial pulse as a function of phase (0..1) -> normalized 0..1.
// Steep systolic upstroke, ejection decline, dicrotic notch, diastolic runoff.
function pulseShape(phase: number): number {
  if (phase < 0.1) {
    // systolic upstroke from the diastolic floor to the peak
    const t = phase / 0.1
    const s = t * t * (3 - 2 * t) // smoothstep
    return SHAPE_MIN + (1 - SHAPE_MIN) * s
  }
  if (phase < 0.32) {
    // ejection: decline from peak toward the incisura
    const t = (phase - 0.1) / 0.22
    const s = t * t * (3 - 2 * t)
    return 1 - 0.42 * s // 1 -> 0.58
  }
  if (phase < 0.4) {
    // dicrotic notch: a small dip and rebound as the aortic valve closes
    const t = (phase - 0.32) / 0.08
    return 0.58 - 0.08 * Math.sin(t * Math.PI)
  }
  // diastolic runoff: exponential decay back to the floor
  const t = (phase - 0.4) / 0.6
  return 0.58 * Math.exp(-2.44 * t)
}

// pressure (mmHg) at absolute time t, given diastolic & pulse pressure.
function pressureAt(t: number, dbp: number, pp: number): number {
  const phase = (((t % INTERVAL) + INTERVAL) % INTERVAL) / INTERVAL
  const shape = pulseShape(phase)
  const norm = (shape - SHAPE_MIN) / (1 - SHAPE_MIN)
  return dbp + norm * pp
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  compliance: { default: 1, min: 0, max: 1, step: 0.01 },
}

export function BloodPressureAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('blood-pressure', SPEC)
  const { compliance } = params
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const offsetRef = useRef(0) // elapsed seconds scrolled
  const compRef = useRef(compliance)
  useEffect(() => {
    compRef.current = compliance
  })

  // Mean arterial pressure is held fixed; compliance sets the pulse pressure.
  const MAP = 93
  const ppFor = (c: number) => 70 - 30 * c // stiff -> 70, compliant -> 40 mmHg
  const dbpFor = (pp: number) => MAP - pp / 3
  const sbpFor = (dbp: number, pp: number) => dbp + pp

  const pp = ppFor(compliance)
  const dbp = dbpFor(pp)
  const sbp = sbpFor(dbp, pp)

  const drawTrace = useCallback((offset: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const c = compRef.current
    const ppL = 70 - 30 * c
    const dbpL = 93 - ppL / 3
    const sbpL = dbpL + ppL

    ctx.clearRect(0, 0, W, H)

    // faint grid
    ctx.strokeStyle = 'rgba(244,114,182,0.07)'
    ctx.lineWidth = 1
    for (let gx = 0; gx <= W; gx += 24) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = 0; gy <= H; gy += 24) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // reference lines: systolic, mean, diastolic
    const line = (p: number, color: string, label: string) => {
      const y = yForP(p)
      ctx.strokeStyle = color
      ctx.setLineDash([5, 5])
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W - 118, y); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = color
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${label} ${Math.round(p)}`, W - 112, y + 4)
    }
    line(sbpL, BLUE, 'systolic')
    line(93, GOLD, 'mean')
    line(dbpL, VIOLET, 'diastolic')

    // pressure waveform: newest data on the right, scrolling left
    ctx.strokeStyle = PINK
    ctx.lineWidth = 2.25
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let px = 0; px <= W - 120; px++) {
      const t = offset - (W - 120 - px) / PX_PER_SEC
      const yy = yForP(pressureAt(t, dbpL, ppL))
      if (px === 0) ctx.moveTo(px, yy)
      else ctx.lineTo(px, yy)
    }
    ctx.stroke()

    // y-axis unit
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('mmHg', 8, 18)
    ctx.fillText('pulse pressure ' + Math.round(sbpL - dbpL), 8, H - 8)
  }, [])

  // static (reduced-motion) render
  useEffect(() => {
    if (!reducedStatic) return
    drawTrace(INTERVAL * 2.4)
  }, [reducedStatic, drawTrace, compliance])

  // animated scroll
  useEffect(() => {
    if (!running || reducedStatic) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      offsetRef.current += dt
      drawTrace(offsetRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running, reducedStatic, drawTrace])

  // keep a frame painted when paused / on compliance change while idle
  useEffect(() => {
    if (running || reducedStatic) return
    drawTrace(offsetRef.current)
  }, [running, reducedStatic, compliance, drawTrace])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReducedStatic(true); return }
      setRunning(true)
    },
  })

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    offsetRef.current = 0
    set('compliance', 1)
    compRef.current = 1
    drawTrace(0)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Arterial pressure waveform
        </span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Arterial compliance:</span>
          <span className="text-text-secondary">stiff</span>
          <input
            type="range" min={SPEC.compliance.min} max={SPEC.compliance.max} step={SPEC.compliance.step} value={compliance}
            onChange={e => set('compliance', +e.target.value)}
            className="w-40 accent-accent-pink"
          />
          <span className="text-text-secondary">compliant</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          <strong className="text-accent-pink">{Math.round(sbp)}/{Math.round(dbp)}</strong>{' '}
          mmHg · MAP <strong style={{ color: GOLD }}>{Math.round(MAP)}</strong>
        </span>
      </div>
    </div>
  )
}
