'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 330

const PLOT_L = 46
const PLOT_R = W - 16
const PLOT_T = 26
const PLOT_B = 236

// Growth-rate strip beneath the main plot.
const STRIP_T = 262
const STRIP_B = H - 24
const RATE_HI = 3.2

const T0 = 1958
const T1 = 2026
const SPAN = T1 - T0

// Quadratic trend fitted to the record's anchor points:
// ~315 ppm (1958), ~354 ppm (1990), ~427 ppm (2026).
const A_LIN = 0.83805
const A_QUAD = 0.011897

const C_ACCENT = '#22D3EE' // cyan — the monthly series
const C_GOLD = '#F59E0B'   // gold — the deseasonalised trend
const C_VIOLET = '#A78BFA' // violet — growth rate
const C_BLUE = '#60A5FA'   // blue — the visible window
const C_GREEN = '#10B981'  // green — seasonal annotation

function trend(t: number): number {
  const u = t - T0
  return 315 + A_LIN * u + A_QUAD * u * u
}

function growth(t: number): number {
  return A_LIN + 2 * A_QUAD * (t - T0)
}

// Northern-hemisphere growing season: steep spring/summer drawdown, slower
// autumn/winter rebuild. A second harmonic supplies the asymmetry.
function seasonal(t: number): number {
  const u = t - T0
  const amp = 3.0 + 0.006 * u
  const theta = 2 * Math.PI * ((t % 1) - 0.12)
  return amp * (Math.sin(theta) + 0.22 * Math.sin(2 * theta))
}

function co2(t: number): number {
  return trend(t) + seasonal(t)
}

const MIN_WINDOW = 2.5
const YR_PER_FRAME = 0.32

export function KeelingCurveAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setNow(T1); setWindowYears(SPAN); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [now, setNow] = useState(T0)
  const [windowYears, setWindowYears] = useState(SPAN)
  const [center, setCenter] = useState(T0 + SPAN / 2)

  const half = windowYears / 2
  const lo = Math.max(T0, Math.min(T1 - windowYears, center - half))
  const hi = lo + windowYears

  // Vertical range follows the window so the sawtooth is legible when zoomed in.
  const vLo = windowYears > 20 ? 310 : Math.floor(co2(lo) - 8)
  const vHi = windowYears > 20 ? 435 : Math.ceil(co2(hi) + 8)

  const xFor = useCallback((t: number) => PLOT_L + ((t - lo) / windowYears) * (PLOT_R - PLOT_L), [lo, windowYears])
  const yFor = useCallback(
    (v: number) => PLOT_B - ((Math.max(vLo, Math.min(vHi, v)) - vLo) / (vHi - vLo)) * (PLOT_B - PLOT_T),
    [vLo, vHi]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- axes ----
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, PLOT_T)
    ctx.lineTo(PLOT_L, PLOT_B)
    ctx.lineTo(PLOT_R, PLOT_B)
    ctx.stroke()

    const vStep = vHi - vLo > 60 ? 25 : 5
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.textAlign = 'right'
    for (let v = Math.ceil(vLo / vStep) * vStep; v <= vHi; v += vStep) {
      ctx.fillText(`${v}`, PLOT_L - 6, yFor(v) + 3)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.06)'
      ctx.moveTo(PLOT_L, yFor(v))
      ctx.lineTo(PLOT_R, yFor(v))
      ctx.stroke()
    }
    ctx.textAlign = 'left'
    ctx.fillText('CO₂ (ppm), Mauna Loa — reproduction of the record', PLOT_L + 2, PLOT_T - 12)

    const yrStep = windowYears > 40 ? 10 : windowYears > 12 ? 5 : 1
    ctx.textAlign = 'center'
    for (let y = Math.ceil(lo / yrStep) * yrStep; y <= hi; y += yrStep) {
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${y}`, xFor(y), PLOT_B + 14)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.1)'
      ctx.moveTo(xFor(y), PLOT_B)
      ctx.lineTo(xFor(y), PLOT_B + 4)
      ctx.stroke()
    }

    const drawnHi = Math.min(hi, now)

    // ---- deseasonalised trend ----
    if (drawnHi > lo) {
      ctx.beginPath()
      ctx.strokeStyle = `${C_GOLD}AA`
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      let started = false
      for (let t = lo; t <= drawnHi; t += windowYears / 400) {
        const x = xFor(t)
        const y = yFor(trend(t))
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // ---- monthly series ----
      ctx.beginPath()
      ctx.strokeStyle = C_ACCENT
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      started = false
      const step = Math.min(1 / 24, windowYears / 900)
      for (let t = lo; t <= drawnHi; t += step) {
        const x = xFor(t)
        const y = yFor(co2(t))
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()

      if (now < hi) {
        ctx.beginPath()
        ctx.arc(xFor(drawnHi), yFor(co2(drawnHi)), 3.5, 0, Math.PI * 2)
        ctx.fillStyle = C_ACCENT
        ctx.fill()
      }
    }

    // ---- seasonal amplitude annotation, only when zoomed in ----
    if (windowYears <= 12 && drawnHi > lo + 1) {
      const yr = Math.floor(lo) + 1
      if (yr + 0.8 < drawnHi) {
        const xMax = xFor(yr + 0.37)
        const xMin = xFor(yr + 0.79)
        const yMax = yFor(co2(yr + 0.37))
        const yMin = yFor(co2(yr + 0.79))
        ctx.beginPath()
        ctx.strokeStyle = `${C_GREEN}88`
        ctx.setLineDash([2, 3])
        ctx.moveTo(xMax, yMax)
        ctx.lineTo(xMin + 30, yMax)
        ctx.moveTo(xMin, yMin)
        ctx.lineTo(xMin + 30, yMin)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = C_GREEN
        ctx.textAlign = 'left'
        ctx.fillText(
          `${(co2(yr + 0.37) - co2(yr + 0.79)).toFixed(1)} ppm seasonal`,
          xMin + 34, (yMax + yMin) / 2 + 3
        )
        ctx.fillText('May peak → October trough', xMin + 34, (yMax + yMin) / 2 + 15)
      }
    }

    // ---- growth-rate strip (always the full record) ----
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('trend growth rate (ppm/yr), full record', PLOT_L + 2, STRIP_T - 5)

    const sx = (t: number) => PLOT_L + ((t - T0) / SPAN) * (PLOT_R - PLOT_L)
    const sy = (r: number) => STRIP_B - (Math.max(0, Math.min(RATE_HI, r)) / RATE_HI) * (STRIP_B - STRIP_T)

    // Highlight the portion of the record currently visible above.
    ctx.fillStyle = `${C_BLUE}18`
    ctx.fillRect(sx(lo), STRIP_T, sx(hi) - sx(lo), STRIP_B - STRIP_T)

    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.beginPath()
    ctx.moveTo(PLOT_L, STRIP_T)
    ctx.lineTo(PLOT_L, STRIP_B)
    ctx.lineTo(PLOT_R, STRIP_B)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.textAlign = 'right'
    for (const r of [1, 2, 3]) ctx.fillText(`${r}`, PLOT_L - 6, sy(r) + 3)
    ctx.textAlign = 'left'

    ctx.beginPath()
    ctx.strokeStyle = C_VIOLET
    ctx.lineWidth = 2
    for (let t = T0; t <= Math.min(T1, now); t += 0.25) {
      const x = sx(t)
      const y = sy(growth(t))
      if (t === T0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    ctx.fillStyle = `${C_VIOLET}CC`
    ctx.fillText(`${growth(T0).toFixed(1)}`, sx(T0) + 4, sy(growth(T0)) - 5)
    if (now > T1 - 4) {
      ctx.textAlign = 'right'
      ctx.fillText(`${growth(T1).toFixed(1)} ppm/yr`, sx(T1) - 2, sy(growth(T1)) - 5)
      ctx.textAlign = 'left'
    }
  }, [lo, hi, now, windowYears, vLo, vHi, xFor, yFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setNow(prev => {
        const next = prev + YR_PER_FRAME
        if (next >= T1) { setRunning(false); return T1 }
        setCenter(next)
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setNow(T0)
    setWindowYears(SPAN)
    setCenter(T0 + SPAN / 2)
  }

  const view = windowYears <= 6
    ? 'zoomed in — the seasonal sawtooth'
    : windowYears <= 25 ? 'wiggle and trend together' : 'full record — the trend dominates'
  const viewColor = windowYears <= 6 ? C_GREEN : windowYears <= 25 ? C_BLUE : C_ACCENT
  const shown = Math.min(now, hi)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The Keeling curve: seasonal breath on a steepening trend</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: The Keeling curve: seasonal breath on a steepening trend. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Zoom:</span>
          <input
            type="range" min={MIN_WINDOW} max={SPAN} step={0.5} value={windowYears}
            onChange={e => setWindowYears(+e.target.value)}
            className="w-28 accent-accent-blue"
          />
          <span className="text-text-secondary font-mono">{windowYears.toFixed(0)} yr</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Pan:</span>
          <input
            type="range" min={T0} max={T1} step={0.25} value={center}
            onChange={e => { setRunning(false); setNow(T1); setCenter(+e.target.value) }}
            className="w-28 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">{lo.toFixed(0)}–{hi.toFixed(0)}</span>
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: viewColor, borderColor: `${viewColor}30`, background: `${viewColor}10` }}
        >
          {view}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          {shown.toFixed(0)}: {co2(shown).toFixed(1)} ppm · growth {growth(shown).toFixed(2)} ppm/yr
        </WidgetStatus>
      </div>
    </div>
  )
}
