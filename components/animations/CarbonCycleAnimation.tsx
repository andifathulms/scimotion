'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 360

// --- carbon numbers (GtC, GtC/yr) -------------------------------------------
const M0 = 590            // pre-industrial atmospheric stock
const M_START = 890       // present-day atmospheric stock
const GTC_PER_PPM = 2.13
const SINK_K = 0.0207     // net sink strength, 1/yr (gives ~46% airborne fraction today)

const F_PHOTO = 120       // atmosphere -> land
const F_RESP = 120        // land -> atmosphere
const F_A2O = 80          // atmosphere -> surface ocean
const F_O2A = 80          // surface ocean -> atmosphere
const F_OVERTURN = 90     // surface <-> deep ocean

const MAX_YEARS = 200
const YR_PER_FRAME = 0.28

// --- colours ----------------------------------------------------------------
const C_ACCENT = '#22D3EE' // cyan — atmosphere + the human flux
const C_GOLD = '#F59E0B'   // gold — respiration
const C_BLUE = '#60A5FA'   // blue — ocean exchange
const C_VIOLET = '#A78BFA' // violet — deep ocean overturning
const C_GREEN = '#10B981'  // green — photosynthesis

// --- layout -----------------------------------------------------------------
type Box = { x: number; y: number; w: number; h: number; name: string; stock: number; color: string }

const ATM = { x: 20, y: 24, w: 470, h: 44 }
const LAND: Box = { x: 24, y: 118, w: 140, h: 56, name: 'LAND BIOSPHERE', stock: 2300, color: C_GREEN }
const SURF: Box = { x: 200, y: 112, w: 150, h: 34, name: 'SURFACE OCEAN', stock: 900, color: C_BLUE }
const DEEP: Box = { x: 182, y: 158, w: 186, h: 70, name: 'DEEP OCEAN', stock: 37000, color: C_VIOLET }
const FOSSIL: Box = { x: 424, y: 150, w: 96, h: 52, name: 'FOSSIL RESERVES', stock: 1000, color: C_GOLD }

const PLOT_L = 46
const PLOT_R = W - 16
const PLOT_T = 250
const PLOT_B = H - 26
const V_LO = 560
const V_HI = 1180

type Arrow = {
  x: number; y0: number; y1: number   // y0 -> y1 is the direction of travel
  flux: number; color: string; label: string; oneWay: boolean
}

// Each arrow carries dots at a density proportional to its flux, so the
// human trickle reads as visually negligible next to the natural exchange.
const ARROWS: Arrow[] = [
  { x: 66, y0: 118, y1: 70, flux: F_RESP, color: C_GOLD, label: 'respiration', oneWay: false },
  { x: 118, y0: 70, y1: 118, flux: F_PHOTO, color: C_GREEN, label: 'photosynthesis', oneWay: false },
  { x: 236, y0: 112, y1: 70, flux: F_O2A, color: C_BLUE, label: '', oneWay: false },
  { x: 314, y0: 70, y1: 112, flux: F_A2O, color: C_BLUE, label: '', oneWay: false },
  { x: 236, y0: 158, y1: 146, flux: F_OVERTURN, color: C_VIOLET, label: '', oneWay: false },
  { x: 314, y0: 146, y1: 158, flux: F_OVERTURN, color: C_VIOLET, label: '', oneWay: false },
]

const HUMAN_ARROW: Arrow = {
  x: 472, y0: 150, y1: 68, flux: 11, color: C_ACCENT, label: 'fossil (one-way)', oneWay: true,
}

function dotCount(flux: number): number {
  return Math.max(1, Math.round(flux / 20))
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - 3.5, y - dir * 5)
  ctx.lineTo(x + 3.5, y - dir * 5)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function drawBox(ctx: CanvasRenderingContext2D, b: Box) {
  ctx.beginPath()
  ctx.rect(b.x, b.y, b.w, b.h)
  ctx.fillStyle = `${b.color}12`
  ctx.fill()
  ctx.strokeStyle = `${b.color}55`
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(245,240,232,0.72)'
  ctx.fillText(b.name, b.x + b.w / 2, b.y + 15)
  ctx.fillStyle = `${b.color}CC`
  ctx.fillText(`${b.stock.toLocaleString('en-US')} GtC`, b.x + b.w / 2, b.y + 28)
}

export function CarbonCycleAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setEmitting(true); setYears(MAX_YEARS); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const historyRef = useRef<number[]>([M_START])

  const [running, setRunning] = useState(false)
  const [years, setYears] = useState(0)
  const [emitting, setEmitting] = useState(false)
  const [stock, setStock] = useState(M_START)

  // Rebuild the whole trace whenever the clock or the switch moves, so that
  // scrubbing back (Reset) and toggling mid-run both stay consistent.
  const emissions = emitting ? 11 : 0

  const xFor = useCallback((yr: number) => PLOT_L + (yr / MAX_YEARS) * (PLOT_R - PLOT_L), [])
  const yFor = useCallback(
    (v: number) => PLOT_B - ((Math.max(V_LO, Math.min(V_HI, v)) - V_LO) / (V_HI - V_LO)) * (PLOT_B - PLOT_T),
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- atmosphere box (its stock is the variable) ----
    ctx.beginPath()
    ctx.rect(ATM.x, ATM.y, ATM.w, ATM.h)
    ctx.fillStyle = `${C_ACCENT}14`
    ctx.fill()
    ctx.strokeStyle = `${C_ACCENT}66`
    ctx.lineWidth = 1.25
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(245,240,232,0.78)'
    ctx.fillText('ATMOSPHERE', ATM.x + ATM.w / 2, ATM.y + 17)
    ctx.fillStyle = C_ACCENT
    ctx.fillText(
      `${stock.toFixed(0)} GtC  ·  ${(stock / GTC_PER_PPM).toFixed(0)} ppm`,
      ATM.x + ATM.w / 2, ATM.y + 31
    )

    // Fill bar inside the atmosphere box showing the excess over pre-industrial
    const excessFrac = Math.max(0, Math.min(1, (stock - M0) / (V_HI - M0)))
    ctx.fillStyle = `${C_ACCENT}33`
    ctx.fillRect(ATM.x + 2, ATM.y + ATM.h - 8, (ATM.w - 4) * excessFrac, 6)
    ctx.strokeStyle = `${C_ACCENT}44`
    ctx.lineWidth = 1
    ctx.strokeRect(ATM.x + 2, ATM.y + ATM.h - 8, ATM.w - 4, 6)

    // ---- the other reservoirs ----
    for (const b of [LAND, SURF, DEEP, FOSSIL]) drawBox(ctx, b)

    // ---- fluxes ----
    const phase = years * 0.9
    const allArrows = emitting ? [...ARROWS, HUMAN_ARROW] : ARROWS
    for (const a of allArrows) {
      const dir = a.y1 > a.y0 ? 1 : -1
      const len = Math.abs(a.y1 - a.y0)
      ctx.beginPath()
      ctx.strokeStyle = `${a.color}33`
      ctx.lineWidth = a.oneWay ? 2 : 1
      ctx.moveTo(a.x, a.y0)
      ctx.lineTo(a.x, a.y1)
      ctx.stroke()
      drawArrowHead(ctx, a.x, a.y1, dir, `${a.color}AA`)

      const n = dotCount(a.flux)
      for (let i = 0; i < n; i++) {
        const s = ((phase + i / n) % 1)
        const y = a.y0 + dir * s * len
        ctx.beginPath()
        ctx.arc(a.x, y, a.oneWay ? 2.6 : 2, 0, Math.PI * 2)
        ctx.fillStyle = a.color
        ctx.fill()
      }
      if (a.label) {
        ctx.textAlign = 'center'
        ctx.fillStyle = `${a.color}CC`
        ctx.fillText(a.label, a.x, dir === -1 ? a.y0 + 14 : a.y0 - 6)
      }
    }

    // Flux magnitude annotations
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.42)'
    ctx.fillText(`${F_PHOTO} GtC/yr each way`, 26, 190)
    ctx.fillText(`${F_A2O} GtC/yr each way`, 200, 240)
    ctx.textAlign = 'center'
    ctx.fillStyle = emitting ? C_ACCENT : 'rgba(245,240,232,0.3)'
    ctx.fillText(emitting ? '11 GtC/yr' : 'off', HUMAN_ARROW.x, 214)
    ctx.fillStyle = `${C_ACCENT}99`
    ctx.fillText('fossil', HUMAN_ARROW.x, 226)
    ctx.fillText('one-way', HUMAN_ARROW.x, 236)

    // ---- stock chart ----
    ctx.textAlign = 'left'
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT_L, PLOT_T)
    ctx.lineTo(PLOT_L, PLOT_B)
    ctx.lineTo(PLOT_R, PLOT_B)
    ctx.stroke()

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.setLineDash([4, 4])
    ctx.moveTo(PLOT_L, yFor(M0))
    ctx.lineTo(PLOT_R, yFor(M0))
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.textAlign = 'right'
    for (const v of [600, 800, 1000]) ctx.fillText(`${v}`, PLOT_L - 6, yFor(v) + 3)
    ctx.textAlign = 'left'
    ctx.fillText('atmospheric carbon (GtC) vs. years from now →', PLOT_L + 4, H - 6)

    const hist = historyRef.current
    ctx.beginPath()
    ctx.strokeStyle = C_ACCENT
    ctx.lineWidth = 2.25
    ctx.lineJoin = 'round'
    for (let i = 0; i < hist.length; i++) {
      const x = xFor((i / hist.length) * Math.max(years, 0.0001))
      const y = yFor(hist[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    if (years > 0 && years < MAX_YEARS) {
      ctx.beginPath()
      ctx.arc(xFor(years), yFor(stock), 3.75, 0, Math.PI * 2)
      ctx.fillStyle = C_ACCENT
      ctx.fill()
    }
  }, [years, stock, emitting, xFor, yFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setYears(prev => {
        const next = prev + YR_PER_FRAME
        if (next >= MAX_YEARS) { setRunning(false); return MAX_YEARS }
        return next
      })
      setStock(prev => {
        const dM = emissions - SINK_K * (prev - M0)
        const nextM = prev + dM * YR_PER_FRAME
        historyRef.current.push(nextM)
        if (historyRef.current.length > 4000) historyRef.current.shift()
        return nextM
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, emissions])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setYears(0)
    setStock(M_START)
    setEmitting(false)
    historyRef.current = [M_START]
  }

  const netChange = emissions - SINK_K * (stock - M0)
  const airborne = emissions > 0 ? (netChange / emissions) * 100 : 0
  const regime = emissions === 0
    ? (Math.abs(netChange) < 0.05 ? 'balanced — stock is flat' : 'emissions off — slow decay')
    : 'one-way flux — stock rising'
  const regimeColor = emissions === 0 ? C_GREEN : C_ACCENT

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Balanced fluxes, a one-way flux, and the atmospheric stock</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Balanced fluxes, a one-way flux, and the atmospheric stock. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <button
          onClick={() => setEmitting(e => !e)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={
            emitting
              ? { color: C_ACCENT, borderColor: `${C_ACCENT}44`, background: `${C_ACCENT}12` }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          Human emissions: {emitting ? 'on' : 'off'}
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: regimeColor, borderColor: `${regimeColor}30`, background: `${regimeColor}10` }}
        >
          {regime}
        </span>
        <WidgetStatus className="ml-auto text-xs text-text-secondary font-mono">
          year {years.toFixed(0)} · {stock.toFixed(0)} GtC · {(stock / GTC_PER_PPM).toFixed(0)} ppm
          {emissions > 0 ? ` · airborne ${airborne.toFixed(0)}%` : ''}
        </WidgetStatus>
      </div>
    </div>
  )
}
