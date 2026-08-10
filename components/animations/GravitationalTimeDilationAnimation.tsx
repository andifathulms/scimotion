'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 300

const ACCENT = '#818CF8' // indigo
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const VIOLET = '#A78BFA'
const PINK = '#F472B6'

const CX = 150 // hole centre x (left side of canvas)
const CY = 150
const R_EVENT = 34 // event-horizon radius in px

// Gravitational time-dilation factor sqrt(1 - r_s/r). r is expressed in units of
// r_s; the near clock sits at radius `rOverRs` (>= 1.001, never below the horizon).
const factor = (rOverRs: number) => Math.sqrt(Math.max(0, 1 - 1 / rOverRs))

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rOverRs: { default: 3, min: 1.02, max: 6, step: 0.01 },
}

export function GravitationalTimeDilationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(0)
  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('gravitational-time-dilation', SPEC)
  const { rOverRs } = params
  const [farTime, setFarTime] = useState(0)
  const [nearTime, setNearTime] = useState(0)

  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()

  // Map r/r_s (1 -> horizon, ~6 -> far) to an on-screen x for the near clock.
  const nearX = useCallback((ror: number) => CX + R_EVENT + 6 + ((ror - 1) / 5) * 150, [])

  const draw = useCallback((t: number, ror: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const f = factor(ror)
    const nx = nearX(ror)

    // Radial "gravity well" gradient behind the hole.
    const well = ctx.createRadialGradient(CX, CY, R_EVENT, CX, CY, 240)
    well.addColorStop(0, 'rgba(129,140,248,0.16)')
    well.addColorStop(1, 'rgba(129,140,248,0)')
    ctx.fillStyle = well
    ctx.beginPath(); ctx.arc(CX, CY, 240, 0, Math.PI * 2); ctx.fill()

    // Event horizon.
    ctx.fillStyle = '#000000'
    ctx.beginPath(); ctx.arc(CX, CY, R_EVENT, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(CX, CY, R_EVENT, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = GOLD
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('rₛ', CX, CY + R_EVENT + 14)
    ctx.textAlign = 'left'

    // --- Far clock (unaffected reference), top-right ---
    const farX = 520
    const farY = 70
    drawClock(ctx, farX, farY, 26, (t * 1.0) % 1, BLUE, 'far away')

    // --- Near clock, lowered toward the horizon ---
    // It ticks slowed by the factor f. As r -> r_s, f -> 0 and it freezes.
    drawClock(ctx, nx, CY, 26, (t * f) % 1, ror < 1.15 ? PINK : VIOLET, `r = ${ror.toFixed(2)} rₛ`)

    // Tether line from horizon to near clock.
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(CX + R_EVENT, CY); ctx.lineTo(nx - 26, CY); ctx.stroke()
    ctx.setLineDash([])

    // --- Light climbing out from the near clock, redshifting as it goes ---
    // A photon launched from the near clock travels right toward the far observer;
    // its wavelength stretches (colour shifts violet -> pink -> red) with height.
    const phase = (t * 60) % 200
    const px = nx + phase
    if (px < farX - 20) {
      // wavelength grows as it climbs; draw a short wiggle whose colour reddens.
      const climb = (px - nx) / (farX - 20 - nx) // 0 at emit, 1 near far clock
      const wl = 6 + climb * 16
      ctx.lineWidth = 1.75
      ctx.strokeStyle = climb < 0.4 ? VIOLET : climb < 0.75 ? PINK : '#EF4444'
      ctx.beginPath()
      for (let k = -18; k <= 18; k += 1) {
        const wx = px + k
        const wy = CY - 60 + Math.sin((wx - nx) / wl * Math.PI) * 5
        if (k === -18) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy)
      }
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,245,235,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText('light climbs out → redshifts', nx - 6, CY - 74)

    // --- Bottom: two rate bars ---
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(96,165,250,0.10)'
    ctx.fillRect(20, 250, 260, 34)
    ctx.fillStyle = 'rgba(167,139,250,0.10)'
    ctx.fillRect(310, 250, 270, 34)

    const farFrac = (t % 6) / 6
    ctx.fillStyle = 'rgba(96,165,250,0.4)'
    ctx.fillRect(20, 250, farFrac * 260, 34)
    ctx.fillStyle = BLUE
    ctx.font = 'bold 11px monospace'
    ctx.fillText(`Far clock:  ${t.toFixed(2)} s`, 28, 271)

    const nearFrac = ((t * f) % 6) / 6
    ctx.fillStyle = 'rgba(167,139,250,0.4)'
    ctx.fillRect(310, 250, nearFrac * 270, 34)
    ctx.fillStyle = VIOLET
    ctx.fillText(`Near clock:  ${(t * f).toFixed(2)} s`, 318, 271)

    // factor readout between the bars.
    ctx.fillStyle = GOLD
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`×${f.toFixed(3)}`, 295, 244)
    ctx.textAlign = 'left'
  }, [nearX])

  useEffect(() => {
    if (!running) { draw(tRef.current, rOverRs); return }
    const tick = () => {
      tRef.current += 0.02
      setFarTime(+tRef.current.toFixed(2))
      setNearTime(+(tRef.current * factor(rOverRs)).toFixed(2))
      draw(tRef.current, rOverRs)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, rOverRs, draw])

  useEffect(() => { draw(tRef.current, rOverRs) }, [rOverRs, draw])

  useEffect(() => {
    if (triggered && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
  }, [triggered])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    tRef.current = 0
    setRunning(false)
    setFarTime(0)
    setNearTime(0)
    set('rOverRs', 3)
    triggerReset()
    draw(0, 3)
  }

  const f = factor(rOverRs)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Gravitational time dilation</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Gravitational time dilation. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: GOLD, color: '#0F0D0A' }}>
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>lower the clock (r/rₛ):</span>
          <input type="range" min={SPEC.rOverRs.min} max={SPEC.rOverRs.max} step={SPEC.rOverRs.step} value={rOverRs}
            onChange={e => set('rOverRs', +e.target.value)}
            className="w-40" style={{ accentColor: ACCENT }} />
          <span className="font-mono text-text-secondary">{rOverRs.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs font-mono text-text-secondary">
          √(1 − rₛ/r) = <strong style={{ color: GOLD }}>{f.toFixed(3)}</strong>
          &nbsp;·&nbsp; far {farTime}s → near {nearTime}s
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Slide the near clock toward the horizon and its ticks — and the light it sends up — slow together.
        At <strong className="font-mono" style={{ color: PINK }}>r = rₛ</strong> the factor reaches 0:
        from far away the clock appears to freeze and its light redshifts to nothing. This is the same effect
        that makes GPS clocks run fast, taken to its extreme.
      </p>
    </div>
  )
}

// A minimal analogue clock: a ring plus a hand at `frac` of a full turn.
function drawClock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  frac: number,
  color: string,
  label: string
) {
  ctx.strokeStyle = 'rgba(255,245,235,0.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke()

  // tick marks
  ctx.strokeStyle = 'rgba(255,245,235,0.2)'
  ctx.lineWidth = 1
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4))
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    ctx.stroke()
  }

  const ang = frac * Math.PI * 2 - Math.PI / 2
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + Math.cos(ang) * (r - 7), y + Math.sin(ang) * (r - 7))
  ctx.stroke()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = 'rgba(255,245,235,0.6)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y + r + 15)
  ctx.textAlign = 'left'
}
