'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 360

// The collapse. A stellar iron core (roughly Earth-sized, ~7000 km) collapses in
// under a second down to a neutron star only ~20 km across. Two things explode as
// it shrinks: the SPIN, because angular momentum L = Iω is conserved and I ∝ R²
// (so ω ∝ 1/R² — a skater pulling in their arms), and the DENSITY, which climbs
// to that of an atomic nucleus. A teaspoon of the result outweighs all humanity.

const M_SUN = 1.989e30
const CORE_MASS = 1.4 * M_SUN // kg
const R_I_KM = 7000 // iron-core radius before collapse (~Earth-sized)
const R_F_KM = 10 // neutron-star radius (~20 km across)
const F_I_HZ = 6.1e-4 // initial spin (~27-minute period), chosen so the final rate is realistic

const HUMANITY_KG = 8.1e9 * 62 // ~all humanity, for the teaspoon comparison
const TEASPOON_M3 = 5e-6 // 5 mL

const CX = 150 // collapse panel centre
const CY = 150
const R_BIG = 92 // on-screen radius of the un-collapsed core
const R_SMALL = 5 // on-screen radius at full collapse

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'
const CYAN = '#22D3EE'

// Physical radius (km) at collapse progress p in [0,1] — log interpolation.
const radiusKm = (p: number) => R_I_KM * Math.pow(R_F_KM / R_I_KM, p)
// Spin frequency (Hz): conservation of angular momentum, ω ∝ 1/R².
const spinHz = (p: number) => F_I_HZ * Math.pow(R_I_KM / radiusKm(p), 2)
// Mean density (kg/m³) = M / (4/3 π R³).
const densityKgM3 = (p: number) => {
  const rM = radiusKm(p) * 1000
  return CORE_MASS / ((4 / 3) * Math.PI * rM * rM * rM)
}
// On-screen radius (px): follow the log of the physical radius so the shrink is visible.
const screenRadius = (p: number) => {
  const lr = (Math.log10(radiusKm(p)) - Math.log10(R_F_KM)) / (Math.log10(R_I_KM) - Math.log10(R_F_KM))
  return R_SMALL + (R_BIG - R_SMALL) * lr
}

function fmtSpin(hz: number): string {
  if (hz >= 1) return `${Math.round(hz)} Hz`
  const periodS = 1 / hz
  if (periodS >= 60) return `1 turn / ${Math.round(periodS / 60)} min`
  return `1 turn / ${periodS.toFixed(1)} s`
}
function fmtPeriod(hz: number): string {
  const ms = 1000 / hz
  if (ms < 1000) return `${ms.toFixed(1)} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.round(ms / 60000)} min`
}
// Density as a tidy "×10ⁿ" string.
function fmtDensity(rho: number): string {
  const e = Math.floor(Math.log10(rho))
  const mant = rho / Math.pow(10, e)
  return `${mant.toFixed(1)}e${e} kg/m³`
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  p: { default: 0, min: 0, max: 1, step: 0.001 },
}

export function NeutronStarDensityAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number | null>(null)

  const pRef = useRef(0) // collapse progress 0..1
  const spinPhaseRef = useRef(0)
  const dirRef = useRef<1 | 0>(0) // 1 = collapsing, 0 = paused/idle

  const { params, set, permalink, isDefault, restored } = useWidgetParams('neutron-star-density', SPEC)
  const { p } = params
  const [running, setRunning] = useState(false)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'

    const prog = pRef.current
    const rKm = radiusKm(prog)
    const hz = spinHz(prog)
    const rho = densityKgM3(prog)
    const rPx = screenRadius(prog)

    // ---- collapse panel: faint outline of the original size ----
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.setLineDash([3, 4])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(CX, CY, R_BIG, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.textAlign = 'center'
    ctx.fillText('original core (~7000 km)', CX, CY + R_BIG + 20)

    // ---- the collapsing body ----
    const col = prog < 0.5 ? BLUE : prog < 0.85 ? VIOLET : ACCENT
    const glow = ctx.createRadialGradient(CX, CY, 1, CX, CY, rPx + 14)
    glow.addColorStop(0, col + 'cc')
    glow.addColorStop(1, col + '00')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(CX, CY, rPx + 14, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = col
    ctx.beginPath(); ctx.arc(CX, CY, rPx, 0, Math.PI * 2); ctx.fill()

    // spin markers on the body — a few dots that whirl faster as it shrinks
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let k = 0; k < 3; k++) {
      const a = spinPhaseRef.current + (k / 3) * Math.PI * 2
      const rr = rPx * 0.66
      ctx.beginPath()
      ctx.arc(CX + rr * Math.cos(a), CY + rr * Math.sin(a), Math.max(1.5, rPx * 0.09), 0, Math.PI * 2)
      ctx.fill()
    }
    // curved spin arrows around the body
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    const ar = rPx + 12
    for (let s = 0; s < 2; s++) {
      const a0 = spinPhaseRef.current + s * Math.PI
      ctx.beginPath(); ctx.arc(CX, CY, ar, a0, a0 + 1.1); ctx.stroke()
      const ae = a0 + 1.1
      const hx = CX + ar * Math.cos(ae)
      const hy = CY + ar * Math.sin(ae)
      const tx = -Math.sin(ae)
      const ty = Math.cos(ae)
      ctx.beginPath()
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx - 6 * tx + 3 * Math.cos(ae), hy - 6 * ty + 3 * Math.sin(ae))
      ctx.moveTo(hx, hy)
      ctx.lineTo(hx - 6 * tx - 3 * Math.cos(ae), hy - 6 * ty - 3 * Math.sin(ae))
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(245,240,232,0.6)'
    ctx.fillText(prog >= 0.99 ? 'neutron star (~20 km across)' : 'collapsing…', CX, 26)
    ctx.textAlign = 'left'

    // ---- readout panel (right) ----
    const PX = 300
    // radius
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('radius', PX, 40)
    ctx.fillStyle = CYAN
    ctx.font = 'bold 16px monospace'
    ctx.fillText(rKm >= 100 ? `${Math.round(rKm).toLocaleString()} km` : `${rKm.toFixed(1)} km`, PX, 60)
    ctx.font = '10px monospace'

    // spin
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('spin  (L = Iω conserved, ω ∝ 1/R²)', PX, 92)
    ctx.fillStyle = GOLD
    ctx.font = 'bold 16px monospace'
    ctx.fillText(fmtSpin(hz), PX, 112)
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText(`rotation period ≈ ${fmtPeriod(hz)}`, PX, 128)

    // density with a log bar climbing toward nuclear density
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('mean density', PX, 160)
    ctx.fillStyle = PINK
    ctx.font = 'bold 16px monospace'
    ctx.fillText(fmtDensity(rho), PX, 180)
    ctx.font = '10px monospace'

    // log bar from water (1e3) to well past nuclear (1e18)
    const barX = PX
    const barY = 192
    const barW = 250
    const logLo = 3
    const logHi = 18
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(barX, barY, barW, 12)
    const frac = clamp01((Math.log10(rho) - logLo) / (logHi - logLo))
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0)
    grad.addColorStop(0, BLUE)
    grad.addColorStop(1, PINK)
    ctx.fillStyle = grad
    ctx.fillRect(barX, barY, barW * frac, 12)
    // nuclear-density mark (~2.3e17)
    const nucFrac = (Math.log10(2.3e17) - logLo) / (logHi - logLo)
    const nx = barX + barW * nucFrac
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(nx, barY - 3); ctx.lineTo(nx, barY + 15); ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.fillText('nuclear density', nx - 74, barY - 6)
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText('water', barX - 2, barY + 26)
    ctx.textAlign = 'right'
    ctx.fillText('nucleus', barX + barW, barY + 26)
    ctx.textAlign = 'left'

    // ---- the teaspoon comparison ----
    const teaspoonKg = rho * TEASPOON_M3
    const times = teaspoonKg / HUMANITY_KG
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('one teaspoon of it would weigh', PX, 254)
    ctx.fillStyle = teaspoonKg > 1e9 ? GOLD : 'rgba(245,240,232,0.6)'
    ctx.font = 'bold 15px monospace'
    ctx.fillText(fmtMass(teaspoonKg), PX, 274)
    ctx.font = '10px monospace'
    if (times >= 1) {
      ctx.fillStyle = PINK
      ctx.fillText(`≈ ${times < 10 ? times.toFixed(1) : Math.round(times)}× the mass of all humanity`, PX, 292)
    } else {
      ctx.fillStyle = 'rgba(245,240,232,0.45)'
      ctx.fillText('(still an ordinary amount — keep collapsing)', PX, 292)
    }

    // teaspoon icon
    const sx = PX - 34
    const sy = 268
    ctx.strokeStyle = 'rgba(245,240,232,0.55)'
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.ellipse(sx, sy, 10, 6, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(sx + 9, sy - 3); ctx.lineTo(sx + 24, sy - 14); ctx.stroke()
    if (teaspoonKg > 1e9) {
      ctx.fillStyle = ACCENT
      ctx.beginPath(); ctx.ellipse(sx, sy, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill()
    }

    // ---- collapse progress footer ----
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.fillText(`collapse ${Math.round(prog * 100)}%`, PX, 320)
  }, [])

  const advance = useCallback((dt: number) => {
    if (dirRef.current === 1) {
      pRef.current = Math.min(1, pRef.current + dt * 0.28)
      if (pRef.current >= 1) { dirRef.current = 0; setRunning(false) }
      set('p', pRef.current)
    }
    // spin faster as it shrinks; visual rate capped so it stays watchable
    const visRate = 1.2 + pRef.current * pRef.current * 13
    spinPhaseRef.current += dt * visRate
  }, [set])

  useEffect(() => { render() }, [render])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (now: number) => {
      if (lastRef.current === null) lastRef.current = now
      const dt = Math.min(48, now - lastRef.current) / 1000
      lastRef.current = now
      advance(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, advance, render])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        pRef.current = 1
        set('p', 1)
        render()
        return
      }
      dirRef.current = 1
      setRunning(true)
    },
  })

  const collapse = () => {
    if (pRef.current >= 1) { pRef.current = 0; set('p', 0) }
    dirRef.current = 1
    setRunning(true)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    dirRef.current = 0
    pRef.current = 0
    spinPhaseRef.current = 0
    lastRef.current = null
    set('p', 0)
    render()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Collapse to nuclear density</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Collapse to nuclear density. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => (running ? setRunning(false) : collapse())}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: ACCENT, color: '#0F0D0A' }}
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> {p >= 1 ? 'Collapse again' : 'Collapse the core'}</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Scrub:</span>
          <input
            type="range" min={SPEC.p.min} max={SPEC.p.max} step={SPEC.p.step} value={p}
            onChange={ev => { const v = +ev.target.value; pRef.current = v; set('p', v); dirRef.current = 0; setRunning(false); render() }}
            className="w-40"
            style={{ accentColor: ACCENT }}
          />
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          collapse <strong className="font-mono" style={{ color: ACCENT }}>{Math.round(p * 100)}%</strong>
        </WidgetStatus>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Watch three quantities run away together as the core shrinks from Earth-sized to a ~20 km ball. Because angular
        momentum is conserved and the moment of inertia falls as <strong>R²</strong>, the spin soars from one turn every
        few minutes to <strong>hundreds of turns a second</strong> — a skater pulling in their arms. The density climbs
        past that of an atomic <strong>nucleus</strong>, until a single teaspoon outweighs all of humanity. Scrub slowly
        to see just how sudden the last factor of two in size is.
      </p>
    </div>
  )
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function fmtMass(kg: number): string {
  const tonnes = kg / 1000
  if (tonnes >= 1e9) return `${(tonnes / 1e9).toFixed(1)} billion tonnes`
  if (tonnes >= 1e6) return `${(tonnes / 1e6).toFixed(1)} million tonnes`
  if (tonnes >= 1e3) return `${(tonnes / 1e3).toFixed(1)} thousand tonnes`
  if (tonnes >= 1) return `${Math.round(tonnes)} tonnes`
  return `${Math.round(kg)} kg`
}
