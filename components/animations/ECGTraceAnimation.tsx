'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'

const W = 600
const H = 260
const BASELINE = H * 0.62 // pixel y of the flat trace
const AMP = 70 // overall vertical scale of the waveform
const PX_PER_SEC = 160 // horizontal scroll speed of the trace

// One beat as a function of phase (0..1) -> normalized deflection (baseline = 0).
// Positive values draw upward on screen. Composes P, QRS and T over a flat baseline.
function beat(phase: number): number {
  let v = 0
  // P wave: small rounded bump
  if (phase >= 0.1 && phase <= 0.2) {
    v += 0.18 * Math.sin(((phase - 0.1) / 0.1) * Math.PI)
  }
  // QRS complex: small Q dip, tall R spike, S dip
  if (phase >= 0.26 && phase < 0.3) {
    v -= 0.12 * Math.sin(((phase - 0.26) / 0.04) * Math.PI) // Q
  } else if (phase >= 0.3 && phase < 0.34) {
    v += 1.0 * Math.sin(((phase - 0.3) / 0.04) * Math.PI) // R
  } else if (phase >= 0.34 && phase < 0.38) {
    v -= 0.22 * Math.sin(((phase - 0.34) / 0.04) * Math.PI) // S
  }
  // T wave: broad rounded bump
  if (phase >= 0.46 && phase <= 0.62) {
    v += 0.3 * Math.sin(((phase - 0.46) / 0.16) * Math.PI)
  }
  return v
}

// y pixel for a given absolute time (seconds) and beat interval (seconds).
function yAt(t: number, interval: number): number {
  const phase = ((t % interval) + interval) % interval / interval
  return BASELINE - beat(phase) * AMP
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  bpm: { default: 72, min: 40, max: 180 },
}

export function ECGTraceAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setReducedStatic(true); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { params, set } = useWidgetParams('e-c-g-trace', SPEC)
  const { bpm } = params
  const [running, setRunning] = useState(false)
  const [reducedStatic, setReducedStatic] = useState(false)
  const offsetRef = useRef(0) // elapsed time in seconds scrolled
  const bpmRef = useRef(bpm)
  useEffect(() => { bpmRef.current = bpm })

  const drawTrace = useCallback((offset: number, interval: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // grid
    ctx.strokeStyle = 'rgba(244,114,182,0.07)'
    ctx.lineWidth = 1
    for (let gx = 0; gx <= W; gx += 24) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
    }
    for (let gy = 0; gy <= H; gy += 24) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
    }

    // waveform: rightmost pixel is "now" (offset), trace scrolls left as offset grows
    ctx.strokeStyle = '#F472B6'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let px = 0; px <= W; px++) {
      // time represented by this pixel: newest data on the right
      const t = offset - (W - px) / PX_PER_SEC
      const yy = yAt(t, interval)
      if (px === 0) ctx.moveTo(px, yy)
      else ctx.lineTo(px, yy)
    }
    ctx.stroke()

    // P / QRS / T labels anchored to the most recent complete beat on screen
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    const beatStart = Math.floor(offset / interval) * interval // start time of current beat
    const labelAt = (phase: number, text: string, dy: number) => {
      const t = beatStart - interval + phase // previous beat for full visibility
      const px = W - (offset - t) * PX_PER_SEC
      if (px < 16 || px > W - 16) return
      ctx.fillStyle = 'rgba(245,240,232,0.6)'
      ctx.fillText(text, px, yAt(t, interval) + dy)
    }
    labelAt(0.15, 'P', -14)
    labelAt(0.32, 'QRS', -10)
    labelAt(0.54, 'T', -14)
  }, [])

  // static (reduced-motion) render: two labeled beats, no animation
  useEffect(() => {
    if (!reducedStatic) return
    const interval = 60 / bpmRef.current
    // park two beats centered on screen
    drawTrace(interval * 1.5, interval)
  }, [reducedStatic, drawTrace, bpm])

  // animated scroll
  useEffect(() => {
    if (!running || reducedStatic) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      offsetRef.current += dt
      drawTrace(offsetRef.current, 60 / bpmRef.current)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [running, reducedStatic, drawTrace])

  // keep a frame painted when paused / on bpm change while idle
  useEffect(() => {
    if (running || reducedStatic) return
    drawTrace(offsetRef.current, 60 / bpm)
  }, [running, reducedStatic, bpm, drawTrace])

  const reset = () => {
    triggerReset()
    setRunning(false)
    setReducedStatic(false)
    offsetRef.current = 0
    drawTrace(0, 60 / bpmRef.current)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · ECG Waveform</span>
        <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary transition-colors">Reset</button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { setReducedStatic(false); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Heart rate:</span>
          <input
            type="range" min={SPEC.bpm.min} max={SPEC.bpm.max} value={bpm}
            onChange={e => set('bpm', +e.target.value)}
            className="w-40 accent-accent-pink"
          />
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          <strong className="text-accent-pink">{bpm}</strong> BPM
        </span>
      </div>
    </div>
  )
}
