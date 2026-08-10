'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const CANVAS_W = 600
const CANVAS_H = 220
const CIRCLE_CX = 100
const CIRCLE_CY = 110
const TRACE_START = 220
const MAX_TRACE = CANVAS_W - TRACE_START - 10

type HarmonicMode = 'single' | 'square'

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  freq: { default: 1, min: 0.5, max: 4, step: 0.5 },
  amp: { default: 0.65, min: 0.2, max: 1, step: 0.1 },
}

export function FourierPhasesAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const angleRef = useRef(0)
  const traceRef = useRef<number[]>([])

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('fourier-phases', SPEC)
  const { freq, amp } = params
  const [mode, setMode] = useState<HarmonicMode>('single')

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    const radius = amp * 80
    const angle = angleRef.current

    const harmonics: { r: number; f: number; color: string }[] =
      mode === 'square'
        ? [
            { r: radius, f: freq, color: '#F59E0B' },
            { r: radius / 3, f: freq * 3, color: '#A78BFA' },
            { r: radius / 5, f: freq * 5, color: '#10B981' },
          ]
        : [{ r: radius, f: freq, color: '#F59E0B' }]

    // Draw phasor circles and arrows
    let cx = CIRCLE_CX
    let cy = CIRCLE_CY
    let tipX = cx
    let tipY = cy

    for (const h of harmonics) {
      const theta = angle * h.f
      const nextX = cx + h.r * Math.cos(theta)
      const nextY = cy + h.r * Math.sin(theta)

      // Circle outline
      ctx.beginPath()
      ctx.arc(cx, cy, h.r, 0, Math.PI * 2)
      ctx.strokeStyle = `${h.color}30`
      ctx.lineWidth = 1
      ctx.stroke()

      // Phasor arrow
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(nextX, nextY)
      ctx.strokeStyle = h.color
      ctx.lineWidth = 2
      ctx.stroke()

      // Arrow head
      const arrowAngle = Math.atan2(nextY - cy, nextX - cx)
      ctx.beginPath()
      ctx.moveTo(nextX, nextY)
      ctx.lineTo(nextX - 8 * Math.cos(arrowAngle - 0.4), nextY - 8 * Math.sin(arrowAngle - 0.4))
      ctx.lineTo(nextX - 8 * Math.cos(arrowAngle + 0.4), nextY - 8 * Math.sin(arrowAngle + 0.4))
      ctx.closePath()
      ctx.fillStyle = h.color
      ctx.fill()

      cx = nextX
      cy = nextY
      tipX = nextX
      tipY = nextY
    }

    // Connector dashed line from tip to trace
    const traceY = tipY
    traceRef.current = [traceY, ...traceRef.current].slice(0, MAX_TRACE)

    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(245,158,11,0.25)'
    ctx.lineWidth = 1
    ctx.moveTo(tipX, traceY)
    ctx.lineTo(TRACE_START, traceY)
    ctx.stroke()
    ctx.setLineDash([])

    // Dot at phasor tip
    ctx.beginPath()
    ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#F59E0B'
    ctx.fill()

    // Draw trace
    const pts = traceRef.current
    if (pts.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = '#F5F0E8'
      ctx.lineWidth = 1.5
      pts.forEach((y, i) => {
        const x = TRACE_START + i
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    // Vertical separator
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,245,235,0.06)'
    ctx.lineWidth = 1
    ctx.moveTo(TRACE_START - 8, 10)
    ctx.lineTo(TRACE_START - 8, CANVAS_H - 10)
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(CIRCLE_CX, CIRCLE_CY, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fill()
  }, [freq, amp, mode])

  useEffect(() => {
    drawFrame()
  }, [drawFrame])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    let last = 0
    const loop = (ts: number) => {
      if (ts - last > 16) {
        angleRef.current += 0.03 * freq
        drawFrame()
        last = ts
      }
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, freq, drawFrame])

  useEffect(() => {
    if (triggered && !running) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    angleRef.current = 0
    traceRef.current = []
    drawFrame()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Phasor Visualization</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: CANVAS_H + 20 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['single', 'square'] as HarmonicMode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); angleRef.current = 0; traceRef.current = [] }}
              className={`px-3 py-1.5 transition-colors capitalize ${mode === m ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}
            >
              {m === 'single' ? 'Single' : '3 Harmonics'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Freq:</span>
          <input type="range" min={SPEC.freq.min} max={SPEC.freq.max} step={SPEC.freq.step} value={freq}
            onChange={e => { set('freq', +e.target.value); traceRef.current = [] }}
            className="w-20 accent-accent-gold"
          />
          <span>{freq}×</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Amp:</span>
          <input type="range" min={SPEC.amp.min} max={SPEC.amp.max} step={SPEC.amp.step} value={amp}
            onChange={e => { set('amp', +e.target.value); traceRef.current = [] }}
            className="w-20 accent-accent-gold"
          />
          <span>{amp.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}
