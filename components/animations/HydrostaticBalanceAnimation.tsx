'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300
const CX = 220
const CY = 150
const R0 = 74 // pixel radius at equilibrium (r = 1)

const INDIGO = '#818CF8'
const GOLD = '#F59E0B'
const PINK = '#F472B6'
const BLUE = '#60A5FA'
const CYAN = '#22D3EE'

// A reduced model of a self-gravitating gas shell.
//   outward (pressure) force  ∝ dial / r^3   (fusion boost; compression heats & pressurizes)
//   inward  (gravity)  force  ∝ 1 / r^2
// Equilibrium where the two match: dial/r^3 = 1/r^2  ⇒  r = dial.
// The restoring slope there is negative, so the star oscillates back — a thermostat.
function forces(r: number, dial: number) {
  const rc = Math.max(0.05, r)
  const pressure = dial / (rc * rc * rc)
  const gravity = 1 / (rc * rc)
  return { pressure, gravity, net: pressure - gravity }
}

// Colour of the gas by temperature (T ∝ 1/r): compressed = hot/blue, puffed = cool/red.
function shellColor(r: number): string {
  if (r < 0.6) return BLUE
  if (r < 0.9) return CYAN
  if (r < 1.15) return GOLD
  if (r < 1.6) return '#FB923C'
  return PINK
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  dial: { default: 1, min: 0, max: 2, step: 0.01 },
}

export function HydrostaticBalanceAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => { if (!reduced) setRunning(true) },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const rRef = useRef(1) // relative radius
  const vRef = useRef(0) // radial velocity
  const lastRef = useRef<number | null>(null)

  const { params, set, permalink, isDefault, restored } = useWidgetParams('hydrostatic-balance', SPEC)
  const { dial } = params
  const [running, setRunning] = useState(false)
  const [readout, setReadout] = useState({ r: 1, T: 1, state: 'Balanced' })
  const dialRef = useRef(1)
  useEffect(() => { dialRef.current = dial }, [dial])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const r = rRef.current
    const d = dialRef.current
    const { pressure, gravity } = forces(r, d)
    const collapsing = d < 0.12
    const R = Math.max(3, R0 * r)
    const col = collapsing ? '#3a3a44' : shellColor(r)

    // Faint grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // Equilibrium reference ring (where the star would settle for this dial)
    const rEq = collapsing ? 0 : d
    if (!collapsing) {
      ctx.strokeStyle = 'rgba(129,140,248,0.35)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(CX, CY, R0 * rEq, 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(129,140,248,0.6)'
      ctx.font = '9px monospace'
      ctx.fillText('equilibrium', CX + R0 * rEq - 30, CY - R0 * rEq - 6)
    }

    // The star: radial gradient body
    const g = ctx.createRadialGradient(CX, CY, 2, CX, CY, R)
    g.addColorStop(0, col + 'ee')
    g.addColorStop(0.7, col + '99')
    g.addColorStop(1, col + '22')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fill()

    // A highlighted shell element (top of the star) that the forces act on
    const shellAng = -Math.PI / 2
    const sx = CX + R * Math.cos(shellAng)
    const sy = CY + R * Math.sin(shellAng)
    ctx.fillStyle = 'rgba(245,240,232,0.9)'
    ctx.strokeStyle = 'rgba(245,240,232,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.rect(sx - 10, sy - 5, 20, 10); ctx.fill(); ctx.stroke()

    // Force arrows on that shell element: gravity inward (pink), pressure outward (indigo)
    const arrow = (x0: number, y0: number, dy: number, color: string, label: string) => {
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 + dy); ctx.stroke()
      const dir = Math.sign(dy)
      ctx.beginPath()
      ctx.moveTo(x0, y0 + dy)
      ctx.lineTo(x0 - 5, y0 + dy - dir * 7)
      ctx.lineTo(x0 + 5, y0 + dy - dir * 7)
      ctx.closePath(); ctx.fill()
      ctx.font = '10px monospace'
      ctx.fillText(label, x0 + 10, y0 + dy / 2)
    }
    const scale = 42
    // gravity pulls the shell down (inward, +y); pressure pushes it up (outward, -y)
    arrow(sx - 16, sy, Math.min(70, gravity * scale), PINK, 'gravity')
    arrow(sx + 16, sy, -Math.min(70, pressure * scale), INDIGO, 'pressure')

    // Core marker + collapse cue
    if (collapsing) {
      ctx.fillStyle = '#050505'
      ctx.beginPath(); ctx.arc(CX, CY, Math.max(2, R * 0.4), 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = INDIGO; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // Force-balance bars on the right
    const bx = 470, by0 = 60, bmax = 70
    ctx.font = '10px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('force balance', bx, by0 - 12)
    const bar = (y: number, val: number, color: string, name: string) => {
      const len = Math.min(bmax, val * 24)
      ctx.fillStyle = 'rgba(255,245,235,0.06)'
      ctx.fillRect(bx, y, bmax, 14)
      ctx.fillStyle = color
      ctx.fillRect(bx, y, len, 14)
      ctx.fillStyle = 'rgba(245,240,232,0.7)'
      ctx.fillText(name, bx + bmax + 6, y + 11)
    }
    bar(by0, gravity, PINK, 'gravity')
    bar(by0 + 26, pressure, INDIGO, 'pressure')

    // Temperature readout bar (T ∝ 1/r)
    const T = 1 / Math.max(0.05, r)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('core temp ∝ 1/R', bx, by0 + 74)
    ctx.fillStyle = 'rgba(255,245,235,0.06)'
    ctx.fillRect(bx, by0 + 82, bmax, 14)
    ctx.fillStyle = GOLD
    ctx.fillRect(bx, by0 + 82, Math.min(bmax, T * 30), 14)

    // Legend
    ctx.fillStyle = 'rgba(245,240,232,0.4)'
    ctx.font = '10px monospace'
    ctx.fillText('R = ' + r.toFixed(2) + ' R_eq₀', 14, H - 14)

    const state = collapsing
      ? 'Fusion off — collapse'
      : Math.abs(pressure - gravity) < 0.04 && Math.abs(vRef.current) < 0.01
        ? 'Balanced'
        : pressure > gravity ? 'Expanding & cooling' : 'Contracting & heating'
    setReadout({ r, T, state })
  }, [])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { lastRef.current = null; cancelAnimationFrame(rafRef.current); return }
    const loop = (t: number) => {
      if (lastRef.current === null) lastRef.current = t
      const dtMs = Math.min(48, t - lastRef.current)
      lastRef.current = t
      const steps = 3
      const dt = (dtMs / 1000) * 6 / steps
      const d = dialRef.current
      for (let i = 0; i < steps; i++) {
        const r = rRef.current
        if (d < 0.12) {
          // fusion has failed: no pressure support, run away inward
          vRef.current -= 2.2 * dt
        } else {
          const { net } = forces(r, d)
          vRef.current += net * dt
          vRef.current *= 0.90 // damping so it settles
        }
        rRef.current = Math.max(0.04, Math.min(3, r + vRef.current * dt))
        if (rRef.current <= 0.05 && d < 0.12) { vRef.current = 0 }
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    rRef.current = 1; vRef.current = 0; lastRef.current = null
    set('dial', 1); dialRef.current = 1
    draw()
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The stellar thermostat</span>
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
          <Play size={12} /> {running ? 'Pause' : 'Play'}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Fusion rate:</span>
          <input
            type="range" min={SPEC.dial.min} max={SPEC.dial.max} step={SPEC.dial.step} value={dial}
            onChange={ev => set('dial', +ev.target.value)}
            className="w-36"
            style={{ accentColor: INDIGO }}
          />
          <span className="text-text-secondary font-medium">{dial.toFixed(2)}×</span>
        </label>
        <span className="ml-auto text-xs text-text-secondary">
          <strong style={{ color: readout.state.startsWith('Fusion off') ? PINK : readout.state === 'Balanced' ? INDIGO : GOLD }}>
            {readout.state}
          </strong>
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Nudge fusion <strong className="text-text-secondary">up</strong> and the star expands and cools until fusion falls back;
        nudge it <strong className="text-text-secondary">down</strong> and it contracts and heats until fusion climbs back —
        a self-correcting balance. Drag the dial near <strong style={{ color: PINK }}>zero</strong> and, with nothing holding
        pressure up, gravity wins and the core collapses.
      </p>
    </div>
  )
}
