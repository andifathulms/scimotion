'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'

const W = 600
const H = 270
const PAD = { left: 46, right: 16, top: 30, bottom: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const MAX_T = 72          // hours shown on the axis
const Y_MAX = 150         // concentration units at the top of the plot
const DOSE = 30           // arbitrary concentration units delivered per dose
const KA = Math.LN2 / 0.5 // absorption rate constant (absorption half-life 0.5 h)
const H_PER_FRAME = 0.28

const THERA_LO = 20
const THERA_HI = 60

const C_CURVE = '#F472B6'   // pink — plasma concentration
const C_TOXIC = '#F59E0B'   // gold — above the window
const C_WINDOW = '#10B981'  // green — therapeutic window
const C_SUB = '#60A5FA'     // blue — below the window
const C_DOSE = '#A78BFA'    // violet — dosing events

// Bateman (one-compartment, first-order absorption and elimination) for a single dose.
function singleDose(u: number, k: number, amount: number): number {
  if (u <= 0) return 0
  return amount * (KA / (KA - k)) * (Math.exp(-k * u) - Math.exp(-KA * u))
}

function concAt(t: number, tau: number, k: number, loading: boolean): number {
  let total = 0
  for (let n = 0; n * tau <= t; n++) {
    const amount = loading && n === 0 ? DOSE * 2 : DOSE
    total += singleDose(t - n * tau, k, amount)
  }
  return total
}

// Peak of a single unit dose, used to place the theoretical steady-state line.
function singlePeak(k: number): number {
  const tmax = Math.log(KA / k) / (KA - k)
  return singleDose(tmax, k, DOSE)
}

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  interval: { default: 8, min: 2, max: 24, step: 1 },
  halfLife: { default: 8, min: 2, max: 24, step: 1 },
}

export function PharmacokineticsAnimation() {
  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) { setT(MAX_T); return }
      setRunning(true)
    },
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  const [running, setRunning] = useState(false)
  const [t, setT] = useState(0)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('pharmacokinetics', SPEC)
  const { interval, halfLife } = params
  const [loading, setLoading] = useState(false)

  const k = Math.LN2 / halfLife

  const xFor = useCallback((hours: number) => PAD.left + (hours / MAX_T) * PLOT_W, [])
  const yFor = useCallback(
    (c: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(c, Y_MAX)) / Y_MAX) * PLOT_H,
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'

    // Bands: sub-therapeutic, therapeutic window, toxic
    const bands: [number, number, string, string][] = [
      [0, THERA_LO, `${C_SUB}14`, 'sub-therapeutic'],
      [THERA_LO, THERA_HI, `${C_WINDOW}1A`, 'therapeutic window'],
      [THERA_HI, Y_MAX, `${C_TOXIC}14`, 'toxic'],
    ]
    for (const [lo, hi, fill, label] of bands) {
      const yTop = yFor(hi)
      const yBot = yFor(lo)
      ctx.fillStyle = fill
      ctx.fillRect(PAD.left, yTop, PLOT_W, yBot - yTop)
      ctx.fillStyle = 'rgba(245,240,232,0.4)'
      ctx.fillText(label, PAD.left + 4, yTop + 11)
    }

    // Window edges
    for (const edge of [THERA_LO, THERA_HI]) {
      ctx.beginPath()
      ctx.strokeStyle = edge === THERA_LO ? `${C_SUB}66` : `${C_TOXIC}66`
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, yFor(edge))
      ctx.lineTo(PAD.left + PLOT_W, yFor(edge))
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    for (const c of [0, 50, 100, 150]) {
      ctx.textAlign = 'right'
      ctx.fillText(`${c}`, PAD.left - 6, yFor(c) + 3)
      ctx.textAlign = 'left'
    }
    ctx.fillText('plasma concentration', PAD.left - 2, PAD.top - 12)
    for (let h = 0; h <= MAX_T; h += 12) {
      const x = xFor(h)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PAD.top + PLOT_H)
      ctx.lineTo(x, PAD.top + PLOT_H + 4)
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(245,240,232,0.35)'
      ctx.fillText(`${h}`, x, PAD.top + PLOT_H + 15)
      ctx.textAlign = 'left'
    }
    ctx.fillText('hours →', PAD.left + PLOT_W - 44, H - 4)

    // Theoretical steady-state peak
    const accumulation = 1 / (1 - Math.exp(-k * interval))
    const ssPeak = singlePeak(k) * accumulation
    if (ssPeak < Y_MAX) {
      ctx.beginPath()
      ctx.strokeStyle = `${C_DOSE}88`
      ctx.setLineDash([2, 5])
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, yFor(ssPeak))
      ctx.lineTo(PAD.left + PLOT_W, yFor(ssPeak))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_DOSE
      ctx.textAlign = 'right'
      ctx.fillText('steady-state peak', PAD.left + PLOT_W - 4, yFor(ssPeak) - 4)
      ctx.textAlign = 'left'
    }

    // Dose markers
    for (let n = 0; n * interval <= Math.min(t, MAX_T); n++) {
      const x = xFor(n * interval)
      ctx.beginPath()
      ctx.strokeStyle = C_DOSE
      ctx.lineWidth = n === 0 && loading ? 2.5 : 1.5
      ctx.moveTo(x, PAD.top + PLOT_H)
      ctx.lineTo(x, PAD.top + PLOT_H - 7)
      ctx.stroke()
    }

    // Concentration curve
    ctx.beginPath()
    ctx.strokeStyle = C_CURVE
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    let started = false
    for (let h = 0; h <= t; h += 0.15) {
      const x = xFor(h)
      const y = yFor(concAt(h, interval, k, loading))
      if (!started) { ctx.moveTo(x, y); started = true }
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Leading dot
    if (t > 0 && t < MAX_T) {
      ctx.beginPath()
      ctx.arc(xFor(t), yFor(concAt(t, interval, k, loading)), 4, 0, Math.PI * 2)
      ctx.fillStyle = C_CURVE
      ctx.fill()
    }
  }, [t, interval, k, loading, xFor, yFor])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      setT(prev => {
        const next = prev + H_PER_FRAME
        if (next >= MAX_T) { setRunning(false); return MAX_T }
        return next
      })
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setT(0)
    set('interval', 8)
    set('halfLife', 8)
    setLoading(false)
  }

  const conc = concAt(t, interval, k, loading)
  const status = conc > THERA_HI ? 'toxic' : conc >= THERA_LO ? 'in window' : 'sub-therapeutic'
  const statusColor = conc > THERA_HI ? C_TOXIC : conc >= THERA_LO ? C_WINDOW : C_SUB
  const accumulation = 1 / (1 - Math.exp(-k * interval))
  const dosesToSteady = Math.ceil((3.32 * halfLife) / interval)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Repeated dosing and the therapeutic window</span>
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Interval:</span>
          <input
            type="range" min={SPEC.interval.min} max={SPEC.interval.max} step={SPEC.interval.step} value={interval}
            onChange={e => { set('interval', +e.target.value); setT(0) }}
            className="w-24 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{interval} h</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Half-life:</span>
          <input
            type="range" min={SPEC.halfLife.min} max={SPEC.halfLife.max} step={SPEC.halfLife.step} value={halfLife}
            onChange={e => { set('halfLife', +e.target.value); setT(0) }}
            className="w-24 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">{halfLife} h</span>
        </div>
        <button
          onClick={() => { setLoading(l => !l); setT(0) }}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={
            loading
              ? { color: C_DOSE, borderColor: `${C_DOSE}44`, background: `${C_DOSE}12` }
              : { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
          }
        >
          Double first dose
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
        >
          {status}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          t = {t.toFixed(0)} h · C = {conc.toFixed(0)} · accumulation ×{accumulation.toFixed(2)} · ~{dosesToSteady} doses to steady state
        </span>
      </div>
    </div>
  )
}
