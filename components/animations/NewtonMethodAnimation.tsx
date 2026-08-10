'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'
import { WidgetStatus } from '@/components/WidgetStatus'

const W = 600
const H = 260
const CX = W / 2
const CY = H / 2
const SX = 60
const SY = 80

type Func = 'cubic' | 'sin' | 'quad'
const FUNCS: Record<Func, {
  label: string
  f: (x: number) => number
  df: (x: number) => number
  color: string
  initX: number
}> = {
  cubic: {
    label: 'x³ − x − 2',
    color: '#F59E0B',
    initX: 2.5,
    f: x => x * x * x - x - 2,
    df: x => 3 * x * x - 1,
  },
  sin: {
    label: 'sin(x) − 0.5',
    color: '#A78BFA',
    initX: 2.2,
    f: x => Math.sin(x) - 0.5,
    df: x => Math.cos(x),
  },
  quad: {
    label: 'x² − 4',
    color: '#10B981',
    initX: 3.5,
    f: x => x * x - 4,
    df: x => 2 * x,
  },
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function NewtonMethodAnimation() {
  const { ref, triggered, reset: triggerReset } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fn, setFn] = useState<Func>('cubic')
  const [startX, setStartX] = useState(FUNCS.cubic.initX)
  const [iterates, setIterates] = useState<number[]>([])
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)
  const [converged, setConverged] = useState(false)

  const buildIterates = useCallback((f: Func, x0: number): number[] => {
    const { f: fn, df } = FUNCS[f]
    const pts = [x0]
    let x = x0
    for (let i = 0; i < 12; i++) {
      const dfx = df(x)
      if (Math.abs(dfx) < 1e-9) break
      const xn = x - fn(x) / dfx
      pts.push(xn)
      if (Math.abs(xn - x) < 1e-8) break
      x = xn
    }
    return pts
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const { f: func, df, color } = FUNCS[fn]

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = -5; gx <= 5; gx++) {
      const px = CX + gx * SX
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
    }
    for (let gy = -3; gy <= 3; gy++) {
      const py = CY + gy * (SY / 2)
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(W, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, H); ctx.stroke()

    // Function curve
    ctx.beginPath()
    ctx.strokeStyle = `${color}80`
    ctx.lineWidth = 2
    for (let px = 0; px < W; px++) {
      const x = (px - CX) / SX
      const y = func(x)
      const py = CY - clamp(y * SY, -H * 2, H * 2)
      if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // Newton iterations
    const iters = iterates.slice(0, step + 1)
    for (let i = 0; i < iters.length - 1; i++) {
      const x0 = iters[i]
      const y0 = func(x0)
      const slope = df(x0)
      const px0 = CX + x0 * SX
      const py0 = CY - y0 * SY

      // Vertical drop from x_n to curve
      const alpha = (i + 1) / iters.length
      ctx.strokeStyle = `rgba(251,146,60,${alpha * 0.7})`
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(px0, CY)
      ctx.lineTo(px0, py0)
      ctx.stroke()
      ctx.setLineDash([])

      // Tangent line
      const tangentExtend = 1.2
      const txLeft = x0 - tangentExtend
      const txRight = x0 + tangentExtend
      const tyLeft = y0 + slope * (txLeft - x0)
      const tyRight = y0 + slope * (txRight - x0)

      ctx.strokeStyle = `rgba(245,158,11,${alpha * 0.8})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(CX + txLeft * SX, CY - tyLeft * SY)
      ctx.lineTo(CX + txRight * SX, CY - tyRight * SY)
      ctx.stroke()

      // Dot at curve contact point
      ctx.beginPath()
      ctx.arc(px0, py0, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#FB923C'
      ctx.fill()

      // x_n label
      ctx.fillStyle = 'rgba(245,158,11,0.7)'
      ctx.font = '10px monospace'
      ctx.fillText(`x${i}`, px0 - 6, CY + 14)
    }

    // Current x marker on axis
    if (iters.length > 0) {
      const curX = iters[iters.length - 1]
      const pxCur = CX + curX * SX
      ctx.beginPath()
      ctx.arc(pxCur, CY, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Root approx label
      ctx.fillStyle = color
      ctx.font = '11px monospace'
      const label = `x=${curX.toFixed(6)}`
      ctx.fillText(label, clamp(pxCur - 40, 2, W - 80), H - 8)
    }
  }, [fn, iterates, step])

  useEffect(() => {
    const its = buildIterates(fn, startX)
    setIterates(its)
    setStep(0)
    setConverged(false)
    setRunning(false)
  }, [fn, startX, buildIterates])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setStep(s => {
        const next = s + 1
        if (next >= iterates.length - 1) {
          setRunning(false)
          setConverged(true)
          return iterates.length - 1
        }
        return next
      })
    }, 900)
    return () => clearInterval(id)
  }, [running, iterates])

  useEffect(() => {
    if (triggered && step === 0) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setStep(0)
    setConverged(false)
  }

  const root = iterates.length > 0 ? iterates[iterates.length - 1] : null

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Newton&apos;s Method</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: Newton&apos;s Method. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Step</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(FUNCS) as Func[]).map(f => (
            <button key={f} onClick={() => { setFn(f); setStartX(FUNCS[f].initX) }}
              className={`px-3 py-1.5 transition-colors font-mono ${fn === f ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {FUNCS[f].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Start x₀:</span>
          <input type="range" min={-4} max={4} step={0.1} value={startX}
            onChange={e => setStartX(+e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span className="font-mono">{startX.toFixed(1)}</span>
        </label>
        <WidgetStatus className="ml-auto text-xs text-text-secondary">
          {converged && root !== null
            ? <>Root ≈ <strong className="text-accent-gold font-mono">{root.toFixed(6)}</strong> in {iterates.length - 1} steps</>
            : <>Step <strong className="text-accent-gold">{step}</strong> / {iterates.length - 1}</>
          }
        </WidgetStatus>
      </div>
    </div>
  )
}
