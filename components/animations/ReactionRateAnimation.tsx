'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 620
const H = 300

// Left panel: the molecular box. Right panel: the Maxwell-Boltzmann curve.
const BOX = { x: 10, y: 30, w: 282, h: 258 }
const PLOT = { x: 336, y: 44, w: 272, h: 202 }

const R_GAS = 8.314e-3 // kJ / (mol K)
const E_MAX = 60 // kJ/mol — right edge of the energy axis
const N_PARTICLES = 46
const P_RADIUS = 4.5
const T_REF = 300 // reference temperature for the relative-rate readout

const C_HOT = '#FB923C' // orange — accent, reactive tail
const C_GOLD = '#F59E0B' // gold — the activation-energy threshold
const C_COLD = '#60A5FA' // blue — molecules below the barrier
const C_VIOLET = '#A78BFA' // violet — distribution outline
const C_GREEN = '#10B981' // green — a successful reaction

type Particle = {
  x: number
  y: number
  dx: number
  dy: number
  e: number // molecular energy, kJ/mol
  flash: number // frames of post-reaction glow left
}

// Box-Muller: one standard normal.
function gauss(): number {
  let u = 0
  while (u === 0) u = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random())
}

// A 3-D Maxwell-Boltzmann energy sample is (RT/2) times a chi-square with 3
// degrees of freedom — the sum of three squared standard normals.
function sampleEnergy(T: number): number {
  const g1 = gauss()
  const g2 = gauss()
  const g3 = gauss()
  return (R_GAS * T * (g1 * g1 + g2 * g2 + g3 * g3)) / 2
}

// Unnormalised Maxwell-Boltzmann energy density: f(E) ∝ sqrt(E) e^(-E/RT).
const density = (E: number, T: number) => Math.sqrt(Math.max(E, 0)) * Math.exp(-E / (R_GAS * T))

// Pixels-per-frame speed for a molecule of energy E (speed ∝ sqrt of energy).
const speedFor = (e: number) => 0.62 * Math.sqrt(Math.max(e, 0.05))

function makeParticles(T: number): Particle[] {
  return Array.from({ length: N_PARTICLES }, () => {
    const e = sampleEnergy(T)
    const a = Math.random() * Math.PI * 2
    return {
      x: BOX.x + P_RADIUS + Math.random() * (BOX.w - 2 * P_RADIUS),
      y: BOX.y + P_RADIUS + Math.random() * (BOX.h - 2 * P_RADIUS),
      dx: Math.cos(a),
      dy: Math.sin(a),
      e,
      flash: 0,
    }
  })
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  temp: { default: 300, min: 200, max: 1000, step: 10 },
  ea: { default: 20, min: 10, max: 50, step: 1 },
}

export function ReactionRateAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const reactionsRef = useRef(0)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('reaction-rate', SPEC)
  const { temp, ea } = params
  const [reactions, setReactions] = useState(0)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  // Re-sample the speed distribution whenever the temperature changes; the
  // molecules keep their positions, they just get a new energy budget.
  useEffect(() => {
    const ps = particlesRef.current
    if (ps.length === 0) {
      particlesRef.current = makeParticles(temp)
    } else {
      ps.forEach(p => { p.e = sampleEnergy(temp) })
    }
  }, [temp])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const T = temp
    const Ea = ea

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // ---- Left panel: molecules in a box -------------------------------
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('molecules in a flask', BOX.x, BOX.y - 12)
    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h)

    particlesRef.current.forEach(p => {
      const energetic = p.e >= Ea
      if (p.flash > 0) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, P_RADIUS + 6 * (p.flash / 18), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(16,185,129,${(0.35 * p.flash) / 18})`
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, P_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = p.flash > 0 ? C_GREEN : energetic ? C_HOT : C_COLD
      ctx.fill()
    })

    const above = particlesRef.current.filter(p => p.e >= Ea).length
    ctx.fillStyle = C_HOT
    ctx.fillText(`${above}/${N_PARTICLES} above Eₐ`, BOX.x + 6, BOX.y + BOX.h - 10)

    // ---- Right panel: the Maxwell-Boltzmann energy distribution --------
    const px = (E: number) => PLOT.x + (E / E_MAX) * PLOT.w
    // Normalise to the current peak so the curve always fills the panel; the
    // shape (and where E_a falls on it) is the thing worth seeing.
    const peak = density((R_GAS * T) / 2, T) || 1
    const py = (f: number) => PLOT.y + PLOT.h - Math.min(f / peak, 1) * PLOT.h

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText('Maxwell–Boltzmann energy distribution', PLOT.x, PLOT.y - 26)
    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.fillText('relative number of molecules', PLOT.x, PLOT.y - 12)

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PLOT.x, PLOT.y)
    ctx.lineTo(PLOT.x, PLOT.y + PLOT.h)
    ctx.lineTo(PLOT.x + PLOT.w, PLOT.y + PLOT.h)
    ctx.stroke()
    for (let E = 0; E <= E_MAX; E += 15) {
      const x = px(E)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PLOT.y + PLOT.h)
      ctx.lineTo(x, PLOT.y + PLOT.h + 4)
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${E}`, x, PLOT.y + PLOT.h + 15)
      ctx.textAlign = 'left'
    }
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('molecular energy (kJ/mol) →', PLOT.x, H - 6)

    // Shaded reactive tail: everything at or beyond the barrier.
    ctx.beginPath()
    ctx.moveTo(px(Ea), PLOT.y + PLOT.h)
    for (let E = Ea; E <= E_MAX; E += 0.25) ctx.lineTo(px(E), py(density(E, T)))
    ctx.lineTo(px(E_MAX), PLOT.y + PLOT.h)
    ctx.closePath()
    ctx.fillStyle = `${C_HOT}66`
    ctx.fill()

    // The body of the distribution, below the barrier.
    ctx.beginPath()
    ctx.moveTo(px(0), PLOT.y + PLOT.h)
    for (let E = 0; E <= Ea; E += 0.25) ctx.lineTo(px(E), py(density(E, T)))
    ctx.lineTo(px(Ea), PLOT.y + PLOT.h)
    ctx.closePath()
    ctx.fillStyle = 'rgba(96,165,250,0.14)'
    ctx.fill()

    // Outline
    ctx.beginPath()
    ctx.strokeStyle = C_VIOLET
    ctx.lineWidth = 2
    for (let E = 0; E <= E_MAX; E += 0.25) {
      const x = px(E)
      const y = py(density(E, T))
      if (E === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Activation-energy threshold
    const xa = px(Ea)
    ctx.beginPath()
    ctx.strokeStyle = C_GOLD
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.moveTo(xa, PLOT.y - 4)
    ctx.lineTo(xa, PLOT.y + PLOT.h)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = C_GOLD
    ctx.textAlign = xa > PLOT.x + PLOT.w - 40 ? 'right' : 'left'
    ctx.fillText(`Eₐ = ${Ea}`, xa + (xa > PLOT.x + PLOT.w - 40 ? -4 : 4), PLOT.y - 6)
    ctx.textAlign = 'left'

    // Temperature stamp on the curve
    ctx.fillStyle = C_VIOLET
    ctx.fillText(`${T} K`, px((R_GAS * T) / 2) + 8, PLOT.y + 12)
  }, [temp, ea])

  // Redraw on any control change even while paused.
  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let frame = 0
    const Ea = ea
    const T = temp
    const tick = () => {
      const ps = particlesRef.current

      ps.forEach(p => {
        const s = speedFor(p.e)
        p.x += p.dx * s
        p.y += p.dy * s
        if (p.x < BOX.x + P_RADIUS) { p.x = BOX.x + P_RADIUS; p.dx = -p.dx }
        if (p.x > BOX.x + BOX.w - P_RADIUS) { p.x = BOX.x + BOX.w - P_RADIUS; p.dx = -p.dx }
        if (p.y < BOX.y + P_RADIUS) { p.y = BOX.y + P_RADIUS; p.dy = -p.dy }
        if (p.y > BOX.y + BOX.h - P_RADIUS) { p.y = BOX.y + BOX.h - P_RADIUS; p.dy = -p.dy }
        if (p.flash > 0) p.flash -= 1
      })

      // Pairwise encounters. A collision only turns into a reaction if at least
      // one partner arrives carrying more than E_a *and* the two meet in a
      // productive orientation — modelled here as a one-in-three chance.
      const hit = 2 * P_RADIUS + 1
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i]
          const b = ps[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          if (dx * dx + dy * dy > hit * hit) continue
          // Elastic-looking deflection so molecules do not stick together.
          const ang = Math.atan2(dy, dx)
          a.dx = Math.cos(ang); a.dy = Math.sin(ang)
          b.dx = -Math.cos(ang); b.dy = -Math.sin(ang)
          if (a.flash > 0 || b.flash > 0) continue
          if ((a.e >= Ea || b.e >= Ea) && Math.random() < 0.34) {
            a.flash = 18
            b.flash = 18
            reactionsRef.current += 1
            // Products leave and fresh reactants take their place.
            a.e = sampleEnergy(T)
            b.e = sampleEnergy(T)
          }
        }
      }

      draw()
      frame += 1
      if (frame % 8 === 0) setReactions(reactionsRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, draw, temp, ea])

  const resetAll = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    set('temp', 300)
    set('ea', 20)
    reactionsRef.current = 0
    setReactions(0)
    particlesRef.current = makeParticles(300)
    draw()
  }

  // Arrhenius: the rate relative to the same reaction at 300 K.
  const relRate = Math.exp(-ea / (R_GAS * temp)) / Math.exp(-ea / (R_GAS * T_REF))
  const relText =
    relRate >= 1000 || relRate < 0.001 ? relRate.toExponential(1) : relRate.toFixed(relRate < 10 ? 2 : 0)
  // Rate multiplier for a 10 K rise from the current temperature.
  const per10 = Math.exp((ea / R_GAS) * (1 / temp - 1 / (temp + 10)))

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Collisions, the Boltzmann tail, and temperature</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Temperature:</span>
          <input
            type="range" min={SPEC.temp.min} max={SPEC.temp.max} step={SPEC.temp.step} value={temp}
            onChange={e => set('temp', +e.target.value)}
            className="w-32 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{temp} K</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>E<sub>a</sub>:</span>
          <input
            type="range" min={SPEC.ea.min} max={SPEC.ea.max} step={SPEC.ea.step} value={ea}
            onChange={e => set('ea', +e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary font-mono">{ea} kJ/mol</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          <strong style={{ color: C_HOT }}>rate ×{relText}</strong> vs 300 K · +10 K → ×{per10.toFixed(2)} · {reactions} reactions
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Blue molecules carry less than the barrier energy; orange ones carry more. Collisions happen
        constantly, but only an energetic pair in a productive orientation reacts (green flash). Raising
        the temperature barely moves the peak of the distribution — what it does is fatten the
        <span style={{ color: C_HOT }}> shaded tail</span>, and the reaction rate follows the tail.
      </p>
    </div>
  )
}
