'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, Syringe } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 270
const PLOT_L = 46
const PLOT_R = W - 14
const PLOT_T = 46
const PLOT_B = H - 30

const MAX_DAY = 70
const AUTO_SECOND_DAY = 35
const MIN_GAP = 12          // days that must pass before a re-exposure is allowed
const DAY_PER_FRAME = 0.14

const C_PATHOGEN = '#F59E0B'  // gold
const C_ANTIBODY = '#F472B6'  // pink
const C_MEMORY = '#60A5FA'    // blue
const C_EVENT = '#A78BFA'     // violet

type Exposure = { day: number; index: number }

// Response parameters. Index 0 = naive (primary) response, index >= 1 = primed
// (secondary) response: shorter lag, far larger antibody peak, negligible pathogen load.
type Params = {
  lag: number          // days before antibody output begins
  pathPeak: number     // peak pathogen load (relative units)
  pathPeakDay: number  // days after exposure at which pathogen peaks
  abPeak: number       // antibody scale
  abRise: number       // antibody rise time constant (days)
  abDecay: number      // antibody decay rate (per day)
  memAdd: number       // memory-cell increment
}

const PRIMARY: Params = { lag: 6, pathPeak: 0.85, pathPeakDay: 8, abPeak: 0.42, abRise: 10, abDecay: 0.012, memAdd: 0.38 }
const SECONDARY: Params = { lag: 1.5, pathPeak: 0.07, pathPeakDay: 1.5, abPeak: 1.05, abRise: 2.5, abDecay: 0.010, memAdd: 0.34 }

function paramsFor(index: number): Params {
  return index === 0 ? PRIMARY : SECONDARY
}

// Normalized bump: peaks at exactly 1.0 when x = 1, decays away either side.
function bump(x: number): number {
  if (x <= 0) return 0
  return x * x * Math.exp(2 - 2 * x)
}

function pathogenAt(day: number, exposures: Exposure[]): number {
  let total = 0
  for (const e of exposures) {
    const p = paramsFor(e.index)
    total += p.pathPeak * bump((day - e.day) / p.pathPeakDay)
  }
  return Math.min(1, total)
}

function antibodyAt(day: number, exposures: Exposure[]): number {
  let total = 0
  for (const e of exposures) {
    const p = paramsFor(e.index)
    const u = day - e.day - p.lag
    if (u <= 0) continue
    total += p.abPeak * (1 - Math.exp(-u / p.abRise)) * Math.exp(-p.abDecay * u)
  }
  return Math.min(1, total)
}

function memoryAt(day: number, exposures: Exposure[]): number {
  let total = 0
  for (const e of exposures) {
    const p = paramsFor(e.index)
    const u = day - e.day - p.lag
    if (u <= 0) continue
    total += p.memAdd * (1 - Math.exp(-u / 8)) * Math.exp(-0.002 * u)
  }
  return Math.min(1, total)
}

function xFor(day: number): number {
  return PLOT_L + (day / MAX_DAY) * (PLOT_R - PLOT_L)
}

function yFor(v: number): number {
  return PLOT_B - v * (PLOT_B - PLOT_T)
}

export function ImmuneResponseAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        setExposures([{ day: 3, index: 0 }, { day: AUTO_SECOND_DAY, index: 1 }])
        setDay(MAX_DAY)
        return
      }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [day, setDay] = useState(0)
  const [exposures, setExposures] = useState<Exposure[]>([{ day: 3, index: 0 }])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    // Axes + horizontal gridlines
    ctx.font = '9px monospace'
    for (let i = 0; i <= 4; i++) {
      const y = yFor(i / 4)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.07)'
      ctx.lineWidth = 1
      ctx.moveTo(PLOT_L, y)
      ctx.lineTo(PLOT_R, y)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('high', 6, yFor(1) + 4)
    ctx.fillText('low', 6, yFor(0) + 4)

    // Day ticks
    for (let d = 0; d <= MAX_DAY; d += 10) {
      const x = xFor(d)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PLOT_B)
      ctx.lineTo(x, PLOT_B + 4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.textAlign = 'center'
      ctx.fillText(`${d}`, x, PLOT_B + 15)
      ctx.textAlign = 'left'
    }
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('days since first exposure →', PLOT_L + 2, H - 4)

    // Exposure markers
    for (const e of exposures) {
      if (e.day > day) continue
      const x = xFor(e.day)
      ctx.beginPath()
      ctx.strokeStyle = C_EVENT
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.25
      ctx.moveTo(x, PLOT_T - 8)
      ctx.lineTo(x, PLOT_B)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_EVENT
      ctx.textAlign = 'center'
      ctx.fillText(e.index === 0 ? 'exposure' : 're-exposure', x, PLOT_T - 12)
      ctx.textAlign = 'left'
    }

    // Series
    const series: { color: string; fn: (d: number) => number; width: number }[] = [
      { color: C_MEMORY, fn: d => memoryAt(d, exposures), width: 2 },
      { color: C_PATHOGEN, fn: d => pathogenAt(d, exposures), width: 2.25 },
      { color: C_ANTIBODY, fn: d => antibodyAt(d, exposures), width: 2.5 },
    ]

    for (const s of series) {
      ctx.beginPath()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineJoin = 'round'
      let started = false
      for (let d = 0; d <= day; d += 0.25) {
        const x = xFor(d)
        const y = yFor(s.fn(d))
        if (!started) { ctx.moveTo(x, y); started = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Leading dot
      if (day > 0 && day < MAX_DAY) {
        ctx.beginPath()
        ctx.arc(xFor(day), yFor(s.fn(day)), 3.5, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.fill()
      }
    }

    // Legend
    const legend: [string, string][] = [
      [C_PATHOGEN, 'pathogen load'],
      [C_ANTIBODY, 'antibody titre'],
      [C_MEMORY, 'memory cells'],
    ]
    ctx.font = '10px monospace'
    let lx = PLOT_L
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.moveTo(lx, 16)
      ctx.lineTo(lx + 16, 16)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.65)'
      ctx.fillText(label, lx + 22, 19)
      lx += 26 + ctx.measureText(label).width + 24
    }
  }, [day, exposures])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setDay(prev => {
        const next = prev + DAY_PER_FRAME
        if (next >= MAX_DAY) { setRunning(false); return MAX_DAY }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  // If the reader never triggers one, deliver the second exposure automatically.
  useEffect(() => {
    if (day >= AUTO_SECOND_DAY) {
      setExposures(prev => (prev.length === 1 ? [...prev, { day: AUTO_SECOND_DAY, index: 1 }] : prev))
    }
  }, [day])

  const lastDay = exposures[exposures.length - 1].day
  const canExpose = day >= lastDay + MIN_GAP && day <= MAX_DAY - 18

  const reExpose = () => {
    if (!canExpose) return
    setExposures(prev => [...prev, { day, index: prev.length }])
    setRunning(true)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setDay(0)
    setExposures([{ day: 3, index: 0 }])
  }

  const pathogen = pathogenAt(day, exposures)
  const antibody = antibodyAt(day, exposures)
  const memory = memoryAt(day, exposures)
  const primed = memory > 0.05

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Primary vs Secondary Response</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={reExpose}
          disabled={!canExpose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Syringe size={12} /> Re-expose now
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={
            primed
              ? { color: C_MEMORY, borderColor: `${C_MEMORY}30`, background: `${C_MEMORY}10` }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          {primed ? 'Immunological memory present' : 'Naive — no memory yet'}
        </span>
        <span className="ml-auto text-xs text-text-secondary">
          day <strong className="text-text-primary">{day.toFixed(0)}</strong> ·{' '}
          <span style={{ color: C_PATHOGEN }}>load {(pathogen * 100).toFixed(0)}</span> ·{' '}
          <span style={{ color: C_ANTIBODY }}>titre {(antibody * 100).toFixed(0)}</span> ·{' '}
          <span style={{ color: C_MEMORY }}>memory {(memory * 100).toFixed(0)}</span>
        </span>
      </div>
    </div>
  )
}
