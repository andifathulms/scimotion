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
  initAngle: { default: 60, min: 5, max: 85, step: 1, symbol: 'θ₀', unit: '°' },
  length: { default: 1, min: L_MIN, max: L_MAX, step: 0.05, symbol: 'L', unit: 'm' },
  gravity: { default: 9.81, min: 1, max: 20, step: 0.5, symbol: 'g', unit: 'm/s²' },
}

export function PendulumAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const stateRef = useRef({ angle: Math.PI / 3, omega: 0, trail: [] as { x: number; y: number }[] })

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('pendulum', SPEC)
  const { initAngle, length, gravity } = params
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

    // Energy bars
    const pe = gravity * L * (1 - Math.cos(angle))
    const totalE = gravity * L * (1 - Math.cos(stateRef.current.angle === angle && !running
      ? (initAngle * Math.PI / 180)
      : (initAngle * Math.PI / 180)))
    const ke = Math.max(0, totalE - pe)
    const normPE = totalE > 0 ? pe / totalE : 0
    const normKE = totalE > 0 ? ke / totalE : 0

    const barX = W - 60
    const barH = 100

    ctx.fillStyle = 'rgba(255,245,235,0.06)'
    ctx.fillRect(barX, H - barH - 20, 16, barH)
    ctx.fillRect(barX + 20, H - barH - 20, 16, barH)

    ctx.fillStyle = '#A78BFA'
    ctx.fillRect(barX, H - 20 - normPE * barH, 16, normPE * barH)
    ctx.fillStyle = '#10B981'
    ctx.fillRect(barX + 20, H - 20 - normKE * barH, 16, normKE * barH)

    ctx.font = '9px monospace'
    ctx.fillStyle = '#A78BFA'
    ctx.fillText('PE', barX + 1, H - 8)
    ctx.fillStyle = '#10B981'
    ctx.fillText('KE', barX + 21, H - 8)

    setEnergy({ ke: normKE, pe: normPE })
  }, [length, gravity, initAngle, running])

  useEffect(() => {
    stateRef.current = { angle: initAngle * Math.PI / 180, omega: 0, trail: [] }
    drawFrame()
  }, [initAngle, length, gravity, drawFrame])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }

    const loop = () => {
      const s = stateRef.current
      const alpha = -(gravity / length) * Math.sin(s.angle)
      s.omega += alpha * DT
      s.omega *= 0.9995
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
  }, [running, length, gravity, drawFrame])

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
          assumption={`small-angle approximation — the simulation integrates the exact equation, so the two part company as θ₀ grows (now ${initAngle}°)`}
        />
      </div>
    </div>
  )
}
