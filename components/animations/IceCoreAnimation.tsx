'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 384

const PLOT_L = 50
const PLOT_R = W - 52

const T_TOP = 30
const T_BOT = 176
const C_TOP = 208
const C_BOT = H - 34

const OLDEST = 800   // kyr BP
const YOUNGEST = 0

const C_ACCENT = '#22D3EE' // cyan   — temperature proxy
const C_GOLD = '#F59E0B'   // gold   — CO2
const C_BLUE = '#60A5FA'   // blue   — visible-window / lag markers
const C_VIOLET = '#A78BFA' // violet — present-day CO2
const C_GREEN = '#10B981'  // green  — termination markers

// ---------------------------------------------------------------------------
// A faithful reproduction of the EPICA Dome C-style record: nine terminations
// at their approximate real ages, ~180-300 ppm CO2, ~11 °C of Antarctic
// temperature swing, sawtooth asymmetry, and an 800-year CO2 lag at the
// terminations (the classic Caillon et al. 2003 figure). Not a data feed.
// ---------------------------------------------------------------------------

const TERMS = [18, 135, 243, 337, 424, 533, 630, 712, 790, 870]
const RISE = 6.5      // kyr for a termination
const LAG = 0.8       // kyr by which CO2 trails temperature
const CO2_NOW = 423

function cycleAt(t: number): { start: number; span: number } {
  for (let i = 0; i < TERMS.length; i++) {
    if (TERMS[i] >= t) {
      return { start: TERMS[i], span: i > 0 ? TERMS[i] - TERMS[i - 1] : 110 }
    }
  }
  const last = TERMS.length - 1
  return { start: TERMS[last], span: 90 }
}

function temp(t: number): number {
  const { start, span } = cycleAt(t)
  const s = Math.max(0, start - t)
  let base: number
  if (s < RISE) {
    const u = s / RISE
    base = -9.5 + 11 * (u * u * (3 - 2 * u))
  } else {
    const v = Math.min(1, (s - RISE) / Math.max(1, span - RISE))
    const w = Math.max(0, Math.min(1, (v - 0.08) / 0.92))
    base = 1.5 - 11 * Math.pow(w, 1.15)
  }
  return base + 0.75 * Math.sin((2 * Math.PI * s) / 21) + 0.45 * Math.sin((2 * Math.PI * s) / 41 + 1.1)
}

function co2(t: number): number {
  const a = t + LAG
  const smoothed = (temp(a - 0.6) + 2 * temp(a) + temp(a + 0.6)) / 4
  return 190 + 9.3 * (smoothed + 9.5)
}

// Time at which a series first crosses its mid-range on the way up, scanning
// from old to young across the visible window. Returns null if never crossed.
function midCrossing(f: (t: number) => number, lo: number, hi: number): number | null {
  const N = 900
  let vMin = Infinity
  let vMax = -Infinity
  for (let i = 0; i <= N; i++) {
    const v = f(hi - ((hi - lo) * i) / N)
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  if (vMax - vMin < 1e-6) return null
  const mid = (vMin + vMax) / 2
  let prevT = hi
  let prevV = f(hi)
  for (let i = 1; i <= N; i++) {
    const t = hi - ((hi - lo) * i) / N
    const v = f(t)
    if (prevV < mid && v >= mid) {
      const frac = (mid - prevV) / (v - prevV)
      return prevT + (t - prevT) * frac
    }
    prevT = t
    prevV = v
  }
  return null
}

const KYR_PER_FRAME = 2.6

export function IceCoreAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setNow(YOUNGEST); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [now, setNow] = useState(OLDEST)          // drawn as far young as this
  const [windowKyr, setWindowKyr] = useState(OLDEST)
  const [center, setCenter] = useState(OLDEST / 2)
  const [showToday, setShowToday] = useState(false)

  const half = windowKyr / 2
  const clampedCenter = Math.max(YOUNGEST + half, Math.min(OLDEST - half, center))
  const hi = clampedCenter + half   // older edge (left)
  const lo = clampedCenter - half   // younger edge (right)

  const cHi = showToday ? 440 : 310
  const cLo = 170

  const xFor = useCallback((t: number) => PLOT_L + ((hi - t) / (hi - lo)) * (PLOT_R - PLOT_L), [hi, lo])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.lineJoin = 'round'

    const axis = 'rgba(255,245,235,0.15)'
    const label = 'rgba(245,240,232,0.42)'

    const ty = (v: number) => T_BOT - ((Math.max(-11, Math.min(5, v)) + 11) / 16) * (T_BOT - T_TOP)
    const cy = (v: number) => C_BOT - ((Math.max(cLo, Math.min(cHi, v)) - cLo) / (cHi - cLo)) * (C_BOT - C_TOP)

    const drawnLo = Math.max(lo, now)   // youngest time actually revealed

    // ---- panel frames ----
    for (const [top, bot] of [[T_TOP, T_BOT], [C_TOP, C_BOT]]) {
      ctx.strokeStyle = axis
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PLOT_L, top)
      ctx.lineTo(PLOT_L, bot)
      ctx.lineTo(PLOT_R, bot)
      ctx.stroke()
    }

    // ---- termination markers ----
    for (const term of TERMS) {
      if (term > hi || term < lo) continue
      const x = xFor(term)
      ctx.strokeStyle = `${C_GREEN}40`
      ctx.setLineDash([2, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, T_TOP)
      ctx.lineTo(x, C_BOT)
      ctx.stroke()
      ctx.setLineDash([])
      if (windowKyr < 400) {
        ctx.fillStyle = `${C_GREEN}AA`
        ctx.textAlign = 'center'
        ctx.fillText('termination', x, T_TOP - 4)
      }
    }

    // ---- temperature panel ----
    ctx.textAlign = 'left'
    ctx.fillStyle = C_ACCENT
    ctx.fillText('Antarctic temperature proxy, °C vs present (δD-derived)', PLOT_L + 2, T_TOP - 16)

    ctx.textAlign = 'right'
    ctx.fillStyle = label
    for (const v of [-10, -5, 0]) {
      ctx.fillText(`${v}`, PLOT_L - 5, ty(v) + 3)
      ctx.strokeStyle = v === 0 ? 'rgba(245,240,232,0.12)' : 'rgba(245,240,232,0.05)'
      ctx.beginPath()
      ctx.moveTo(PLOT_L, ty(v))
      ctx.lineTo(PLOT_R, ty(v))
      ctx.stroke()
    }

    const step = Math.max(0.06, (hi - lo) / 1200)

    ctx.beginPath()
    ctx.strokeStyle = C_ACCENT
    ctx.lineWidth = 1.8
    let started = false
    for (let t = hi; t >= drawnLo; t -= step) {
      const px = xFor(t)
      const py = ty(temp(t))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // ---- CO2 panel ----
    ctx.textAlign = 'left'
    ctx.fillStyle = C_GOLD
    ctx.fillText('CO₂ from trapped air, ppm', PLOT_L + 2, C_TOP - 8)

    ctx.textAlign = 'right'
    ctx.fillStyle = label
    const ticks = showToday ? [200, 250, 300, 350, 400] : [180, 220, 260, 300]
    for (const v of ticks) {
      ctx.fillText(`${v}`, PLOT_L - 5, cy(v) + 3)
      ctx.strokeStyle = 'rgba(245,240,232,0.05)'
      ctx.beginPath()
      ctx.moveTo(PLOT_L, cy(v))
      ctx.lineTo(PLOT_R, cy(v))
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.strokeStyle = C_GOLD
    ctx.lineWidth = 1.8
    started = false
    for (let t = hi; t >= drawnLo; t -= step) {
      const px = xFor(t)
      const py = cy(co2(t))
      if (!started) { ctx.moveTo(px, py); started = true } else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // ---- present-day CO2 ----
    if (showToday) {
      ctx.strokeStyle = C_VIOLET
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(PLOT_L, cy(CO2_NOW))
      ctx.lineTo(PLOT_R, cy(CO2_NOW))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_VIOLET
      ctx.textAlign = 'left'
      ctx.fillText(`today  ${CO2_NOW} ppm`, PLOT_L + 4, cy(CO2_NOW) - 5)

      ctx.strokeStyle = `${C_VIOLET}88`
      ctx.beginPath()
      ctx.moveTo(PLOT_R + 12, cy(300))
      ctx.lineTo(PLOT_R + 12, cy(CO2_NOW))
      ctx.stroke()
      ctx.textAlign = 'left'
      ctx.fillStyle = `${C_VIOLET}CC`
      ctx.fillText('+123', PLOT_R + 16, (cy(300) + cy(CO2_NOW)) / 2)
      ctx.fillText('ppm', PLOT_R + 16, (cy(300) + cy(CO2_NOW)) / 2 + 10)
    }

    // ---- lead-lag inspector, only when zoomed into a termination ----
    let lagYears: number | null = null
    if (windowKyr <= 80 && drawnLo <= lo + 0.01) {
      const tT = midCrossing(temp, lo, hi)
      const tC = midCrossing(co2, lo, hi)
      if (tT !== null && tC !== null) {
        lagYears = Math.round((tT - tC) * 1000)
        ctx.setLineDash([3, 3])
        ctx.lineWidth = 1.25
        ctx.strokeStyle = C_ACCENT
        ctx.beginPath()
        ctx.moveTo(xFor(tT), T_TOP)
        ctx.lineTo(xFor(tT), T_BOT)
        ctx.stroke()
        ctx.strokeStyle = C_GOLD
        ctx.beginPath()
        ctx.moveTo(xFor(tC), C_TOP)
        ctx.lineTo(xFor(tC), C_BOT)
        ctx.stroke()
        ctx.setLineDash([])

        // Bridge between the two midpoints, drawn across the gap.
        const yb = T_BOT + 14
        ctx.strokeStyle = C_BLUE
        ctx.lineWidth = 1.25
        ctx.beginPath()
        ctx.moveTo(xFor(tT), yb)
        ctx.lineTo(xFor(tC), yb)
        ctx.stroke()
        ctx.fillStyle = C_BLUE
        ctx.textAlign = 'center'
        ctx.fillText(`CO₂ midpoint lags T by ~${lagYears} yr`, (xFor(tT) + xFor(tC)) / 2, yb - 5)
      }
    }

    // ---- time axis ----
    const tick = windowKyr > 400 ? 100 : windowKyr > 150 ? 50 : windowKyr > 60 ? 20 : 5
    ctx.textAlign = 'center'
    ctx.fillStyle = label
    for (let t = Math.ceil(lo / tick) * tick; t <= hi; t += tick) {
      ctx.fillText(t === 0 ? 'now' : `${t}`, xFor(t), C_BOT + 14)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('kyr before present', PLOT_L + 2, H - 4)
  }, [hi, lo, now, windowKyr, showToday, cHi, cLo, xFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return }
    const loop = () => {
      setNow(prev => {
        const next = prev - KYR_PER_FRAME
        if (next <= YOUNGEST) { setRunning(false); return YOUNGEST }
        return next
      })
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setNow(OLDEST)
    setWindowKyr(OLDEST)
    setCenter(OLDEST / 2)
    setShowToday(false)
  }

  const jumpTo = (t: number, span: number) => {
    setRunning(false)
    setNow(YOUNGEST)
    setWindowKyr(span)
    setCenter(t)
  }

  const view = windowKyr <= 80
    ? 'zoomed to a termination'
    : windowKyr <= 300 ? 'a few glacial cycles' : 'full record — the 100 kyr sawtooth'
  const viewColor = windowKyr <= 80 ? C_BLUE : windowKyr <= 300 ? C_GREEN : C_ACCENT
  const at = Math.max(lo, Math.min(hi, now))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · 800,000 years of ice: temperature and CO₂</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: 800,000 years of ice: temperature and CO₂. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (now <= YOUNGEST) setNow(OLDEST); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => jumpTo(18, 45)}
          className="px-2 py-1 rounded text-xs font-medium border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/10 transition-colors"
        >
          Termination I
        </button>
        <button
          onClick={() => jumpTo(135, 45)}
          className="px-2 py-1 rounded text-xs font-medium border border-accent-blue/40 text-accent-blue hover:bg-accent-blue/10 transition-colors"
        >
          Termination II
        </button>
        <button
          onClick={() => setShowToday(v => !v)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={{
            color: showToday ? C_VIOLET : 'rgba(245,240,232,0.4)',
            borderColor: showToday ? `${C_VIOLET}55` : 'rgba(245,240,232,0.18)',
            background: showToday ? `${C_VIOLET}14` : 'transparent',
          }}
        >
          Show present-day CO₂
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Zoom:</span>
          <input
            type="range" min={25} max={OLDEST} step={5} value={windowKyr}
            onChange={e => { setNow(YOUNGEST); setWindowKyr(+e.target.value) }}
            className="w-24 accent-accent-blue"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Pan:</span>
          <input
            type="range" min={YOUNGEST} max={OLDEST} step={1} value={clampedCenter}
            onChange={e => { setRunning(false); setNow(YOUNGEST); setCenter(+e.target.value) }}
            className="w-24 accent-accent-violet"
          />
        </label>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: viewColor, borderColor: `${viewColor}30`, background: `${viewColor}10` }}
        >
          {view}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          {at.toFixed(0)} kyr BP · {temp(at).toFixed(1)} °C · {co2(at).toFixed(0)} ppm
        </span>
      </div>
    </div>
  )
}
