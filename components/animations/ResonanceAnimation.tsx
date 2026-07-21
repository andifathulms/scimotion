'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 330

// Physical constants. omega0 is the natural angular frequency; F0 is chosen so
// that the zero-frequency ("static") deflection is exactly 1 unit, which makes
// every amplitude on screen readable directly as a gain A/A0.
const W0 = 6
const F0 = W0 * W0
const DT = 0.004
const SUBSTEPS = 4

// Oscillator panel geometry
const MASS_X = 125
const CEIL_Y = 28
const EQ_Y = 118
const DISP = 6.5

// Response-curve panel geometry
const PX0 = 272
const PX1 = 584
const PY0 = 24
const PY1 = 196
const RMIN = 0.2
const RMAX = 2.2
const GMAX = 9

// Trace panel geometry
const TR_Y = 273
const TR_X0 = 8
const TRACE_N = 292

const GREEN = '#10B981'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

// Steady-state amplitude gain of a driven damped oscillator, in units of the
// static deflection. r = omega/omega0, q = omega0/gamma.
const gainAt = (r: number, q: number) => 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2)

// Phase by which the response lags the drive, 0 -> pi through resonance.
const phaseAt = (r: number, q: number) => Math.atan2(r / q, 1 - r * r)

const rToPx = (r: number) => PX0 + ((r - RMIN) / (RMAX - RMIN)) * (PX1 - PX0)
const gToPy = (g: number) => PY1 - (Math.min(g, GMAX) / GMAX) * (PY1 - PY0)

export function ResonanceAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [ratio, setRatio] = useState(0.5)
  const [gamma, setGamma] = useState(1.2)
  const [amp, setAmp] = useState(0)

  // Simulation state lives in refs so the rAF loop never has to restart.
  const stateRef = useRef({ x: 0, v: 0, t: 0, env: 0 })
  const paramsRef = useRef({ ratio: 0.5, gamma: 1.2 })
  const exploredRef = useRef({ lo: 0.5, hi: 0.5 })
  const traceRef = useRef<{ d: number; y: number }[]>([])

  useEffect(() => {
    paramsRef.current = { ratio, gamma }
  }, [ratio, gamma])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: (reduced) => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { ratio: r, gamma: g } = paramsRef.current
    const q = W0 / g
    const s = stateRef.current

    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // ---- panel separators -------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(234, 12)
    ctx.lineTo(234, 208)
    ctx.moveTo(8, 218)
    ctx.lineTo(592, 218)
    ctx.stroke()

    // ---- oscillator: ceiling, spring, mass --------------------------------
    ctx.strokeStyle = 'rgba(245,240,232,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(MASS_X - 45, CEIL_Y)
    ctx.lineTo(MASS_X + 45, CEIL_Y)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(245,240,232,0.18)'
    ctx.lineWidth = 1
    for (let i = -44; i < 45; i += 9) {
      ctx.beginPath()
      ctx.moveTo(MASS_X + i, CEIL_Y)
      ctx.lineTo(MASS_X + i - 6, CEIL_Y - 6)
      ctx.stroke()
    }

    const massY = EQ_Y + s.x * DISP
    const coils = 11
    ctx.beginPath()
    ctx.moveTo(MASS_X, CEIL_Y)
    for (let i = 0; i <= coils * 2; i++) {
      const f = i / (coils * 2)
      const y = CEIL_Y + f * (massY - 12 - CEIL_Y)
      const off = i === 0 || i === coils * 2 ? 0 : (i % 2 === 0 ? -9 : 9)
      ctx.lineTo(MASS_X + off, y)
    }
    ctx.strokeStyle = 'rgba(245,240,232,0.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // equilibrium line + measured amplitude envelope
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,245,235,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MASS_X - 60, EQ_Y)
    ctx.lineTo(MASS_X + 60, EQ_Y)
    ctx.stroke()

    const envPx = Math.min(s.env * DISP, 62)
    ctx.strokeStyle = `${GOLD}66`
    ctx.beginPath()
    ctx.moveTo(MASS_X - 42, EQ_Y - envPx)
    ctx.lineTo(MASS_X + 42, EQ_Y - envPx)
    ctx.moveTo(MASS_X - 42, EQ_Y + envPx)
    ctx.lineTo(MASS_X + 42, EQ_Y + envPx)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = GREEN
    ctx.fillRect(MASS_X - 16, massY - 12, 32, 24)
    ctx.fillStyle = 'rgba(15,13,10,0.85)'
    ctx.fillRect(MASS_X - 11, massY - 3, 22, 6)

    // drive force arrow, drawn at the true instantaneous drive value
    const drive = Math.cos(r * W0 * s.t)
    const ax = MASS_X + 52
    const alen = drive * 30
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ax, EQ_Y)
    ctx.lineTo(ax, EQ_Y + alen)
    ctx.stroke()
    if (Math.abs(alen) > 4) {
      const dir = Math.sign(alen)
      ctx.beginPath()
      ctx.moveTo(ax, EQ_Y + alen)
      ctx.lineTo(ax - 4, EQ_Y + alen - dir * 6)
      ctx.lineTo(ax + 4, EQ_Y + alen - dir * 6)
      ctx.closePath()
      ctx.fillStyle = GOLD
      ctx.fill()
    }
    ctx.fillStyle = GOLD
    ctx.fillText('drive', ax - 10, EQ_Y + 48)
    ctx.fillStyle = GREEN
    ctx.fillText('mass', MASS_X - 14, 200)

    // ---- response curve ---------------------------------------------------
    ctx.strokeStyle = 'rgba(255,245,235,0.14)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PX0, PY0 - 6)
    ctx.lineTo(PX0, PY1)
    ctx.lineTo(PX1, PY1)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    for (const tick of [0.5, 1, 1.5, 2]) {
      const px = rToPx(tick)
      ctx.beginPath()
      ctx.moveTo(px, PY1)
      ctx.lineTo(px, PY1 + 4)
      ctx.strokeStyle = 'rgba(255,245,235,0.14)'
      ctx.stroke()
      ctx.fillText(tick.toFixed(1), px - 8, PY1 + 15)
    }
    ctx.fillText('ω / ω₀', PX1 - 40, PY1 + 15)
    ctx.fillText('gain A/A₀', PX0 + 4, PY0 - 10)

    // resonance line at r = 1
    ctx.setLineDash([3, 4])
    ctx.strokeStyle = `${VIOLET}55`
    ctx.beginPath()
    ctx.moveTo(rToPx(1), PY0 - 6)
    ctx.lineTo(rToPx(1), PY1)
    ctx.stroke()
    ctx.setLineDash([])

    // full analytic curve, dim
    const curve: { px: number; py: number; r: number }[] = []
    for (let i = 0; i <= 220; i++) {
      const rr = RMIN + (i / 220) * (RMAX - RMIN)
      curve.push({ px: rToPx(rr), py: gToPy(gainAt(rr, q)), r: rr })
    }
    ctx.beginPath()
    curve.forEach((p, i) => (i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py)))
    ctx.strokeStyle = `${GREEN}33`
    ctx.lineWidth = 1.5
    ctx.stroke()

    // the portion the reader has actually swept out, bright
    const { lo, hi } = exploredRef.current
    ctx.beginPath()
    let started = false
    for (const p of curve) {
      if (p.r < lo || p.r > hi) continue
      if (!started) {
        ctx.moveTo(p.px, p.py)
        started = true
      } else ctx.lineTo(p.px, p.py)
    }
    ctx.strokeStyle = GREEN
    ctx.lineWidth = 2
    ctx.stroke()

    // measured amplitude from the simulation, and the analytic marker
    ctx.beginPath()
    ctx.arc(rToPx(r), gToPy(s.env), 4, 0, Math.PI * 2)
    ctx.fillStyle = GOLD
    ctx.fill()
    ctx.beginPath()
    ctx.arc(rToPx(r), gToPy(gainAt(r, q)), 6, 0, Math.PI * 2)
    ctx.strokeStyle = `${GOLD}88`
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.5)'
    ctx.fillText(`Q = ${q.toFixed(1)}`, PX1 - 62, PY0 + 4)
    ctx.fillText(`peak ≈ ${gainAt(1, q).toFixed(1)}×`, PX1 - 62, PY0 + 16)

    // ---- drive vs response traces ----------------------------------------
    const buf = traceRef.current
    ctx.strokeStyle = 'rgba(255,245,235,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(TR_X0, TR_Y)
    ctx.lineTo(592, TR_Y)
    ctx.stroke()

    const px = (i: number) => TR_X0 + i * 2
    if (buf.length > 1) {
      ctx.beginPath()
      buf.forEach((p, i) => {
        const y = TR_Y + p.d * 24
        return i === 0 ? ctx.moveTo(px(i), y) : ctx.lineTo(px(i), y)
      })
      ctx.strokeStyle = `${GOLD}AA`
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.beginPath()
      buf.forEach((p, i) => {
        const y = TR_Y + p.y * 24
        return i === 0 ? ctx.moveTo(px(i), y) : ctx.lineTo(px(i), y)
      })
      ctx.strokeStyle = GREEN
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const lag = (phaseAt(r, q) * 180) / Math.PI
    ctx.fillStyle = GOLD
    ctx.fillText('drive', TR_X0 + 2, TR_Y - 32)
    ctx.fillStyle = GREEN
    ctx.fillText('response (normalized)', TR_X0 + 44, TR_Y - 32)
    ctx.fillStyle = lag > 60 && lag < 120 ? PINK : BLUE
    ctx.fillText(`phase lag ${lag.toFixed(0)}°`, 480, TR_Y - 32)
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText(
      lag < 45 ? 'in step with the drive' : lag > 135 ? 'fighting the drive' : 'a quarter cycle behind — resonance',
      TR_X0 + 2,
      TR_Y + 42
    )
  }, [])

  const step = useCallback(() => {
    const s = stateRef.current
    const { ratio: r, gamma: g } = paramsRef.current
    const w = r * W0
    for (let i = 0; i < SUBSTEPS; i++) {
      const a = F0 * Math.cos(w * s.t) - g * s.v - W0 * W0 * s.x
      s.v += a * DT
      s.x += s.v * DT
      s.t += DT
    }
    s.env = Math.max(Math.abs(s.x), s.env * 0.992)

    const ex = exploredRef.current
    ex.lo = Math.min(ex.lo, r)
    ex.hi = Math.max(ex.hi, r)

    const norm = s.env > 0.05 ? s.env : 1
    const buf = traceRef.current
    buf.push({ d: Math.cos(w * s.t), y: s.x / norm })
    if (buf.length > TRACE_N) buf.shift()
  }, [])

  useEffect(() => {
    if (!running) {
      cancelAnimationFrame(animRef.current)
      return
    }
    let frames = 0
    const loop = () => {
      step()
      draw()
      if (++frames % 6 === 0) setAmp(stateRef.current.env)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, step, draw])

  useEffect(() => {
    draw()
  }, [ratio, gamma, running, draw])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    stateRef.current = { x: 0, v: 0, t: 0, env: 0 }
    exploredRef.current = { lo: ratio, hi: ratio }
    traceRef.current = []
    setAmp(0)
    draw()
  }

  const q = W0 / gamma

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Driven Damped Oscillator</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
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
          <span>Drive ω/ω₀:</span>
          <input type="range" min={0.2} max={2.2} step={0.02} value={ratio}
            onChange={e => setRatio(+e.target.value)}
            className="w-28 accent-accent-gold"
          />
          <span>{ratio.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Damping γ:</span>
          <input type="range" min={0.75} max={6} step={0.05} value={gamma}
            onChange={e => setGamma(+e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span>{gamma.toFixed(2)}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary">
          Q ≈ <strong className="text-accent-gold">{q.toFixed(1)}</strong> · amplitude{' '}
          <strong className="text-accent-gold">{amp.toFixed(2)}×</strong> static
        </span>
      </div>
    </div>
  )
}
