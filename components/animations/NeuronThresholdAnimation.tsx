'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Zap, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 260
const RESTING = -70   // mV
const THRESHOLD = -55 // mV
const PEAK = 40       // mV
const HYPER = -80     // mV
const STIM_THRESHOLD = 50 // arbitrary stimulus units to fire

const Y_TOP = 22
const Y_BOTTOM = H - 36
const V_MIN = -90
const V_MAX = 50

type Outcome = 'idle' | 'fired' | 'subthreshold'

function mvToY(mv: number): number {
  return Y_TOP + (1 - (mv - V_MIN) / (V_MAX - V_MIN)) * (Y_BOTTOM - Y_TOP)
}

// Fixed action-potential shape, identical regardless of how far above threshold.
// p in [0, 1] across the spike.
function spikeMv(p: number): number {
  if (p < 0.08) return RESTING
  if (p < 0.22) {
    const t = (p - 0.08) / 0.14
    return RESTING + (PEAK - RESTING) * t
  }
  if (p < 0.45) {
    const t = (p - 0.22) / 0.23
    return PEAK - (PEAK - HYPER) * t
  }
  if (p < 0.75) {
    const t = (p - 0.45) / 0.3
    return HYPER + (RESTING - HYPER) * t
  }
  return RESTING
}

// Small passive depolarization bump that decays back to rest (never reaches threshold).
function bumpMv(p: number, stimulus: number): number {
  const peak = RESTING + (THRESHOLD - RESTING - 3) * (stimulus / STIM_THRESHOLD)
  // rise then exponential decay
  const rise = Math.min(p / 0.15, 1)
  const decay = p < 0.15 ? 1 : Math.exp(-(p - 0.15) * 5)
  return RESTING + (peak - RESTING) * rise * decay
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  stimulus: { default: 70, min: 0, max: 100 },
}

export function NeuronThresholdAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      set('stimulus', 70)
      if (reduced) {
        setOutcome('fired')
        setProgress(1)
        return
      }
      setOutcome('fired')
      setProgress(0)
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('neuron-threshold', SPEC)
  const { stimulus } = params
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const [progress, setProgress] = useState(1)
  const [running, setRunning] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const plotLeft = 50
    const plotRight = W - 12

    // Reference lines
    const lines = [
      { mv: PEAK, label: `+${PEAK} mV`, color: 'rgba(245,158,11,0.25)' },
      { mv: THRESHOLD, label: `${THRESHOLD} mV (threshold)`, color: 'rgba(244,114,182,0.6)', dashed: true },
      { mv: RESTING, label: `${RESTING} mV (rest)`, color: 'rgba(96,165,250,0.25)' },
      { mv: HYPER, label: `${HYPER} mV`, color: 'rgba(167,139,250,0.2)' },
    ]
    ctx.font = '9px monospace'
    for (const line of lines) {
      const y = mvToY(line.mv)
      ctx.beginPath()
      ctx.strokeStyle = line.color
      ctx.setLineDash(line.dashed ? [5, 4] : [4, 4])
      ctx.lineWidth = line.dashed ? 1.5 : 1
      ctx.moveTo(plotLeft, y)
      ctx.lineTo(plotRight, y)
      ctx.stroke()
      ctx.fillStyle = line.color.replace(/0\.\d+/, '0.75')
      ctx.fillText(line.label, 2, y + 4)
    }
    ctx.setLineDash([])

    // Trace
    const span = plotRight - plotLeft
    const fn = outcome === 'fired' ? spikeMv : outcome === 'subthreshold' ? (p: number) => bumpMv(p, stimulus) : null

    ctx.lineWidth = 2.5
    ctx.strokeStyle = outcome === 'fired' ? '#F472B6' : outcome === 'subthreshold' ? '#60A5FA' : 'rgba(96,165,250,0.5)'
    ctx.beginPath()
    if (!fn) {
      // flat resting line
      const y = mvToY(RESTING)
      ctx.moveTo(plotLeft, y)
      ctx.lineTo(plotRight, y)
    } else {
      const SAMPLES = 240
      const last = Math.max(1, Math.floor(SAMPLES * progress))
      for (let i = 0; i <= last; i++) {
        const p = i / SAMPLES
        const x = plotLeft + p * span
        const y = mvToY(fn(p))
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      // flat rest line ahead of the sweep
      if (progress < 1) {
        const x = plotLeft + progress * span
        ctx.lineTo(x, mvToY(RESTING))
        ctx.lineTo(plotRight, mvToY(RESTING))
      }
    }
    ctx.stroke()

    // Sweeping leading dot
    if (fn && progress < 1) {
      const x = plotLeft + progress * span
      const y = mvToY(fn(progress))
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = outcome === 'fired' ? '#F472B6' : '#60A5FA'
      ctx.fill()
    }

    // axis hint
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '10px monospace'
    ctx.fillText('membrane potential vs. time →', plotLeft + 2, H - 8)
  }, [outcome, progress, stimulus])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setProgress(prev => {
        const next = prev + 0.012
        if (next >= 1) { setRunning(false); return 1 }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const stimulate = () => {
    const fired = stimulus >= STIM_THRESHOLD
    setOutcome(fired ? 'fired' : 'subthreshold')
    setProgress(0)
    setRunning(true)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setOutcome('idle')
    setProgress(1)
    set('stimulus', 70)
  }

  const willFire = stimulus >= STIM_THRESHOLD

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · All-or-Nothing Law</span>
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
          onClick={stimulate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          <Zap size={12} /> Stimulate
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Stimulus:</span>
          <input
            type="range" min={SPEC.stimulus.min} max={SPEC.stimulus.max} value={stimulus}
            onChange={e => set('stimulus', +e.target.value)}
            className="w-32 accent-accent-pink"
          />
          <span className="text-text-secondary font-medium">{stimulus}</span>
          <span className={willFire ? 'text-accent-pink' : 'text-text-muted'}>
            {willFire ? '≥ threshold' : '< threshold'}
          </span>
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={
            outcome === 'fired'
              ? { color: '#F472B6', borderColor: '#F472B630', background: '#F472B610' }
              : outcome === 'subthreshold'
              ? { color: '#60A5FA', borderColor: '#60A5FA30', background: '#60A5FA10' }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          {outcome === 'fired' ? 'FIRED — full spike' : outcome === 'subthreshold' ? 'No spike — passive bump' : 'Awaiting stimulus'}
        </span>
        <span className="ml-auto text-xs text-text-secondary max-w-[260px]">
          Above threshold, a bigger stimulus does <strong className="text-accent-pink">not</strong> make a bigger spike.
        </span>
      </div>
    </div>
  )
}
