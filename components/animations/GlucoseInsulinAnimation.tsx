'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, Pause, RotateCcw, Utensils } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 280
const PAD = { left: 44, right: 46, top: 34, bottom: 32 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const MAX_T = 6            // hours on the axis
const G_MAX = 300          // mg/dL at the top of the plot
const I_MAX = 250          // µU/mL at the top of the plot (right-hand axis)

const BAND_LO = 70         // mg/dL — bottom of the healthy band
const BAND_HI = 140        // mg/dL — top of the healthy post-meal band

// Minimal-model-style coupled ODEs (illustrative parameters, not clinical values).
const G_BASE = 90          // fasting glucose set point, mg/dL
const I_BASE = 8           // fasting insulin, µU/mL
const G_THRESH = 95        // glucose above which beta cells ramp secretion
const P1 = 0.10            // glucose effectiveness (insulin-independent disposal), /h
const SI_C = 0.022         // insulin action coefficient
const BETA_GAIN = 2.2      // beta-cell secretion gain
const I_CLEAR = 1.1        // insulin clearance, /h
const KA = 1.7             // meal absorption rate constant, /h
const MEAL_GAIN = 2.0      // mg/dL of appearance per gram of carbohydrate

const DT = 0.0025          // integration step, hours
const SAMPLE = 8           // store every 8th step
const SAMPLE_DT = DT * SAMPLE           // 0.02 h between stored samples
const N_SAMPLES = Math.round(MAX_T / SAMPLE_DT) + 1
const H_PER_FRAME = 0.022

const C_GLUCOSE = '#F472B6'  // pink
const C_INSULIN = '#F59E0B'  // gold
const C_BAND = '#10B981'     // green
const C_MEAL = '#A78BFA'     // violet
const C_BASE = '#60A5FA'     // blue

type Meal = { t: number; size: number }
type Trace = { g: number[]; ins: number[] }

const INITIAL_MEALS: Meal[] = [{ t: 0.5, size: 60 }]

function simulate(meals: Meal[], si: number, beta: number): Trace {
  const g: number[] = []
  const ins: number[] = []
  let G = G_BASE
  let I = I_BASE * beta
  const steps = Math.round(MAX_T / DT)
  for (let n = 0; n <= steps; n++) {
    if (n % SAMPLE === 0) {
      g.push(G)
      ins.push(I)
    }
    const t = n * DT
    let ra = 0
    for (const m of meals) {
      const u = t - m.t
      if (u > 0) ra += m.size * MEAL_GAIN * KA * KA * u * Math.exp(-KA * u)
    }
    const dG = -P1 * (G - G_BASE) - si * I * (G - G_BASE) * SI_C + ra
    const dI = beta * BETA_GAIN * Math.max(0, G - G_THRESH) - I_CLEAR * (I - I_BASE * beta)
    G = Math.max(30, G + dG * DT)
    I = Math.max(0, I + dI * DT)
  }
  return { g, ins }
}

export function GlucoseInsulinAnimation() {
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
  const [meals, setMeals] = useState<Meal[]>(INITIAL_MEALS)
  const [mealSize, setMealSize] = useState(60)
  const [sensitivity, setSensitivity] = useState(1)
  const [betaOn, setBetaOn] = useState(true)

  const beta = betaOn ? 1 : 0
  const trace = useMemo(() => simulate(meals, sensitivity, beta), [meals, sensitivity, beta])

  const idx = Math.max(0, Math.min(N_SAMPLES - 1, Math.round(t / SAMPLE_DT)))

  const xFor = useCallback((hours: number) => PAD.left + (hours / MAX_T) * PLOT_W, [])
  const yGlucose = useCallback(
    (v: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(v, G_MAX)) / G_MAX) * PLOT_H,
    []
  )
  const yInsulin = useCallback(
    (v: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(v, I_MAX)) / I_MAX) * PLOT_H,
    []
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.font = '9px monospace'
    ctx.textAlign = 'left'

    // Healthy band
    const bandTop = yGlucose(BAND_HI)
    const bandBot = yGlucose(BAND_LO)
    ctx.fillStyle = `${C_BAND}1A`
    ctx.fillRect(PAD.left, bandTop, PLOT_W, bandBot - bandTop)
    for (const edge of [BAND_LO, BAND_HI]) {
      ctx.beginPath()
      ctx.strokeStyle = `${C_BAND}66`
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, yGlucose(edge))
      ctx.lineTo(PAD.left + PLOT_W, yGlucose(edge))
      ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle = 'rgba(245,240,232,0.45)'
    ctx.fillText('healthy band  70–140 mg/dL', PAD.left + 5, bandTop + 11)

    // Fasting set point
    ctx.beginPath()
    ctx.strokeStyle = `${C_BASE}55`
    ctx.setLineDash([2, 5])
    ctx.lineWidth = 1
    ctx.moveTo(PAD.left, yGlucose(G_BASE))
    ctx.lineTo(PAD.left + PLOT_W, yGlucose(G_BASE))
    ctx.stroke()
    ctx.setLineDash([])

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, PAD.top)
    ctx.lineTo(PAD.left, PAD.top + PLOT_H)
    ctx.lineTo(PAD.left + PLOT_W, PAD.top + PLOT_H)
    ctx.stroke()

    ctx.fillStyle = `${C_GLUCOSE}AA`
    ctx.textAlign = 'right'
    for (const v of [0, 100, 200, 300]) ctx.fillText(`${v}`, PAD.left - 6, yGlucose(v) + 3)
    ctx.fillStyle = `${C_INSULIN}AA`
    ctx.textAlign = 'left'
    for (const v of [0, 125, 250]) ctx.fillText(`${v}`, PAD.left + PLOT_W + 6, yInsulin(v) + 3)

    ctx.fillStyle = 'rgba(245,240,232,0.35)'
    ctx.textAlign = 'left'
    for (let h = 0; h <= MAX_T; h += 1) {
      const x = xFor(h)
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(245,240,232,0.12)'
      ctx.moveTo(x, PAD.top + PLOT_H)
      ctx.lineTo(x, PAD.top + PLOT_H + 4)
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillText(`${h}`, x, PAD.top + PLOT_H + 15)
    }
    ctx.textAlign = 'right'
    ctx.fillText('hours after the meal →', PAD.left + PLOT_W, H - 4)
    ctx.textAlign = 'left'

    // Meal markers
    for (const m of meals) {
      if (m.t > t) continue
      const x = xFor(m.t)
      ctx.beginPath()
      ctx.strokeStyle = C_MEAL
      ctx.setLineDash([3, 3])
      ctx.lineWidth = 1.25
      ctx.moveTo(x, PAD.top - 6)
      ctx.lineTo(x, PAD.top + PLOT_H)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_MEAL
      ctx.textAlign = 'center'
      ctx.fillText(`${m.size} g`, x, PAD.top - 10)
      ctx.textAlign = 'left'
    }

    // Curves
    const series: { color: string; data: number[]; map: (v: number) => number; width: number }[] = [
      { color: C_INSULIN, data: trace.ins, map: yInsulin, width: 2 },
      { color: C_GLUCOSE, data: trace.g, map: yGlucose, width: 2.5 },
    ]
    for (const s of series) {
      ctx.beginPath()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineJoin = 'round'
      for (let i = 0; i <= idx; i++) {
        const x = xFor(i * SAMPLE_DT)
        const y = s.map(s.data[i])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      if (t > 0 && t < MAX_T) {
        ctx.beginPath()
        ctx.arc(xFor(idx * SAMPLE_DT), s.map(s.data[idx]), 3.75, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.fill()
      }
    }

    // Legend
    ctx.font = '10px monospace'
    const legend: [string, string][] = [
      [C_GLUCOSE, 'blood glucose (mg/dL)'],
      [C_INSULIN, 'plasma insulin (µU/mL)'],
    ]
    let lx = PAD.left
    for (const [color, label] of legend) {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.moveTo(lx, 15)
      ctx.lineTo(lx + 16, 15)
      ctx.stroke()
      ctx.fillStyle = 'rgba(245,240,232,0.65)'
      ctx.fillText(label, lx + 22, 18)
      lx += 26 + ctx.measureText(label).width + 24
    }
  }, [meals, t, idx, trace, xFor, yGlucose, yInsulin])

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

  const lastMealT = meals.length ? meals[meals.length - 1].t : -Infinity
  const canEat = t >= lastMealT + 1 && t <= MAX_T - 1.5

  const eat = () => {
    if (!canEat) return
    setMeals(prev => [...prev, { t, size: mealSize }])
    setRunning(true)
  }

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setT(0)
    setMeals(INITIAL_MEALS)
    setMealSize(60)
    setSensitivity(1)
    setBetaOn(true)
  }

  const glucose = trace.g[idx]
  const insulin = trace.ins[idx]
  let peak = 0
  let aboveBand = 0
  for (let i = 0; i <= idx; i++) {
    if (trace.g[i] > peak) peak = trace.g[i]
    if (trace.g[i] > BAND_HI) aboveBand += SAMPLE_DT
  }
  const inBand = glucose >= BAND_LO && glucose <= BAND_HI
  const stateColor = inBand ? C_BAND : C_GLUCOSE

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · The postprandial excursion and its return</span>
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
        <button
          onClick={eat}
          disabled={!canEat}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-pink text-bg-base text-xs font-medium hover:bg-accent-pink/90 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Utensils size={12} /> Eat now
        </button>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Meal:</span>
          <input
            type="range" min={20} max={110} step={5} value={mealSize}
            onChange={e => setMealSize(+e.target.value)}
            className="w-20 accent-accent-violet"
          />
          <span className="text-text-secondary font-mono">{mealSize} g</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Insulin sensitivity:</span>
          <input
            type="range" min={0.15} max={1.5} step={0.05} value={sensitivity}
            onChange={e => { setSensitivity(+e.target.value); setT(0) }}
            className="w-24 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{sensitivity.toFixed(2)}×</span>
        </div>
        <button
          onClick={() => { setBetaOn(b => !b); setT(0) }}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={
            betaOn
              ? { color: 'rgba(245,240,232,0.5)', borderColor: 'rgba(245,240,232,0.15)', background: 'rgba(245,240,232,0.04)' }
              : { color: C_MEAL, borderColor: `${C_MEAL}44`, background: `${C_MEAL}12` }
          }
        >
          {betaOn ? 'Silence beta cells' : 'Beta cells silenced'}
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: stateColor, borderColor: `${stateColor}30`, background: `${stateColor}10` }}
        >
          {inBand ? 'inside the band' : glucose > BAND_HI ? 'above the band' : 'below the band'}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          t = {t.toFixed(1)} h · G = {glucose.toFixed(0)} · I = {insulin.toFixed(0)} · peak {peak.toFixed(0)} · {aboveBand.toFixed(1)} h above 140
        </span>
      </div>
    </div>
  )
}
