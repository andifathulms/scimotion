'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 320
const SUN_X = 70
const AXIS_Y = 250
const PLOT_LEFT = 70
const PLOT_RIGHT = 560

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const CYAN = '#22D3EE'
const GREEN = '#10B981'

// Disk temperature falls with distance from the star (roughly T ∝ d^-0.5).
// Map the x-axis to a distance 0..1 and give a temperature in kelvin.
const T_INNER = 1400 // K, close to the star
const FROST_T = 160  // K, water-ice condensation, ~ the real snow-line temp
function tempAt(frac: number): number {
  // frac in 0..1 across the disk; smooth falloff
  return T_INNER * Math.pow(0.06 + frac, -0.5) * 0.42 + 40
}

// Deterministic seeded RNG so the dust field is stable between frames.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
const rng = makeRng(0xf0570123)

type Grain = { frac: number; y: number; size: number; ice: boolean; ang: number }
const GRAINS: Grain[] = Array.from({ length: 220 }, () => {
  const frac = rng()
  return {
    frac,
    y: (rng() - 0.5) * 2, // -1..1 offset within disk thickness
    size: 0.8 + rng() * 1.4,
    ice: rng() < 0.62, // most volatiles freeze only beyond the frost line
    ang: rng() * Math.PI * 2,
  }
}).sort((a, b) => a.frac - b.frac)

function xOf(frac: number) { return PLOT_LEFT + frac * (PLOT_RIGHT - PLOT_LEFT) }

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  frost: { default: 0.42, min: 0.2, max: 0.7, step: 0.01 },
}

export function FrostLineAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const lastRef = useRef<number | null>(null)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('frost-line', SPEC)
  const { frost } = params

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const fx = xOf(frost)
    const halfThick = 26

    // Warm inner / cold outer shaded bands
    ctx.fillStyle = 'rgba(245,158,11,0.06)'
    ctx.fillRect(PLOT_LEFT, 40, fx - PLOT_LEFT, AXIS_Y - 40)
    ctx.fillStyle = 'rgba(96,165,250,0.07)'
    ctx.fillRect(fx, 40, PLOT_RIGHT - fx, AXIS_Y - 40)

    // Disk midplane band
    ctx.fillStyle = 'rgba(129,140,248,0.05)'
    ctx.fillRect(PLOT_LEFT, AXIS_Y - halfThick, PLOT_RIGHT - PLOT_LEFT, halfThick * 2)

    // Grains: rock/metal everywhere; ices only condense beyond the frost line.
    for (const g of GRAINS) {
      const gx = xOf(g.frac)
      if (gx < PLOT_LEFT + 4) continue
      const wobble = Math.sin(time * 1.4 + g.ang) * 2
      const gy = AXIS_Y + g.y * halfThick + wobble
      const beyond = g.frac >= frost
      const condensed = g.ice ? beyond : true // ice grains only exist past frost line
      const color = g.ice ? (beyond ? CYAN : null) : GOLD
      if (!condensed || color === null) continue
      ctx.globalAlpha = 0.45 + 0.4 * (1 - Math.abs(g.y))
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(gx, gy, g.size, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1

    // Representative planets: small rocky inside, giants outside.
    const rocky = [
      { frac: 0.16, r: 4, color: GOLD },
      { frac: 0.28, r: 5, color: '#FB923C' },
    ]
    const giants = [
      { frac: 0.58, r: 15, color: GOLD },
      { frac: 0.76, r: 12, color: CYAN },
      { frac: 0.92, r: 10, color: BLUE },
    ]
    for (const pl of rocky) {
      const px = xOf(pl.frac)
      const inside = pl.frac < frost
      ctx.globalAlpha = inside ? 1 : 0.25
      ctx.fillStyle = pl.color
      ctx.beginPath(); ctx.arc(px, AXIS_Y, pl.r, 0, Math.PI * 2); ctx.fill()
    }
    for (const pl of giants) {
      const px = xOf(pl.frac)
      const outside = pl.frac >= frost
      // A giant can only grow beyond the frost line; dim it if the line moved past it.
      ctx.globalAlpha = outside ? 1 : 0.2
      const g = ctx.createRadialGradient(px, AXIS_Y, 2, px, AXIS_Y, pl.r + 6)
      g.addColorStop(0, pl.color + 'cc'); g.addColorStop(1, pl.color + '00')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(px, AXIS_Y, pl.r + 6, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = pl.color
      ctx.beginPath(); ctx.arc(px, AXIS_Y, pl.r, 0, Math.PI * 2); ctx.fill()
      // subtle ring on the largest
      if (pl.r >= 14) {
        ctx.globalAlpha = outside ? 0.6 : 0.15
        ctx.strokeStyle = 'rgba(245,240,232,0.5)'
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.ellipse(px, AXIS_Y, pl.r + 8, 4, 0, 0, Math.PI * 2); ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // The Sun
    const sg = ctx.createRadialGradient(SUN_X, AXIS_Y, 2, SUN_X, AXIS_Y, 30)
    sg.addColorStop(0, 'rgba(245,158,11,0.6)'); sg.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = sg
    ctx.beginPath(); ctx.arc(SUN_X, AXIS_Y, 30, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = GOLD
    ctx.beginPath(); ctx.arc(SUN_X, AXIS_Y, 11, 0, Math.PI * 2); ctx.fill()

    // Frost-line marker
    ctx.strokeStyle = CYAN
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath(); ctx.moveTo(fx, 44); ctx.lineTo(fx, AXIS_Y + 40); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = CYAN
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('FROST LINE', fx, 36)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(34,211,238,0.85)'
    ctx.fillText(`~${FROST_T} K`, fx, AXIS_Y + 54)

    // Region labels
    ctx.textAlign = 'center'
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,158,11,0.85)'
    ctx.fillText('inside: rock & metal only', (PLOT_LEFT + fx) / 2, 60)
    ctx.fillStyle = 'rgba(96,165,250,0.9)'
    ctx.fillText('outside: + ices → giants', (fx + PLOT_RIGHT) / 2, 60)
    ctx.font = '9px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('small rocky worlds', (PLOT_LEFT + fx) / 2, AXIS_Y + 34)
    ctx.fillText('gas & ice giants', (fx + PLOT_RIGHT) / 2, AXIS_Y + 34)
    ctx.textAlign = 'left'

    // Temperature curve across the top
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    for (let i = 0; i <= 60; i++) {
      const frac = i / 60
      const x = xOf(frac)
      const T = tempAt(frac)
      const y = 200 - (T / T_INNER) * 150
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // frost temperature reference line
    const yFrost = 200 - (FROST_T / T_INNER) * 150
    ctx.strokeStyle = 'rgba(34,211,238,0.35)'
    ctx.setLineDash([3, 4])
    ctx.beginPath(); ctx.moveTo(PLOT_LEFT, yFrost); ctx.lineTo(PLOT_RIGHT, yFrost); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.font = '9px monospace'
    ctx.fillText('disk temperature', PLOT_LEFT + 4, 90)

    // axis
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PLOT_LEFT, AXIS_Y + 40); ctx.lineTo(PLOT_RIGHT, AXIS_Y + 40); ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('distance from the Sun →', PLOT_RIGHT - 150, AXIS_Y + 66)
  }, [frost])

  useEffect(() => { draw(tRef.current) }, [draw])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dt = Math.min(64, t - lastRef.current)
      lastRef.current = t
      tRef.current += dt / 1000
      draw(tRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset(); setRunning(false)
    tRef.current = 0; lastRef.current = null
    set('frost', 0.42); draw(0)
  }

  const frostTemp = Math.round(tempAt(frost))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The frost line &amp; two kinds of planet</span>
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
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-bg-base text-xs font-medium transition-colors"
          style={{ background: INDIGO }}
        >
          <Play size={12} /> {running ? 'Pause drift' : 'Animate dust'}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Frost line:</span>
          <input
            type="range" min={SPEC.frost.min} max={SPEC.frost.max} step={SPEC.frost.step} value={frost}
            onChange={ev => set('frost', +ev.target.value)}
            className="w-40"
            style={{ accentColor: CYAN }}
          />
          <span className="text-text-secondary font-medium">disk temp here ≈ {frostTemp} K</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          <strong style={{ color: GOLD }}>rock</strong> condenses everywhere · <strong style={{ color: CYAN }}>ice</strong> only past the line
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Slide the frost line: worlds forming <strong style={{ color: GOLD }}>inside</strong> it stay small and rocky; only <strong style={{ color: GREEN }}>outside</strong> it, where ices condense, do cores grow big enough to capture gas and become giants.
      </p>
    </div>
  )
}
