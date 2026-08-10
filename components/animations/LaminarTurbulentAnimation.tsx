'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 250

// pipe
const X0 = 18
const X1 = 440
const YC = 100
const HALF = 60
const YTOP = YC - HALF
const YBOT = YC + HALF

// velocity-profile panel
const PX = 476
const PW = 108

// regime bar
const BAR_Y = 198
const BAR_H = 13

const BASE = 1.55 // bulk speed, px/frame
const LAM_PEAK = 2.0 // u_max / u_mean for a parabola
const TURB_PEAK = 1.22 // u_max / u_mean for the 1/7-power profile
const N_DYE = 340
const N_TRACER = 90

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

const DEFAULT_L = 3

type Dye = { x: number; y: number }
type Tracer = { x: number; y: number; y0: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))

function regimeOf(re: number): { name: string; color: string } {
  if (re < 2000) return { name: 'laminar', color: GREEN }
  if (re < 4000) return { name: 'transitional', color: GOLD }
  return { name: 'turbulent', color: PINK }
}

// Blend of the exact parabolic profile and an empirical 1/7-power profile.
// Both are normalised to the same bulk flow rate, so the peak drops as the
// profile blunts — that is the physical content, not a CFD result.
function speedAt(y: number, t: number): number {
  const s = (y - YC) / HALF
  const a = Math.min(1, Math.abs(s))
  const lam = LAM_PEAK * (1 - s * s)
  const turb = TURB_PEAK * Math.pow(Math.max(0, 1 - a), 1 / 7)
  return BASE * (lam * (1 - t) + turb * t)
}

function transitionX(re: number): number {
  return X0 + 50 + (X1 - X0 - 80) * (1 - ramp(re, 1900, 6000))
}

function formatRe(re: number): string {
  if (re < 10000) return String(Math.round(re))
  const e = Math.floor(Math.log10(re))
  return `${(re / Math.pow(10, e)).toFixed(1)}e${e}`
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  logRe: { default: DEFAULT_L, min: 2, max: 5, step: 0.01 },
}

export function LaminarTurbulentAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const dyeRef = useRef<Dye[]>([])
  const tracRef = useRef<Tracer[]>([])
  const { params, set, permalink, isDefault, restored } = useWidgetParams('laminar-turbulent', SPEC)
  const { logRe } = params
  const [running, setRunning] = useState(false)
  const logReRef = useRef(DEFAULT_L)

  useEffect(() => {
    logReRef.current = logRe
  }, [logRe])

  const seed = useCallback(() => {
    dyeRef.current = Array.from({ length: N_DYE }, (_, i) => ({
      x: X0 + 2 + ((X1 - X0) * i) / N_DYE,
      y: YC + (Math.random() - 0.5) * 1.6,
    }))
    tracRef.current = Array.from({ length: N_TRACER }, () => {
      const y = YTOP + 4 + Math.random() * (2 * HALF - 8)
      return { x: X0 + Math.random() * (X1 - X0), y, y0: y }
    })
  }, [])

  const step = useCallback(() => {
    const re = Math.pow(10, logReRef.current)
    const t = ramp(re, 2000, 4200)
    const xt = transitionX(re)
    const mix = 2.9 * t

    for (const d of dyeRef.current) {
      d.x += speedAt(d.y, t)
      if (mix > 0 && d.x > xt) {
        const grow = Math.min(1, (d.x - xt) / 60)
        d.y += (Math.random() - 0.5) * mix * grow
        d.x += (Math.random() - 0.5) * mix * grow * 0.6
      }
      if (d.y < YTOP + 1.5) d.y = YTOP + 1.5 + Math.random()
      if (d.y > YBOT - 1.5) d.y = YBOT - 1.5 - Math.random()
      if (d.x > X1 - 1) {
        d.x = X0 + 1
        d.y = YC + (Math.random() - 0.5) * 1.6
      }
    }

    for (const p of tracRef.current) {
      p.x += speedAt(p.y, t)
      if (mix > 0 && p.x > xt) {
        p.y += (Math.random() - 0.5) * mix * 0.5
        if (p.y < YTOP + 2) p.y = YTOP + 2
        if (p.y > YBOT - 2) p.y = YBOT - 2
      }
      if (p.x > X1 - 1) {
        p.x = X0 + 1
        p.y = p.y0
      }
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const re = Math.pow(10, logReRef.current)
    const t = ramp(re, 2000, 4200)
    const reg = regimeOf(re)
    const xt = transitionX(re)

    ctx.clearRect(0, 0, W, H)

    // pipe interior
    ctx.fillStyle = 'rgba(255,245,235,0.025)'
    ctx.fillRect(X0, YTOP, X1 - X0, 2 * HALF)

    // no-slip walls
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(X0, YTOP)
    ctx.lineTo(X1, YTOP)
    ctx.moveTo(X0, YBOT)
    ctx.lineTo(X1, YBOT)
    ctx.stroke()

    // centreline
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 5])
    ctx.beginPath()
    ctx.moveTo(X0, YC)
    ctx.lineTo(X1, YC)
    ctx.stroke()
    ctx.setLineDash([])

    // transition marker
    if (t > 0.02 && xt < X1 - 20) {
      ctx.strokeStyle = 'rgba(245,158,11,0.4)'
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(xt, YTOP)
      ctx.lineTo(xt, YBOT)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(245,158,11,0.65)'
      ctx.font = '9px monospace'
      ctx.fillText('breakdown', xt + 4, YTOP - 5)
    }

    // passive tracers — their spacing shows the profile
    ctx.fillStyle = 'rgba(16,185,129,0.5)'
    for (const p of tracRef.current) {
      ctx.fillRect(p.x, p.y - 0.7, 3.2, 1.4)
    }

    // the dye filament
    ctx.fillStyle = GOLD
    for (const d of dyeRef.current) {
      ctx.beginPath()
      ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // injector needle
    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(X0 - 14, YC)
    ctx.lineTo(X0 + 4, YC)
    ctx.stroke()

    // --- velocity-profile panel ---
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX, YTOP)
    ctx.lineTo(PX, YBOT)
    ctx.stroke()

    const drawProfile = (blend: number, color: string, dash: boolean) => {
      ctx.strokeStyle = color
      ctx.lineWidth = dash ? 1 : 1.8
      if (dash) ctx.setLineDash([3, 3])
      ctx.beginPath()
      for (let i = 0; i <= 60; i++) {
        const y = YTOP + (2 * HALF * i) / 60
        const x = PX + (speedAt(y, blend) / (BASE * LAM_PEAK)) * PW
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
    drawProfile(0, 'rgba(96,165,250,0.35)', true)
    drawProfile(t, t > 0.5 ? PINK : GREEN, false)

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.font = '9px monospace'
    ctx.fillText('u(r)', PX + 2, YTOP - 6)
    ctx.fillText('wall', PX - 26, YTOP + 3)
    ctx.fillText('wall', PX - 26, YBOT + 3)
    ctx.fillStyle = BLUE
    ctx.fillText('parabola', PX + 44, YBOT + 14)

    // --- regime bar ---
    const barX0 = X0
    const barW = 566
    const lToX = (l: number) => barX0 + ((l - 2) / 3) * barW
    const bands: [number, number, string][] = [
      [2, Math.log10(2000), GREEN],
      [Math.log10(2000), Math.log10(4000), GOLD],
      [Math.log10(4000), 5, PINK],
    ]
    for (const [a, b, col] of bands) {
      ctx.fillStyle = col + '33'
      ctx.fillRect(lToX(a), BAR_Y, lToX(b) - lToX(a), BAR_H)
    }
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(barX0, BAR_Y, barW, BAR_H)

    const mx = lToX(logReRef.current)
    ctx.fillStyle = reg.color
    ctx.beginPath()
    ctx.moveTo(mx, BAR_Y - 6)
    ctx.lineTo(mx - 4.5, BAR_Y - 13)
    ctx.lineTo(mx + 4.5, BAR_Y - 13)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(mx - 0.75, BAR_Y, 1.5, BAR_H)

    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('Re = 100', barX0, BAR_Y + BAR_H + 12)
    ctx.fillText('2000', lToX(Math.log10(2000)) - 12, BAR_Y + BAR_H + 12)
    ctx.fillText('4000', lToX(Math.log10(4000)) - 12, BAR_Y + BAR_H + 12)
    ctx.fillText('10⁵', barX0 + barW - 18, BAR_Y + BAR_H + 12)

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`Re = ${formatRe(re)}`, X0 + 4, 24)
    ctx.fillStyle = reg.color
    ctx.fillText(reg.name, X0 + 4, 40)
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.font = '9px monospace'
    ctx.fillText('dye injector', X0 - 14, YC - 8)
  }, [])

  const settle = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) step()
    },
    [step]
  )

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        settle(120)
        draw()
      } else {
        setRunning(true)
      }
    },
  })

  useEffect(() => {
    seed()
    draw()
  }, [seed, draw])

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
  }, [logRe, running, draw])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    triggerReset()
    set('logRe', DEFAULT_L)
    logReRef.current = DEFAULT_L
    seed()
    draw()
  }

  const re = Math.pow(10, logRe)
  const reg = regimeOf(re)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label">
          <Play size={13} /> Interactive · Reynolds&rsquo;s pipe experiment
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
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg"
          style={{ background: '#0F0D0A' }}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
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
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Re:</span>
          <input
            type="range"
            min={SPEC.logRe.min}
            max={SPEC.logRe.max}
            step={SPEC.logRe.step}
            value={logRe}
            onChange={e => set('logRe', +e.target.value)}
            className="w-48 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{formatRe(re)}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          regime: <strong style={{ color: reg.color }}>{reg.name}</strong>
        </span>
      </div>
    </div>
  )
}
