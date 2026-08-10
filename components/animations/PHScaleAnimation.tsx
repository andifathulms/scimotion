'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300

const BAR = { x: 44, y: 34, w: 512, h: 22 }
const PANEL_Y = 128
const PANEL_H = 138
const PANEL_W = 244
const PANEL_GAP = 24
const PANEL_X_L = 44
const PANEL_X_R = PANEL_X_L + PANEL_W + PANEL_GAP

const C_ACID = '#FB923C'   // orange — H+
const C_BASE = '#60A5FA'   // blue — OH-
const C_GOLD = '#F59E0B'   // gold — highlights
const C_VIOLET = '#A78BFA' // violet — annotations
const C_GREEN = '#10B981'  // green — neutral

const DOT_SLOTS = 1400
const MAX_DOTS = 1200

type Example = { lo: number; hi: number; name: string }

// Familiar reference substances, indexed by the pH band they sit in.
const EXAMPLES: Example[] = [
  { lo: -1, hi: 0.8, name: 'battery acid' },
  { lo: 0.8, hi: 2.0, name: 'stomach acid' },
  { lo: 2.0, hi: 2.7, name: 'lemon juice' },
  { lo: 2.7, hi: 3.5, name: 'vinegar' },
  { lo: 3.5, hi: 4.6, name: 'orange juice' },
  { lo: 4.6, hi: 5.4, name: 'black coffee' },
  { lo: 5.4, hi: 6.2, name: 'clean rainwater' },
  { lo: 6.2, hi: 6.9, name: 'milk' },
  { lo: 6.9, hi: 7.2, name: 'pure water (25 °C)' },
  { lo: 7.2, hi: 7.6, name: 'human blood' },
  { lo: 7.6, hi: 8.6, name: 'seawater' },
  { lo: 8.6, hi: 9.8, name: 'baking soda solution' },
  { lo: 9.8, hi: 11.0, name: 'milk of magnesia' },
  { lo: 11.0, hi: 12.2, name: 'household ammonia' },
  { lo: 12.2, hi: 13.2, name: 'bleach' },
  { lo: 13.2, hi: 15, name: 'drain cleaner' },
]

function exampleFor(pH: number): string {
  for (const e of EXAMPLES) if (pH >= e.lo && pH < e.hi) return e.name
  return 'aqueous solution'
}

// Hue sweep along the familiar red -> green -> violet indicator scale.
function scaleColor(pH: number): string {
  const t = Math.max(0, Math.min(1, pH / 14))
  const hue = 0 + t * 285
  return `hsl(${hue.toFixed(0)}, 62%, 52%)`
}

type Dot = { x: number; y: number; px: number; py: number }

// Deterministic pseudo-random layout (no Math.random at module scope in render paths).
function makeDots(count: number): Dot[] {
  const out: Dot[] = []
  let s = 987654321
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  for (let i = 0; i < count; i++) {
    out.push({ x: next(), y: next(), px: next() * Math.PI * 2, py: next() * Math.PI * 2 })
  }
  return out
}

function sciParts(v: number): { mantissa: string; exponent: number } {
  if (v <= 0) return { mantissa: '0.0', exponent: 0 }
  const exponent = Math.floor(Math.log10(v))
  let mantissa = v / Math.pow(10, exponent)
  if (mantissa >= 9.995) mantissa = 1
  return { mantissa: mantissa.toFixed(2), exponent }
}

export function PHScaleAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      setAnimated(!reduced)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const phaseRef = useRef(0)

  const [pH, setPH] = useState(7)
  const [animated, setAnimated] = useState(false)
  const [tick, setTick] = useState(0)

  const dots = useMemo(() => makeDots(DOT_SLOTS), [])

  const h = Math.pow(10, -pH)
  const oh = Math.pow(10, -(14 - pH))

  // One dot at pH 7, ten at pH 6, a hundred at pH 5 — a literal decade per unit.
  const hDots = Math.min(MAX_DOTS, Math.max(1, Math.round(Math.pow(10, 7 - pH))))
  const ohDots = Math.min(MAX_DOTS, Math.max(1, Math.round(Math.pow(10, pH - 7))))
  const hOver = Math.pow(10, 7 - pH) > MAX_DOTS
  const ohOver = Math.pow(10, pH - 7) > MAX_DOTS

  const xForPH = useCallback((v: number) => BAR.x + (v / 14) * BAR.w, [])
  const phForX = useCallback((x: number) => ((x - BAR.x) / BAR.w) * 14, [])

  const drawSci = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, label: string, v: number, color: string) => {
      const { mantissa, exponent } = sciParts(v)
      ctx.textAlign = 'left'
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(245,240,232,0.5)'
      ctx.fillText(label, x, y)
      let cx = x + ctx.measureText(label).width + 6
      ctx.fillStyle = color
      ctx.font = 'bold 12px monospace'
      const head = `${mantissa} × 10`
      ctx.fillText(head, cx, y)
      cx += ctx.measureText(head).width + 1
      ctx.font = 'bold 9px monospace'
      ctx.fillText(`${exponent}`, cx, y - 5)
      cx += ctx.measureText(`${exponent}`).width + 3
      ctx.font = 'bold 12px monospace'
      ctx.fillText('M', cx, y)
    },
    []
  )

  const drawPanel = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      title: string,
      color: string,
      count: number,
      over: boolean,
      phase: number
    ) => {
      ctx.fillStyle = 'rgba(245,240,232,0.03)'
      ctx.fillRect(x, PANEL_Y, PANEL_W, PANEL_H)
      ctx.strokeStyle = `${color}33`
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, PANEL_Y + 0.5, PANEL_W - 1, PANEL_H - 1)

      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = color
      ctx.fillText(title, x + 8, PANEL_Y + 15)

      const inner = { x: x + 8, y: PANEL_Y + 24, w: PANEL_W - 16, h: PANEL_H - 46 }
      for (let i = 0; i < count && i < DOT_SLOTS; i++) {
        const d = dots[i]
        const jx = animated ? Math.sin(phase + d.px) * 1.6 : 0
        const jy = animated ? Math.cos(phase * 0.9 + d.py) * 1.6 : 0
        const cx = inner.x + d.x * inner.w + jx
        const cy = inner.y + d.y * inner.h + jy
        const r = count > 400 ? 1.1 : count > 60 ? 1.7 : 2.6
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = count > 400 ? `${color}CC` : color
        ctx.fill()
      }

      ctx.font = '10px monospace'
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      const label = over
        ? `${MAX_DOTS}+ dots — off the panel`
        : `${count} dot${count === 1 ? '' : 's'}`
      ctx.fillText(label, x + 8, PANEL_Y + PANEL_H - 8)
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText('1 dot = 10⁻⁷ M', x + PANEL_W - 8, PANEL_Y + PANEL_H - 8)
      ctx.textAlign = 'left'
    },
    [dots, animated]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    const phase = phaseRef.current

    // --- pH scale bar -------------------------------------------------------
    for (let i = 0; i < BAR.w; i++) {
      ctx.fillStyle = scaleColor(((i / BAR.w) * 14))
      ctx.fillRect(BAR.x + i, BAR.y, 1, BAR.h)
    }
    ctx.strokeStyle = 'rgba(245,240,232,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(BAR.x + 0.5, BAR.y + 0.5, BAR.w - 1, BAR.h - 1)

    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    for (let v = 0; v <= 14; v++) {
      const x = xForPH(v)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(15,13,10,0.55)'
      ctx.moveTo(x, BAR.y)
      ctx.lineTo(x, BAR.y + BAR.h)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText(`${v}`, x, BAR.y + BAR.h + 12)
    }

    ctx.textAlign = 'left'
    ctx.fillStyle = C_ACID
    ctx.fillText('acidic', BAR.x, BAR.y - 8)
    ctx.textAlign = 'center'
    ctx.fillStyle = C_GREEN
    ctx.fillText('neutral (25 °C)', xForPH(7), BAR.y - 8)
    ctx.textAlign = 'right'
    ctx.fillStyle = C_BASE
    ctx.fillText('basic', BAR.x + BAR.w, BAR.y - 8)
    ctx.textAlign = 'left'

    // Blood band marker
    const bx0 = xForPH(7.35)
    const bx1 = xForPH(7.45)
    ctx.fillStyle = `${C_VIOLET}55`
    ctx.fillRect(bx0, BAR.y - 4, Math.max(1.5, bx1 - bx0), BAR.h + 8)

    // Marker
    const mx = xForPH(pH)
    ctx.beginPath()
    ctx.moveTo(mx, BAR.y + BAR.h + 16)
    ctx.lineTo(mx - 5, BAR.y + BAR.h + 25)
    ctx.lineTo(mx + 5, BAR.y + BAR.h + 25)
    ctx.closePath()
    ctx.fillStyle = '#F5F0E8'
    ctx.fill()
    ctx.beginPath()
    ctx.strokeStyle = '#F5F0E8'
    ctx.lineWidth = 1.5
    ctx.moveTo(mx, BAR.y - 2)
    ctx.lineTo(mx, BAR.y + BAR.h + 16)
    ctx.stroke()

    // --- readouts -----------------------------------------------------------
    ctx.font = 'bold 20px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = scaleColor(pH)
    ctx.fillText(`pH ${pH.toFixed(2)}`, PANEL_X_L, 102)

    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(exampleFor(pH), PANEL_X_L + 92, 102)

    drawSci(ctx, PANEL_X_R, 90, '[H⁺]', h, C_ACID)
    drawSci(ctx, PANEL_X_R, 108, '[OH⁻]', oh, C_BASE)

    // --- ion panels ---------------------------------------------------------
    drawPanel(ctx, PANEL_X_L, 'H⁺  (hydronium)', C_ACID, hDots, hOver, phase)
    drawPanel(ctx, PANEL_X_R, 'OH⁻ (hydroxide)', C_BASE, ohDots, ohOver, phase)

    // --- footer -------------------------------------------------------------
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('[H⁺][OH⁻] = Kw = 1.0 × 10⁻¹⁴  — every dot added on one side removes one from the other',
      PANEL_X_L, H - 8)

    const ratio = Math.pow(10, 7 - pH)
    ctx.textAlign = 'right'
    ctx.fillStyle = C_GOLD
    const rTxt =
      Math.abs(pH - 7) < 0.005
        ? 'same H⁺ as neutral water'
        : ratio > 1
          ? `${ratio >= 1000 ? ratio.toExponential(1) : ratio.toFixed(ratio < 10 ? 1 : 0)}× the H⁺ of neutral water`
          : `${(1 / ratio) >= 1000 ? (1 / ratio).toExponential(1) : (1 / ratio).toFixed(1 / ratio < 10 ? 1 : 0)}× less H⁺ than neutral water`
    ctx.fillText(rTxt, PANEL_X_R + PANEL_W, 120)
    ctx.textAlign = 'left'
  }, [pH, h, oh, hDots, ohDots, hOver, ohOver, xForPH, drawSci, drawPanel])

  useEffect(() => { draw() }, [draw, tick])

  useEffect(() => {
    if (!animated) return
    const loop = () => {
      phaseRef.current += 0.05
      setTick(t => (t + 1) % 1000000)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [animated])

  const pick = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W
    const v = Math.max(0, Math.min(14, phForX(x)))
    setPH(Math.round(v * 10) / 10)
  }

  const resetAll = () => {
    triggerReset()
    setPH(7)
  }

  const nudge = (delta: number) => setPH(p => Math.round(Math.max(0, Math.min(14, p + delta)) * 10) / 10)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The logarithmic pH scale, decade by decade</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full rounded-lg cursor-pointer"
          style={{ background: 'var(--color-canvas)' }}
          onClick={e => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>pH:</span>
          <input
            type="range" min={0} max={14} step={0.1} value={pH}
            onChange={e => setPH(+e.target.value)}
            className="w-40 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{pH.toFixed(1)}</span>
        </div>
        <button
          onClick={() => nudge(-1)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={{ color: C_ACID, borderColor: `${C_ACID}44`, background: `${C_ACID}12` }}
        >
          −1 pH (×10 H⁺)
        </button>
        <button
          onClick={() => nudge(1)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={{ color: C_BASE, borderColor: `${C_BASE}44`, background: `${C_BASE}12` }}
        >
          +1 pH (÷10 H⁺)
        </button>
        <button
          onClick={() => setPH(7.4)}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={{ color: C_VIOLET, borderColor: `${C_VIOLET}44`, background: `${C_VIOLET}12` }}
        >
          Blood, pH 7.4
        </button>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          [H⁺] = {h.toExponential(2)} M · [OH⁻] = {oh.toExponential(2)} M
        </span>
      </div>
    </div>
  )
}
