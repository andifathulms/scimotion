'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 340
const TANK_L = 60
const TANK_R = 360
const WATER_Y = 78
const BOTTOM_Y = 312
const CX = 200 // object centre x
const S = 64 // object side (px)
const G = 9.8 // m/s^2
const V_L = 1 // conceptual object volume, 1 litre

const EMERALD = '#10B981' // field accent — buoyancy (up)
const ORANGE = '#FB923C' // weight (down)
const WATER = '#38BDF8'
const STEEL = '#B8C0CC'

type Preset = { name: string; rho: number }
const FLUIDS: Preset[] = [
  { name: 'oil', rho: 0.92 },
  { name: 'fresh water', rho: 1.0 },
  { name: 'salt water', rho: 1.03 },
  { name: 'mercury', rho: 13.6 },
]

// Given densities, where does the object settle and what are the forces?
function solve(rhoObj: number, rhoFluid: number) {
  const weight = rhoObj * G * V_L // ∝ ρ_obj V g  (N, with 1 L)
  const neutral = Math.abs(rhoObj - rhoFluid) < 0.02 * rhoFluid
  let outcome: 'Floats' | 'Sinks' | 'Neutral'
  let submerged: number // fraction of volume below the surface
  if (neutral) {
    outcome = 'Neutral'
    submerged = 1
  } else if (rhoObj < rhoFluid) {
    outcome = 'Floats'
    submerged = rhoObj / rhoFluid // sinks until it displaces its own weight
  } else {
    outcome = 'Sinks'
    submerged = 1
  }
  const vDisp = submerged * V_L
  const buoy = rhoFluid * G * vDisp // ρ_fluid V_disp g
  return { weight, buoy, outcome, submerged, vDisp }
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rhoObj: { default: 0.5, min: 0.2, max: 15, step: 0.05 },
  rhoFluid: { default: 1.0, min: 0.3, max: 14, step: 0.05 },
}

export function BuoyancyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const yTopRef = useRef(WATER_Y - S) // animated top edge of object
  const dprRef = useRef(1)
  const runningRef = useRef(false)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('buoyancy', SPEC)
  const { rhoObj, rhoFluid } = params
  const rhoObjRef = useRef(0.5)
  const rhoFluidRef = useRef(1.0)
  useEffect(() => { rhoObjRef.current = rhoObj }, [rhoObj])
  useEffect(() => { rhoFluidRef.current = rhoFluid }, [rhoFluid])

  const [readout, setReadout] = useState(() => solve(0.5, 1.0))

  const targetTop = useCallback((sub: number, outcome: string) => {
    if (outcome === 'Sinks') return BOTTOM_Y - S
    if (outcome === 'Neutral') return (WATER_Y + BOTTOM_Y) / 2 - S / 2
    // floating: bottom sits `sub*S` below the waterline
    return WATER_Y - (1 - sub) * S
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = dprRef.current
    if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#0F0D0A'
    ctx.fillRect(0, 0, W, H)

    const rObj = rhoObjRef.current
    const rFl = rhoFluidRef.current
    const s = solve(rObj, rFl)
    const yTop = yTopRef.current

    // Tank walls
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(TANK_L, WATER_Y - 22)
    ctx.lineTo(TANK_L, BOTTOM_Y)
    ctx.lineTo(TANK_R, BOTTOM_Y)
    ctx.lineTo(TANK_R, WATER_Y - 22)
    ctx.stroke()

    // Fluid body (tint scales gently with density)
    const dark = Math.min(1, rFl / 13.6)
    const fluidCol = rFl > 5 ? '#94A3B8' : WATER
    ctx.fillStyle = fluidCol
    ctx.globalAlpha = 0.20 + 0.25 * dark
    ctx.fillRect(TANK_L, WATER_Y, TANK_R - TANK_L, BOTTOM_Y - WATER_Y)
    ctx.globalAlpha = 1

    // Waterline
    ctx.strokeStyle = fluidCol
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(TANK_L, WATER_Y); ctx.lineTo(TANK_R, WATER_Y); ctx.stroke()
    ctx.fillStyle = 'rgba(56,189,248,0.7)'
    ctx.font = '10px monospace'
    ctx.fillStyle = rFl > 5 ? 'rgba(148,163,184,0.9)' : 'rgba(56,189,248,0.9)'
    ctx.fillText('waterline', TANK_R - 66, WATER_Y - 6)

    // Object
    const objBottom = yTop + S
    const submergedPx = Math.max(0, Math.min(S, objBottom - WATER_Y))
    ctx.fillStyle = STEEL
    ctx.globalAlpha = 0.95
    ctx.fillRect(CX - S / 2, yTop, S, S)
    // Darken the submerged part
    if (submergedPx > 0) {
      ctx.fillStyle = 'rgba(15,13,10,0.28)'
      ctx.fillRect(CX - S / 2, objBottom - submergedPx, S, submergedPx)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(245,240,232,0.55)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(CX - S / 2, yTop, S, S)
    ctx.fillStyle = 'rgba(15,13,10,0.85)'
    ctx.font = '10px monospace'
    ctx.fillText('ρ=' + rObj.toFixed(2), CX - 22, yTop + S / 2 + 3)

    // Force arrows from object centre
    const oy = yTop + S / 2
    const scale = 5.2
    const arrow = (dy: number, color: string, label: string, side: number) => {
      const x = CX + side * 16
      const len = Math.max(10, Math.min(150, Math.abs(dy) * scale))
      const dir = Math.sign(dy)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 3.5
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + dir * len); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x, oy + dir * len)
      ctx.lineTo(x - 5, oy + dir * len - dir * 8)
      ctx.lineTo(x + 5, oy + dir * len - dir * 8)
      ctx.closePath(); ctx.fill()
      ctx.font = '10px monospace'
      ctx.fillText(label, x + side * 8 - (side < 0 ? 52 : 0), oy + dir * len / 2)
    }
    arrow(s.weight, ORANGE, 'weight', -1) // down (left of centre)
    arrow(-s.buoy, EMERALD, 'buoyancy', 1) // up (right of centre)

    // Force-balance bars on the right
    const bx = 428
    const by = 120
    const bmax = 150
    const fmax = Math.max(s.weight, s.buoy, 1)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('force balance (N)', bx, by - 12)
    const bar = (y: number, val: number, color: string, name: string) => {
      ctx.fillStyle = 'rgba(255,245,235,0.06)'
      ctx.fillRect(bx, y, bmax, 16)
      ctx.fillStyle = color
      ctx.fillRect(bx, y, Math.min(bmax, (val / fmax) * bmax), 16)
      ctx.fillStyle = 'rgba(245,240,232,0.8)'
      ctx.fillText(name, bx, y + 30)
      ctx.fillStyle = color
      ctx.fillText(val.toFixed(1), bx + bmax - 34, y + 12)
    }
    bar(by, s.buoy, EMERALD, 'buoyancy = ρ_fluid·V_disp·g')
    bar(by + 46, s.weight, ORANGE, 'weight = ρ_obj·V·g')

    // Outcome badge
    const oc = s.outcome
    const ocCol = oc === 'Floats' ? EMERALD : oc === 'Neutral' ? WATER : ORANGE
    ctx.fillStyle = ocCol
    ctx.font = 'bold 15px monospace'
    ctx.fillText(oc, bx, by + 122)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText('submerged ' + Math.round(s.submerged * 100) + '%', bx, by + 140)

    setReadout(s)
  }, [])

  useEffect(() => {
    dprRef.current = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1
  }, [])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        const s = solve(rhoObjRef.current, rhoFluidRef.current)
        yTopRef.current = targetTop(s.submerged, s.outcome)
        draw()
        return
      }
      runningRef.current = true
    },
  })

  // Continuous easing loop toward the settled position
  useEffect(() => {
    const loop = () => {
      if (runningRef.current) {
        const s = solve(rhoObjRef.current, rhoFluidRef.current)
        const target = targetTop(s.submerged, s.outcome)
        yTopRef.current += (target - yTopRef.current) * 0.12
        if (Math.abs(target - yTopRef.current) < 0.2) yTopRef.current = target
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, targetTop])

  const applyFluid = (rho: number) => { set('rhoFluid', rho); rhoFluidRef.current = rho; runningRef.current = true }

  const resetAll = () => {
    set('rhoObj', 0.5); rhoObjRef.current = 0.5
    set('rhoFluid', 1.0); rhoFluidRef.current = 1.0
    yTopRef.current = WATER_Y - S
    runningRef.current = true
    draw()
  }

  const ocColor = readout.outcome === 'Floats' ? EMERALD : readout.outcome === 'Neutral' ? WATER : ORANGE

  return (
    <div ref={ref} className="animation-block">
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Density decides</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: 210 }}>
        <canvas role="img" aria-label="Animated diagram: Density decides. Values are reported below the diagram." ref={canvasRef} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)', aspectRatio: `${W} / ${H}` }} />
      </div>

      <div className="px-3 py-2 rounded-lg bg-bg-surface border border-border text-xs font-mono text-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>ρ_obj = <span style={{ color: STEEL }}>{rhoObj.toFixed(2)}</span> g/cm³</span>
        <span>ρ_fluid = <span style={{ color: WATER }}>{rhoFluid.toFixed(2)}</span> g/cm³</span>
        <span style={{ color: EMERALD }}>F_buoy = {readout.buoy.toFixed(1)} N</span>
        <span style={{ color: ORANGE }}>F_weight = {readout.weight.toFixed(1)} N</span>
        <span>→ <strong style={{ color: ocColor }}>{readout.outcome}</strong></span>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Object density:</span>
          <input
            type="range" min={SPEC.rhoObj.min} max={SPEC.rhoObj.max} step={SPEC.rhoObj.step} value={rhoObj}
            onChange={ev => { set('rhoObj', +ev.target.value); rhoObjRef.current = +ev.target.value; runningRef.current = true }}
            className="w-32" style={{ accentColor: STEEL }}
          />
          <span className="text-text-secondary font-medium">{rhoObj.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Fluid density:</span>
          <input
            type="range" min={SPEC.rhoFluid.min} max={SPEC.rhoFluid.max} step={SPEC.rhoFluid.step} value={rhoFluid}
            onChange={ev => { set('rhoFluid', +ev.target.value); rhoFluidRef.current = +ev.target.value; runningRef.current = true }}
            className="w-32" style={{ accentColor: WATER }}
          />
          <span className="text-text-secondary font-medium">{rhoFluid.toFixed(2)}</span>
        </label>
      </div>

      <div className="animation-controls flex-wrap gap-3">
        <span className="text-xs text-text-muted">Fluid presets:</span>
        {FLUIDS.map(f => (
          <button
            key={f.name}
            onClick={() => applyFluid(f.rho)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-bg-surface border border-border text-text-secondary hover:bg-bg-hover"
          >
            {f.name} ({f.rho})
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-text-muted">
        Keep the object fixed at <strong className="text-text-secondary">ρ = 7.85</strong> (steel) and change the fluid:
        it <strong style={{ color: ORANGE }}>sinks</strong> in water but <strong style={{ color: EMERALD }}>floats</strong> in
        mercury. Weight never changed — only whether the fluid it displaces can out-weigh it. A floating object sinks in just far
        enough to displace <em>its own weight</em> of fluid.
      </p>
    </div>
  )
}
