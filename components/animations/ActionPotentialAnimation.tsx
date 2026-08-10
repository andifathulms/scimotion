'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 200
const RESTING = -70   // mV
const THRESHOLD = -55 // mV
const PEAK = 40       // mV
const HYPER = -80     // mV

type Phase = 'resting' | 'depolarization' | 'repolarization' | 'hyperpolarization' | 'recovery'

const PHASE_LABELS: Record<Phase, string> = {
  resting: 'Resting (−70 mV)',
  depolarization: 'Depolarization — Na⁺ rushes in',
  repolarization: 'Repolarization — K⁺ flows out',
  hyperpolarization: 'Hyperpolarization (undershoot)',
  recovery: 'Recovery to resting potential',
}

const PHASE_COLORS: Record<Phase, string> = {
  resting: '#60A5FA',
  depolarization: '#F59E0B',
  repolarization: '#10B981',
  hyperpolarization: '#A78BFA',
  recovery: '#F472B6',
}

function mvToY(mv: number): number {
  const range = PEAK - HYPER
  return H - 30 - ((mv - HYPER) / range) * (H - 60)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  speed: { default: 1, min: 0.5, max: 4, step: 0.5 },
}

export function ActionPotentialAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const traceRef = useRef<number[]>([])
  const timeRef = useRef(0)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase>('resting')
  const [voltage, setVoltage] = useState(RESTING)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('action-potential', SPEC)
  const { speed } = params
  const [fired, setFired] = useState(0)

  const getVoltage = (t: number): { v: number; phase: Phase } => {
    const cycle = 180 / speed
    const pos = t % cycle
    const frac = pos / cycle

    if (frac < 0.1) return { v: RESTING, phase: 'resting' }
    if (frac < 0.2) {
      const p = (frac - 0.1) / 0.1
      return { v: RESTING + (PEAK - RESTING) * p, phase: 'depolarization' }
    }
    if (frac < 0.35) {
      const p = (frac - 0.2) / 0.15
      return { v: PEAK - (PEAK - RESTING) * p, phase: 'repolarization' }
    }
    if (frac < 0.45) {
      const p = (frac - 0.35) / 0.1
      return { v: RESTING - (RESTING - HYPER) * Math.sin(p * Math.PI), phase: 'hyperpolarization' }
    }
    if (frac < 0.65) {
      const p = (frac - 0.45) / 0.2
      return { v: HYPER + (RESTING - HYPER) * p, phase: 'recovery' }
    }
    return { v: RESTING, phase: 'resting' }
  }

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)

    // Reference lines
    const lines = [
      { mv: PEAK, label: `+${PEAK} mV`, color: 'rgba(245,158,11,0.25)' },
      { mv: THRESHOLD, label: `${THRESHOLD} mV (threshold)`, color: 'rgba(251,146,60,0.2)' },
      { mv: RESTING, label: `${RESTING} mV (rest)`, color: 'rgba(96,165,250,0.25)' },
      { mv: HYPER, label: `${HYPER} mV`, color: 'rgba(167,139,250,0.2)' },
    ]
    ctx.font = '9px monospace'
    for (const line of lines) {
      const y = mvToY(line.mv)
      ctx.beginPath()
      ctx.strokeStyle = line.color
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.moveTo(50, y); ctx.lineTo(W, y); ctx.stroke()
      ctx.fillStyle = line.color.replace('0.2', '0.7').replace('0.25', '0.7')
      ctx.fillText(line.label, 2, y + 4)
    }
    ctx.setLineDash([])

    // Trace
    const pts = traceRef.current
    if (pts.length > 1) {
      const step = (W - 60) / Math.max(pts.length - 1, 1)
      ctx.beginPath()
      ctx.lineWidth = 2.5
      pts.forEach((v, i) => {
        const x = 55 + i * step
        const y = mvToY(v)
        const { phase: ph } = getVoltage(i * (speed / 2))
        ctx.strokeStyle = PHASE_COLORS[ph]
        if (i === 0) ctx.moveTo(x, y)
        else { ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y) }
      })
    }

    // Threshold crossings (action potential trigger)
    const crossings = pts.reduce((acc, v, i) => {
      if (i > 0 && pts[i - 1] < THRESHOLD && v >= THRESHOLD) acc.push(i)
      return acc
    }, [] as number[])
    const step = (W - 60) / Math.max(pts.length - 1, 1)
    for (const ci of crossings) {
      const x = 55 + ci * step
      ctx.beginPath()
      ctx.arc(x, mvToY(THRESHOLD), 4, 0, Math.PI * 2)
      ctx.fillStyle = '#FB923C'
      ctx.fill()
    }

    // Current voltage dot
    if (pts.length > 0) {
      const lastV = pts[pts.length - 1]
      const x = 55 + (pts.length - 1) * step
      const y = mvToY(lastV)
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = PHASE_COLORS[phase]
      ctx.fill()
    }
  }, [phase, speed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { drawFrame() }, [drawFrame])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }

    const loop = () => {
      timeRef.current += speed * 0.5
      const { v, phase: ph } = getVoltage(timeRef.current)
      traceRef.current = [...traceRef.current, v].slice(-300)
      setVoltage(v)
      setPhase(ph)
      if (ph === 'depolarization' && traceRef.current.length > 2) {
        const prev = traceRef.current[traceRef.current.length - 2]
        if (prev < THRESHOLD && v >= THRESHOLD) setFired(f => f + 1)
      }
      drawFrame()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, speed, drawFrame]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (triggered && !running) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    traceRef.current = []
    timeRef.current = 0
    setVoltage(RESTING)
    setPhase('resting')
    setFired(0)
    drawFrame()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Action Potential</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 20 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Speed:</span>
          <input type="range" min={SPEC.speed.min} max={SPEC.speed.max} step={SPEC.speed.step} value={speed}
            onChange={e => set('speed', +e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span>{speed}×</span>
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: PHASE_COLORS[phase], borderColor: `${PHASE_COLORS[phase]}30`, background: `${PHASE_COLORS[phase]}10` }}
        >
          {PHASE_LABELS[phase]}
        </span>
        <span className="ml-auto text-xs text-text-secondary">
          {voltage.toFixed(0)} mV · <strong className="text-accent-pink">{fired}</strong> action potential{fired !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
