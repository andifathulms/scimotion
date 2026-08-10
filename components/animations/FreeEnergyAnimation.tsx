'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { useWidgetParams } from '@/hooks/useWidgetParams'
import { WidgetLink } from '@/components/WidgetLink'
import { EquationReadout } from '@/components/EquationReadout'

const W = 620
const H = 300

// Main plot: ΔG (kJ/mol) versus temperature (K).
const PAD = { left: 52, right: 16, top: 30, bottom: 78 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const T_MIN = 0
const T_MAX = 1000
const G_MIN = -150 // kJ/mol at the bottom of the axis
const G_MAX = 150 // kJ/mol at the top

const ORANGE = '#FB923C' // ΔG line / net result
const GOLD = '#F59E0B' // enthalpy term
const BLUE = '#60A5FA' // entropy term (−TΔS)
const GREEN = '#10B981' // spontaneous
const VIOLET = '#A78BFA' // crossover marker

type Regime =
  | 'always'
  | 'never'
  | 'low-T' // spontaneous below the crossover
  | 'high-T' // spontaneous above the crossover

function classify(dH: number, dS: number): Regime {
  const exo = dH < 0
  const disorder = dS > 0
  if (exo && disorder) return 'always'
  if (!exo && !disorder) return 'never'
  if (exo && !disorder) return 'low-T'
  return 'high-T'
}

const REGIME_LABEL: Record<Regime, string> = {
  always: 'ΔH < 0, ΔS > 0 — spontaneous at every temperature',
  never: 'ΔH > 0, ΔS < 0 — never spontaneous',
  'low-T': 'ΔH < 0, ΔS < 0 — spontaneous only below T*',
  'high-T': 'ΔH > 0, ΔS > 0 — spontaneous only above T*',
}

// Symbols match the equation in the header and in the article body. Declared at
// module scope so the reference is stable across the sweep's animation frames.
const SPEC = {
  dH: { default: -40, min: -120, max: 120, step: 5, symbol: 'ΔH', unit: 'kJ/mol' },
  dS: { default: -100, min: -250, max: 250, step: 10, symbol: 'ΔS', unit: 'J/mol·K' },
  temp: { default: 298, min: T_MIN, max: T_MAX, step: 5, symbol: 'T', unit: 'K' },
}

export function FreeEnergyAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const tRef = useRef(298) // current temperature, K
  const dHRef = useRef(-40)
  const dSRef = useRef(-100)

  const { params, set, reset: resetParams, permalink, isDefault, restored } = useWidgetParams('freeenergy', SPEC)
  const { dH, dS, temp } = params
  const [running, setRunning] = useState(false)

  useEffect(() => { dHRef.current = dH }, [dH])
  useEffect(() => { dSRef.current = dS }, [dS])
  useEffect(() => { tRef.current = temp }, [temp])

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const xFor = useCallback((t: number) => PAD.left + ((t - T_MIN) / (T_MAX - T_MIN)) * PLOT_W, [])
  const yFor = useCallback(
    (g: number) => PAD.top + PLOT_H - ((g - G_MIN) / (G_MAX - G_MIN)) * PLOT_H,
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dHv = dHRef.current
    const dSv = dSRef.current
    const t = tRef.current
    // ΔG = ΔH − T·ΔS. ΔH in kJ/mol, ΔS in J/(mol·K) → divide by 1000.
    const gAt = (tt: number) => dHv - (tt * dSv) / 1000
    const gNow = gAt(t)
    // Crossover T* = ΔH/ΔS (in kelvin), only meaningful when both share a sign.
    const tStar = dSv !== 0 ? (dHv * 1000) / dSv : NaN
    const tStarInRange = tStar > T_MIN && tStar < T_MAX

    ctx.clearRect(0, 0, W, H)
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'

    // Spontaneous band (ΔG < 0): shade the region below the zero line.
    const yZero = yFor(0)
    ctx.fillStyle = 'rgba(16,185,129,0.06)'
    ctx.fillRect(PAD.left, yZero, PLOT_W, PAD.top + PLOT_H - yZero)

    // Gridlines + y labels
    for (let g = G_MIN; g <= G_MAX; g += 50) {
      const y = yFor(g)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.06)'
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, y)
      ctx.lineTo(PAD.left + PLOT_W, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.fillText(`${g}`, PAD.left - 8, y + 3)
      ctx.textAlign = 'left'
    }

    // ΔG = 0 line — the spontaneity threshold.
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.moveTo(PAD.left, yZero)
    ctx.lineTo(PAD.left + PLOT_W, yZero)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('ΔG = 0', PAD.left + PLOT_W - 46, yZero - 5)

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()
    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.fillText('ΔG (kJ/mol)', PAD.left - 44, PAD.top - 14)
    ctx.textAlign = 'right'
    ctx.fillText('temperature (K) →', PAD.left + PLOT_W, PAD.top + PLOT_H + 24)
    ctx.textAlign = 'left'
    for (let tt = 0; tt <= T_MAX; tt += 200) {
      ctx.fillStyle = 'rgba(245,240,232,0.3)'
      ctx.textAlign = 'center'
      ctx.fillText(`${tt}`, xFor(tt), PAD.top + PLOT_H + 14)
      ctx.textAlign = 'left'
    }

    // The ΔG(T) line (clipped to the plot box).
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD.left, PAD.top, PLOT_W, PLOT_H)
    ctx.clip()
    ctx.beginPath()
    ctx.strokeStyle = ORANGE
    ctx.lineWidth = 2.5
    ctx.moveTo(xFor(T_MIN), yFor(gAt(T_MIN)))
    ctx.lineTo(xFor(T_MAX), yFor(gAt(T_MAX)))
    ctx.stroke()
    ctx.restore()

    // Crossover marker (where heating/cooling flips spontaneity).
    if (tStarInRange) {
      const xs = xFor(tStar)
      ctx.beginPath()
      ctx.strokeStyle = `${VIOLET}99`
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.moveTo(xs, PAD.top)
      ctx.lineTo(xs, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = VIOLET
      ctx.textAlign = 'center'
      ctx.fillText(`T* = ${Math.round(tStar)} K`, xs, PAD.top - 4)
      ctx.textAlign = 'left'
    }

    // Current-temperature marker and the ΔG dot.
    const xNow = xFor(t)
    const yNow = yFor(Math.min(G_MAX, Math.max(G_MIN, gNow)))
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.25)'
    ctx.lineWidth = 1
    ctx.moveTo(xNow, PAD.top)
    ctx.lineTo(xNow, PAD.top + PLOT_H)
    ctx.stroke()
    const spont = gNow < 0
    ctx.beginPath()
    ctx.arc(xNow, yNow, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = spont ? GREEN : ORANGE
    ctx.fill()

    // Tug-of-war meter under the plot: ΔH vs −TΔS, summing to ΔG.
    const meterY = PAD.top + PLOT_H + 34
    const cx = PAD.left + PLOT_W / 2
    const barH = 9
    const scale = PLOT_W / 2 / 200 // 200 kJ/mol spans a half-width
    const enthalpy = dHv
    const entropy = -(t * dSv) / 1000 // the −TΔS contribution
    const clampW = (v: number) => Math.max(-PLOT_W / 2, Math.min(PLOT_W / 2, v * scale))

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(245,240,232,0.2)'
    ctx.lineWidth = 1
    ctx.moveTo(cx, meterY - 4)
    ctx.lineTo(cx, meterY + 3 * barH + 10)
    ctx.stroke()

    const bar = (row: number, value: number, color: string, label: string) => {
      const y = meterY + row * (barH + 4)
      const w = clampW(value)
      ctx.fillStyle = color
      if (w >= 0) ctx.fillRect(cx, y, w, barH)
      else ctx.fillRect(cx + w, y, -w, barH)
      ctx.fillStyle = 'rgba(245,240,232,0.55)'
      ctx.textAlign = 'left'
      ctx.fillText(label, PAD.left, y + barH - 1)
    }
    bar(0, enthalpy, GOLD, 'ΔH')
    bar(1, entropy, BLUE, '−TΔS')
    bar(2, enthalpy + entropy, spont ? GREEN : ORANGE, 'ΔG')

    ctx.fillStyle = 'rgba(245,240,232,0.3)'
    ctx.textAlign = 'right'
    ctx.fillText('← favours spontaneity   |   opposes it →', PAD.left + PLOT_W, meterY - 6)
    ctx.textAlign = 'left'
  }, [xFor, yFor])

  useEffect(() => { draw() }, [draw, dH, dS, temp])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      // Sweep temperature up, then wrap around, so the flip is unmissable.
      let next = tRef.current + 4
      if (next > T_MAX) next = T_MIN
      tRef.current = next
      set('temp', next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [running, set])

  const reset = () => {
    cancelAnimationFrame(rafRef.current)
    triggerReset()
    setRunning(false)
    // Defaults live in SPEC now, so Reset cannot drift away from the value the
    // slider starts at — these were three separate literals repeated here.
    resetParams()
    dHRef.current = SPEC.dH.default
    dSRef.current = SPEC.dS.default
    tRef.current = SPEC.temp.default
    draw()
  }

  const gNow = dH - (temp * dS) / 1000
  const regime = classify(dH, dS)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · ΔG = ΔH − TΔS, refereed by temperature</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={reset} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
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
          {running ? <><Pause size={12} /> Sweeping T</> : <><Play size={12} /> Sweep T</>}
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>ΔH:</span>
          <input
            type="range" min={SPEC.dH.min} max={SPEC.dH.max} step={SPEC.dH.step} value={dH}
            onChange={e => set('dH', +e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary">{dH} kJ/mol</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>ΔS:</span>
          <input
            type="range" min={SPEC.dS.min} max={SPEC.dS.max} step={SPEC.dS.step} value={dS}
            onChange={e => set('dS', +e.target.value)}
            className="w-24 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary">{dS} J/mol·K</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>T:</span>
          <input
            type="range" min={SPEC.temp.min} max={SPEC.temp.max} step={SPEC.temp.step} value={temp}
            onChange={e => { setRunning(false); set('temp', +e.target.value) }}
            className="w-24 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary">{temp} K</span>
        </div>
      </div>
      <div className="animation-readout">
        <EquationReadout
          formula="ΔG = ΔH − TΔS"
          bindings={[
            { symbol: 'ΔH', value: `${dH} kJ/mol` },
            { symbol: 'T', value: `${temp} K` },
            { symbol: 'ΔS', value: `${dS} J/mol·K` },
          ]}
          result={`${gNow.toFixed(1)} kJ/mol`}
          assumption="ΔH and ΔS held constant with temperature — the standard approximation, and the reason the line is straight"
        />
        <span className="text-xs font-mono shrink-0" style={{ color: gNow < 0 ? GREEN : ORANGE }}>
          {gNow < 0 ? 'spontaneous' : 'non-spontaneous'}
        </span>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {REGIME_LABEL[regime]}. Set the signs of ΔH and ΔS, then press <em>Sweep T</em>: in the two
        temperature-dependent regimes the ΔG line crosses zero at T* = ΔH/ΔS and the dot flips from
        orange to green. Enthalpy and entropy pull against each other in the meter below; temperature
        decides who wins.
      </p>
    </div>
  )
}
