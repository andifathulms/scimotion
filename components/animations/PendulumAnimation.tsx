'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'
import { EquationReadout } from '@/components/EquationReadout'

const W = 600
const H = 280
const PIVOT_X = W / 2
const PIVOT_Y = 40
const DT = 0.016

// Length is a real length, in metres, and it is the same L in three places: the
// integrator, the period formula, and the article's prose. It used to be a
// pixel count. The integrator fed those pixels straight into g/L, so it swung
// as though the rod were 160 METRES long, while the readout divided by 1000 to
// present the same number as 0.16 m — two different unit conventions in one
// component, 33x apart. The pendulum you watched took 26 seconds a swing while
// the number beside it said 0.80 s.
//
// The drawing scale is now a separate concern: metres map onto a fixed pixel
// span so the bob stays on the canvas at any length. The article says a
// 1-metre pendulum has a period of about 2 seconds; the reader can now dial
// exactly that and time it.
const L_MIN = 0.2
const L_MAX = 2.0
const PX_MIN = 60
const PX_MAX = 220
const toPixels = (metres: number) =>
  PX_MIN + ((metres - L_MIN) / (L_MAX - L_MIN)) * (PX_MAX - PX_MIN)

// Module scope, not inline: an object literal in the render body is a new
// reference on every frame of a running simulation, which defeats the memos in
// useWidgetParams. Symbols match the equation in the article body.
const SPEC = {
  // 175°, not 85°. Every large-amplitude claim in the article — ~18% long at
  // 90°, diverging at 180° — sat outside the old ceiling, so the paragraph and
  // the widget underneath it described different ranges.
  initAngle: { default: 60, min: 5, max: 175, step: 1, symbol: 'θ₀', unit: '°' },
  length: { default: 1, min: L_MIN, max: L_MAX, step: 0.05, symbol: 'L', unit: 'm' },
  gravity: { default: 9.81, min: 1, max: 20, step: 0.5, symbol: 'g', unit: 'm/s²' },
  // Mass exists so that moving it does nothing. The article's least intuitive
  // claim is that the period is independent of mass, and the widget previously
  // gave a reader arriving with the opposite intuition no way to find out they
  // were wrong. A null result is only teachable if the control exists.
  mass: { default: 1, min: 0.1, max: 10, step: 0.1, symbol: 'm', unit: 'kg' },
  // Damping was already running at a fixed 0.9995 per step, unmentioned. The
  // article devotes a section to it. b = 0 is now reachable, which is the only
  // setting where "energy is conserved" is literally true.
  damping: { default: 0.5, min: 0, max: 3, step: 0.1, symbol: 'b' },
}

// Per-step velocity retention. b is a friendlier scale than the raw factor:
// b = 0 is frictionless, b = 0.5 reproduces the old fixed 0.9995.
const retention = (b: number) => 1 - b * 0.001

// Exact period / small-angle period, via the arithmetic-geometric mean — the
// standard closed form for the complete elliptic integral K(k) that the article
// quotes. Used to state the size of the approximation's error at the angle the
// reader has actually chosen, rather than leaving "breaks down" unquantified.
function exactRatio(deg: number): number {
  const k = Math.sin((deg * Math.PI) / 360)
  let a = 1
  let b = Math.sqrt(1 - k * k)
  for (let i = 0; i < 40; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]
  return 1 / a
}

export function PendulumAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const stateRef = useRef({ angle: Math.PI / 3, omega: 0, trail: [] as { x: number; y: number }[] })

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('pendulum', SPEC)
  const { initAngle, length, gravity, mass, damping } = params
  const [, setEnergy] = useState({ ke: 0, pe: 1 })

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)

    const { angle, trail } = stateRef.current
    // Drawing length, not physical length — see the note by L_MIN.
    const L = toPixels(length)
    const L_m = length
    const bobX = PIVOT_X + L * Math.sin(angle)
    const bobY = PIVOT_Y + L * Math.cos(angle)

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.04)'
    ctx.lineWidth = 1
    for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke() }
    for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }

    // Trail
    if (trail.length > 1) {
      ctx.beginPath()
      trail.forEach((p, i) => {
        const alpha = i / trail.length
        ctx.strokeStyle = `rgba(245,158,11,${alpha * 0.5})`
        ctx.lineWidth = 1.5
        if (i === 0) ctx.moveTo(p.x, p.y)
        else {
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
        }
      })
    }

    // Rod
    ctx.beginPath()
    ctx.moveTo(PIVOT_X, PIVOT_Y)
    ctx.lineTo(bobX, bobY)
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Pivot
    ctx.beginPath()
    ctx.arc(PIVOT_X, PIVOT_Y, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fill()

    // Bob
    ctx.beginPath()
    ctx.arc(bobX, bobY, 14, 0, Math.PI * 2)
    const grad = ctx.createRadialGradient(bobX - 4, bobY - 4, 2, bobX, bobY, 14)
    grad.addColorStop(0, '#FB923C')
    grad.addColorStop(1, '#F59E0B')
    ctx.fillStyle = grad
    ctx.fill()

    // Equilibrium line
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.setLineDash([4, 4])
    ctx.moveTo(PIVOT_X, PIVOT_Y)
    ctx.lineTo(PIVOT_X, PIVOT_Y + L + 20)
    ctx.stroke()
    ctx.setLineDash([])

    // Angle arc
    ctx.beginPath()
    ctx.arc(PIVOT_X, PIVOT_Y, 30, Math.PI / 2, Math.PI / 2 + angle, angle < 0)
    ctx.strokeStyle = 'rgba(167,139,250,0.5)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = 'rgba(167,139,250,0.6)'
    ctx.font = '10px monospace'
    ctx.fillText(`${(angle * 180 / Math.PI).toFixed(1)}°`, PIVOT_X + 35, PIVOT_Y + 16)

    // Energy bars — measured from the simulation, not asserted from θ₀.
    //
    // These used to read: totalE = g·L·(1−cos θ₀) held constant, then
    // ke = totalE − pe. Kinetic energy was DEFINED as the remainder, so the two
    // bars traded off perfectly by construction. `omega`, the only state the
    // integrator actually advances, never entered the calculation. The bars
    // would have shown flawless conservation with a broken integrator, a
    // negative g, or a rod that changed length mid-swing — and the article
    // pointed at them and said "watch, they trade off perfectly", which the
    // reader reasonably took as evidence. It was evidence of nothing.
    //
    // Worse, the loop damps (omega *= 0.9995), so energy really is draining
    // away. The old display concealed exactly the effect the article's closing
    // section is about.
    //
    // Per unit mass: PE = gL(1−cos θ), KE = ½L²ω². The reference is the initial
    // energy, so the total bar starts full and visibly sinks as damping bites.
    const { omega } = stateRef.current
    const pe = mass * gravity * L_m * (1 - Math.cos(angle))
    const ke = 0.5 * mass * L_m * L_m * omega * omega
    const e0 = mass * gravity * L_m * (1 - Math.cos((initAngle * Math.PI) / 180))
    const normPE = e0 > 0 ? pe / e0 : 0
    const normKE = e0 > 0 ? ke / e0 : 0
    const normTot = normPE + normKE

    const barX = W - 78
    const barH = 100

    ctx.fillStyle = 'rgba(255,245,235,0.06)'
    for (let i = 0; i < 3; i++) ctx.fillRect(barX + i * 20, H - barH - 20, 16, barH)

    const bar = (i: number, v: number, colour: string) => {
      const h = Math.max(0, Math.min(1, v)) * barH
      ctx.fillStyle = colour
      ctx.fillRect(barX + i * 20, H - 20 - h, 16, h)
    }
    bar(0, normPE, '#A78BFA')
    bar(1, normKE, '#10B981')
    bar(2, normTot, '#F59E0B')

    ctx.font = '9px monospace'
    ctx.fillStyle = '#A78BFA'; ctx.fillText('PE', barX + 1, H - 8)
    ctx.fillStyle = '#10B981'; ctx.fillText('KE', barX + 21, H - 8)
    ctx.fillStyle = '#F59E0B'; ctx.fillText('tot', barX + 40, H - 8)
    // The number the reader can watch fall. Without it the decay is a slowly
    // shrinking rectangle that is easy to miss.
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText(`${(normTot * 100).toFixed(0)}%`, barX + 38, H - barH - 26)
    // Absolute joules, so mass is visibly doing something. It scales the energy
    // and cancels out of the period — which is the whole point of the m slider.
    ctx.fillText(`E₀ = ${e0.toFixed(1)} J`, barX - 24, H - barH - 38)

    setEnergy({ ke: normKE, pe: normPE })
  }, [length, gravity, initAngle, mass])

  useEffect(() => {
    stateRef.current = { angle: initAngle * Math.PI / 180, omega: 0, trail: [] }
    drawFrame()
  }, [initAngle, length, gravity, mass, drawFrame])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }

    const loop = () => {
      const s = stateRef.current
      const alpha = -(gravity / length) * Math.sin(s.angle)
      s.omega += alpha * DT
      s.omega *= retention(damping)
      s.angle += s.omega * DT

      const px = toPixels(length)
      const bobX = PIVOT_X + px * Math.sin(s.angle)
      const bobY = PIVOT_Y + px * Math.cos(s.angle)
      s.trail = [...s.trail, { x: bobX, y: bobY }].slice(-80)

      drawFrame()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, length, gravity, damping, drawFrame])

  useEffect(() => {
    if (triggered && !running) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    stateRef.current = { angle: initAngle * Math.PI / 180, omega: 0, trail: [] }
    drawFrame()
  }

  const period = (2 * Math.PI * Math.sqrt(length / gravity)).toFixed(2)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Simple Pendulum</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Simple Pendulum. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        {/* Each label carries the symbol the equation below uses, so dragging
            "Angle θ₀" and watching θ₀ change in the formula is one motion
            instead of two facts the reader has to connect. Bounds come from
            SPEC rather than being repeated here. */}
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Angle <span className="text-accent-gold">θ₀</span>:</span>
          <input type="range" min={SPEC.initAngle.min} max={SPEC.initAngle.max} step={SPEC.initAngle.step} value={initAngle}
            onChange={e => { set('initAngle', +e.target.value); setRunning(false) }}
            className="w-20 accent-accent-gold"
          />
          <span>{initAngle}°</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Length <span className="text-accent-gold">L</span>:</span>
          <input type="range" min={SPEC.length.min} max={SPEC.length.max} step={SPEC.length.step} value={length}
            onChange={e => { set('length', +e.target.value); setRunning(false) }}
            className="w-20 accent-accent-gold"
          />
          <span className="tabular-nums">{length.toFixed(2)} m</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Gravity <span className="text-accent-gold">g</span>:</span>
          <input type="range" min={SPEC.gravity.min} max={SPEC.gravity.max} step={SPEC.gravity.step} value={gravity}
            onChange={e => { set('gravity', +e.target.value); setRunning(false) }}
            className="w-20 accent-accent-gold"
          />
          <span>{gravity} m/s²</span>
        </label>
      </div>
      <div className="animation-readout">
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Mass <span className="text-accent-gold">m</span>:</span>
          <input type="range" min={SPEC.mass.min} max={SPEC.mass.max} step={SPEC.mass.step} value={mass}
            onChange={e => set('mass', +e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span className="tabular-nums">{mass.toFixed(1)} kg</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Damping <span className="text-accent-gold">b</span>:</span>
          <input type="range" min={SPEC.damping.min} max={SPEC.damping.max} step={SPEC.damping.step} value={damping}
            onChange={e => set('damping', +e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span className="tabular-nums">{damping === 0 ? 'none' : damping.toFixed(1)}</span>
        </label>
        {/* The assumption is stated because this widget makes it checkable: the
              loop above integrates α = −(g/L)·sin θ, the exact equation, while
              this formula is the small-angle linearisation of it. They agree near
              θ₀ = 0 and visibly do not at the top of the slider's range. Naming
              that is the minimum owed to a reader who can see both at once. */}
        <EquationReadout
          formula="T = 2π√(L/g)"
          bindings={[
            { symbol: 'L', value: `${length.toFixed(2)} m` },
            { symbol: 'g', value: `${gravity} m/s²` },
          ]}
          result={`${period} s`}
          // The arithmetic the article states the answer to and never performs.
          // At the default 1.00 m this reads 2.01 s — the "about 2.0 seconds"
          // the prose asserts, now with the three steps that produce it.
          steps={[
            `L ∕ g = ${length.toFixed(2)} ∕ ${gravity} = ${(length / gravity).toFixed(4)} s²`,
            `√${(length / gravity).toFixed(4)} = ${Math.sqrt(length / gravity).toFixed(4)} s`,
            `2π × ${Math.sqrt(length / gravity).toFixed(4)} = ${period} s`,
          ]}
          assumption={`Small-angle approximation. The simulation integrates the exact equation, so the two part company as θ₀ grows: at ${initAngle}° the true period is about ${((exactRatio(initAngle) - 1) * 100).toFixed(0)}% longer than this. Exact value from the complete elliptic integral K(sin θ₀⁄2), evaluated by arithmetic–geometric mean.`}
        />
      </div>
    </div>
  )
}
