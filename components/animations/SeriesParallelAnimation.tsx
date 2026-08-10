'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

const V = 6 // battery volts
const R = 60 // ohms per bulb
const GAP = 32 // spacing between charge dots
const SPEED = 0.5

type Mode = 'series' | 'parallel'
type Pt = [number, number]

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

// Walk a polyline; wrap distance so dots recycle continuously.
function pointOn(pts: Pt[], segs: number[], len: number, d: number): { x: number; y: number } {
  let rest = ((d % len) + len) % len
  for (let i = 0; i < segs.length; i++) {
    if (rest <= segs[i]) {
      const t = rest / segs[i]
      const a = pts[i]
      const b = pts[i + 1]
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }
    }
    rest -= segs[i]
  }
  const last = pts[pts.length - 1]
  return { x: last[0], y: last[1] }
}

function segsOf(pts: Pt[]): { segs: number[]; len: number } {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  return { segs, len: segs.reduce((a, b) => a + b, 0) }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  n: { default: 2, min: 1, max: 4, step: 1 },
}

export function SeriesParallelAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const offsetRef = useRef(0)

  const [mode, setMode] = useState<Mode>('series')
  const { params, set, permalink, isDefault, restored } = useWidgetParams('series-parallel', SPEC)
  const { n } = params
  const [running, setRunning] = useState(false)

  const modeRef = useRef<Mode>('series')
  const nRef = useRef(2)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    nRef.current = n
  }, [n])

  const drawBattery = useCallback((ctx: CanvasRenderingContext2D, x: number, cy: number) => {
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(x - 16, cy - 20, 32, 40)
    ctx.strokeStyle = 'rgba(245,240,232,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - 14, cy - 10)
    ctx.lineTo(x + 14, cy - 10)
    ctx.moveTo(x - 7, cy + 10)
    ctx.lineTo(x + 7, cy + 10)
    ctx.stroke()
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('+', x + 18, cy - 6)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('−', x + 18, cy + 14)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`${V} V`, x - 10, cy + 34)
  }, [])

  const drawBulb = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, bright: number) => {
      ctx.beginPath()
      ctx.arc(x, y, 8 + 14 * bright, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(245,158,11,${0.04 + 0.22 * bright})`
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(245,158,11,${0.14 + 0.82 * bright})`
      ctx.fill()
      ctx.strokeStyle = 'rgba(245,240,232,0.5)'
      ctx.lineWidth = 1.3
      ctx.stroke()
    },
    []
  )

  const drawDots = useCallback((ctx: CanvasRenderingContext2D, pts: Pt[], rel: number) => {
    const { segs, len } = segsOf(pts)
    const count = Math.max(2, Math.floor(len / GAP))
    for (let i = 0; i < count; i++) {
      const p = pointOn(pts, segs, len, i * GAP + offsetRef.current * rel * SPEED)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = BLUE
      ctx.fill()
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const m = modeRef.current
    const count = nRef.current

    ctx.clearRect(0, 0, W, H)

    const wire = (pts: Pt[]) => {
      ctx.strokeStyle = 'rgba(245,240,232,0.35)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
    }

    let totalI: number
    let totalR: number

    if (m === 'series') {
      totalR = count * R
      totalI = V / totalR
      const bright = 1 / (count * count) // per-bulb power / single-bulb power
      const cy = 135
      const loop: Pt[] = [
        [90, 70],
        [520, 70],
        [520, 200],
        [90, 200],
        [90, 70],
      ]
      wire(loop)
      drawBattery(ctx, 90, cy)
      // charge dots on the whole loop — one current, everywhere the same
      drawDots(ctx, loop, count > 0 ? 1 / count : 1)
      // bulbs strung along the top wire
      for (let i = 0; i < count; i++) {
        const x = 160 + ((450 - 160) * (i + 0.5)) / count
        drawBulb(ctx, x, 70, bright)
      }
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('one loop · same current through every bulb · resistances add', 150, 224)
    } else {
      totalR = R / count
      totalI = V / totalR
      const bright = 1 // each branch sees the full battery voltage
      const LR = 170 // left rail x
      const RR = 460 // right rail x
      const bx = 70 // battery rail x
      const cy = 135
      // trunk + rails
      wire([
        [bx, 70],
        [LR, 70],
      ])
      wire([
        [LR, 70],
        [LR, 200],
      ])
      wire([
        [RR, 70],
        [RR, 200],
      ])
      wire([
        [RR, 200],
        [bx, 200],
      ])
      wire([
        [bx, 70],
        [bx, 200],
      ])
      drawBattery(ctx, bx, cy)
      // trunk + rails carry the summed current (n units)
      drawDots(ctx, [[bx, 70], [LR, 70]], count)
      drawDots(ctx, [[LR, 70], [LR, 200]], count)
      drawDots(ctx, [[RR, 70], [RR, 200]], count)
      drawDots(ctx, [[RR, 200], [bx, 200]], count)
      // one branch per bulb, each carrying the same full-voltage current (1 unit)
      for (let i = 0; i < count; i++) {
        const y = 70 + ((200 - 70) * (i + 1)) / (count + 1)
        const branch: Pt[] = [
          [LR, y],
          [RR, y],
        ]
        wire(branch)
        drawDots(ctx, branch, 1)
        drawBulb(ctx, (LR + RR) / 2, y, bright)
      }
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText('every branch gets the full 6 V · branch currents add · total R drops', 150, 224)
    }

    // --- Readout panel -----------------------------------------------------
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = m === 'series' ? GREEN : VIOLET
    ctx.fillText(m === 'series' ? 'SERIES' : 'PARALLEL', 26, 30)
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.75)'
    ctx.fillText(`${count} bulb${count > 1 ? 's' : ''} · ${R} Ω each`, 26, 50)
    ctx.fillStyle = GREEN
    ctx.fillText(`total R = ${Math.round(totalR)} Ω`, 26, 250)
    ctx.fillStyle = GOLD
    ctx.fillText(`source current = ${(totalI * 1000).toFixed(0)} mA`, 200, 250)
    ctx.fillStyle = PINK
    ctx.fillText(
      m === 'series' ? `each bulb: ${Math.round(100 / (count * count))}% bright` : 'each bulb: 100% bright',
      400,
      250
    )
  }, [drawBattery, drawBulb, drawDots])

  const step = useCallback(() => {
    offsetRef.current += 2.4
  }, [])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) draw()
      else setRunning(true)
    },
  })

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      step()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, step, draw])

  useEffect(() => {
    if (!running) draw()
  }, [mode, n, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    setMode('series')
    set('n', 2)
    modeRef.current = 'series'
    nRef.current = 2
    offsetRef.current = 0
    draw()
  }

  const totalR = mode === 'series' ? n * R : R / n
  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Series vs. parallel
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
      <div className="animation-canvas">
        <canvas
          role="img"
          aria-label="Animated diagram: Series vs. parallel. Values are reported below the diagram."
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: 'var(--color-canvas)' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-bg-base transition-colors"
          style={{ background: GREEN }}
        >
          {running ? (
            <>
              <Pause size={12} /> Pause
            </>
          ) : (
            <>
              <Play size={12} /> Play
            </>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode('series')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              color: mode === 'series' ? GREEN : 'rgba(245,240,232,0.5)',
              borderColor: mode === 'series' ? `${GREEN}88` : 'rgba(245,240,232,0.15)',
              background: mode === 'series' ? `${GREEN}18` : 'transparent',
            }}
          >
            Series
          </button>
          <button
            onClick={() => setMode('parallel')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{
              color: mode === 'parallel' ? VIOLET : 'rgba(245,240,232,0.5)',
              borderColor: mode === 'parallel' ? `${VIOLET}88` : 'rgba(245,240,232,0.15)',
              background: mode === 'parallel' ? `${VIOLET}18` : 'transparent',
            }}
          >
            Parallel
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Bulbs:</span>
          <input
            type="range"
            min={SPEC.n.min}
            max={SPEC.n.max}
            step={SPEC.n.step}
            value={n}
            onChange={e => set('n', clamp(+e.target.value, 1, 4))}
            className="w-24"
            style={{ accentColor: GREEN }}
          />
          <span className="text-text-secondary font-mono">{n}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs font-mono" style={{ color: GOLD }}>
          total R = {Math.round(totalR)} Ω
        </WidgetStatus>
      </div>
    </div>
  )
}
