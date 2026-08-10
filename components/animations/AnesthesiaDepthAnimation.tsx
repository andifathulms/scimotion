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

const MAX_T = 120 // arbitrary time units on the axis
const Y_MAX = 120 // concentration units at the top of the plot
const DT = 0.5 // integration / time step per frame
const HALF_LIFE = 24 // elimination half-life of the agent (units)
const K = Math.LN2 / HALF_LIFE // elimination rate constant
const BOLUS = 26 // concentration jump from a single top-up dose

const AWARE_HI = 30 // below this, the patient is aware
const DANGER_LO = 72 // above this, vital functions are dangerously suppressed

const C_CURVE = '#F472B6' // pink — drug concentration in blood
const C_DANGER = '#F59E0B' // gold — over-deep / dangerous
const C_WINDOW = '#10B981' // green — safe surgical plane
const C_AWARE = '#60A5FA' // blue — too light, patient aware
const C_TARGET = '#A78BFA' // violet — steady-state target for the current rate

// Slider domains, declared once. The bounds on the inputs below and the values
// restored from the URL both read from here, so they cannot drift apart.
const SPEC = {
  rate: { default: 1.8, min: 0, max: 5, step: 0.1 },
}

export function AnesthesiaDepthAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const traceRef = useRef<number[]>([0])
  const concRef = useRef(0)
  const rateRef = useRef(1.8)

  const [running, setRunning] = useState(false)
  const { params, set, permalink, isDefault, restored } = useWidgetParams('anesthesia-depth', SPEC)
  const { rate } = params
  const [t, setT] = useState(0)
  const [conc, setConc] = useState(0)

  useEffect(() => { rateRef.current = rate }, [rate])

  const { ref } = useAnimationTrigger({
    onTrigger: reduced => {
      if (reduced) {
        // Fill a static steady-state trace so the plot is meaningful without motion.
        const ss = rateRef.current / K
        const arr: number[] = []
        for (let i = 0; i <= MAX_T / DT; i++) arr.push(ss * (1 - Math.exp(-K * i * DT)))
        traceRef.current = arr
        concRef.current = arr[arr.length - 1]
        setConc(concRef.current)
        setT(MAX_T)
        drawRef.current?.()
        return
      }
      setRunning(true)
    },
  })

  const xFor = useCallback((time: number) => PAD.left + (time / MAX_T) * PLOT_W, [])
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

    // Bands: aware (too light), safe window, danger (too deep)
    const bands: [number, number, string, string][] = [
      [0, AWARE_HI, `${C_AWARE}14`, 'aware — too light'],
      [AWARE_HI, DANGER_LO, `${C_WINDOW}1A`, 'safe surgical window'],
      [DANGER_LO, Y_MAX, `${C_DANGER}14`, 'danger — vital functions suppressed'],
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
    for (const edge of [AWARE_HI, DANGER_LO]) {
      ctx.beginPath()
      ctx.strokeStyle = edge === AWARE_HI ? `${C_AWARE}66` : `${C_DANGER}66`
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
    for (const c of [0, 40, 80, 120]) {
      ctx.textAlign = 'right'
      ctx.fillText(`${c}`, PAD.left - 6, yFor(c) + 3)
      ctx.textAlign = 'left'
    }
    ctx.fillText('drug concentration', PAD.left - 2, PAD.top - 12)
    for (let h = 0; h <= MAX_T; h += 20) {
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
    ctx.fillText('time →', PAD.left + PLOT_W - 40, H - 4)

    // Target steady state for the current infusion rate
    const ss = rateRef.current / K
    if (ss < Y_MAX) {
      ctx.beginPath()
      ctx.strokeStyle = `${C_TARGET}88`
      ctx.setLineDash([2, 5])
      ctx.lineWidth = 1
      ctx.moveTo(PAD.left, yFor(ss))
      ctx.lineTo(PAD.left + PLOT_W, yFor(ss))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C_TARGET
      ctx.textAlign = 'right'
      ctx.fillText('target for this rate', PAD.left + PLOT_W - 4, yFor(ss) - 4)
      ctx.textAlign = 'left'
    }

    // Concentration trace
    const pts = traceRef.current
    ctx.beginPath()
    ctx.strokeStyle = C_CURVE
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    pts.forEach((c, i) => {
      const x = xFor(i * DT)
      const y = yFor(c)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Leading dot
    const lastC = pts[pts.length - 1]
    const lastT = (pts.length - 1) * DT
    if (lastT > 0 && lastT <= MAX_T) {
      ctx.beginPath()
      ctx.arc(xFor(lastT), yFor(lastC), 4, 0, Math.PI * 2)
      ctx.fillStyle = C_CURVE
      ctx.fill()
    }
  }, [xFor, yFor])

  const drawRef = useRef(draw)
  useEffect(() => { drawRef.current = draw })
  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) { cancelAnimationFrame(animRef.current); return }
    const loop = () => {
      // Integrate dC/dt = rate − k·C  (one-compartment, Vd = 1)
      const next = concRef.current + (rateRef.current - K * concRef.current) * DT
      concRef.current = Math.max(0, next)
      traceRef.current = [...traceRef.current, concRef.current]
      const time = (traceRef.current.length - 1) * DT
      setConc(concRef.current)
      setT(time)
      if (time >= MAX_T) { setRunning(false); draw(); return }
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [running, draw])

  const giveBolus = () => {
    concRef.current = Math.min(Y_MAX, concRef.current + BOLUS)
    setConc(concRef.current)
    if (traceRef.current.length > 0) {
      traceRef.current = [...traceRef.current.slice(0, -1), concRef.current]
    }
    draw()
  }

  const resetAll = () => {
    setRunning(false)
    traceRef.current = [0]
    concRef.current = 0
    setConc(0)
    setT(0)
    set('rate', 1.8)
    rateRef.current = 1.8
    draw()
  }

  const status = conc > DANGER_LO ? 'too deep — danger' : conc >= AWARE_HI ? 'in the safe window' : 'too light — aware'
  const statusColor = conc > DANGER_LO ? C_DANGER : conc >= AWARE_HI ? C_WINDOW : C_AWARE

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Titrating into the window</span>
        <div className="flex items-center gap-3">
          <WidgetLink permalink={permalink} hidden={isDefault} restored={restored} />
          <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Titrating into the window. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Play</>}
        </button>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Infusion rate:</span>
          <input
            type="range" min={SPEC.rate.min} max={SPEC.rate.max} step={SPEC.rate.step} value={rate}
            onChange={e => set('rate', +e.target.value)}
            className="w-28 accent-accent-pink"
          />
          <span className="text-text-secondary font-mono">{rate.toFixed(1)}</span>
        </label>
        <button
          onClick={giveBolus}
          className="px-2 py-1 rounded text-xs font-medium border transition-colors"
          style={{ color: C_TARGET, borderColor: `${C_TARGET}44`, background: `${C_TARGET}12` }}
        >
          Give bolus
        </button>
        <span
          className="px-2 py-1 rounded text-xs font-medium border"
          style={{ color: statusColor, borderColor: `${statusColor}30`, background: `${statusColor}10` }}
        >
          {status}
        </span>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          t = {t.toFixed(0)} · C = {conc.toFixed(0)}
        </span>
      </div>
    </div>
  )
}
