'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

type Func = 'sin' | 'cos' | 'exp'

const W = 600
const H = 240
const CX = W / 2
const CY = H / 2
const SCALE_X = 50
const SCALE_Y = 80

const FUNCS: Record<Func, { label: string; exact: (x: number) => number; term: (x: number, n: number) => number; color: string }> = {
  sin: {
    label: 'sin(x)',
    color: '#F59E0B',
    exact: Math.sin,
    term: (x, n) => {
      const k = 2 * n + 1
      let fact = 1
      for (let i = 1; i <= k; i++) fact *= i
      return (Math.pow(-1, n) * Math.pow(x, k)) / fact
    },
  },
  cos: {
    label: 'cos(x)',
    color: '#A78BFA',
    exact: Math.cos,
    term: (x, n) => {
      const k = 2 * n
      let fact = 1
      for (let i = 1; i <= k; i++) fact *= i
      return (Math.pow(-1, n) * Math.pow(x, k)) / (k === 0 ? 1 : fact)
    },
  },
  exp: {
    label: 'eˣ',
    color: '#10B981',
    exact: Math.exp,
    term: (x, n) => {
      let fact = 1
      for (let i = 1; i <= n; i++) fact *= i
      return Math.pow(x, n) / fact
    },
  },
}

function drawChart(
  ctx: CanvasRenderingContext2D,
  fn: Func,
  terms: number,
) {
  ctx.clearRect(0, 0, W, H)

  // Grid
  ctx.strokeStyle = 'rgba(255,245,235,0.06)'
  ctx.lineWidth = 1
  for (let gx = -6; gx <= 6; gx++) {
    const px = CX + gx * SCALE_X
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke()
  }
  for (let gy = -3; gy <= 3; gy++) {
    const py = CY + gy * (SCALE_Y / 2)
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke()
  }

  // Axes
  ctx.strokeStyle = 'rgba(255,245,235,0.18)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(W, CY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, H); ctx.stroke()

  const f = FUNCS[fn]

  // Exact function
  ctx.beginPath()
  ctx.strokeStyle = `${f.color}50`
  ctx.lineWidth = 2
  for (let px = 0; px < W; px++) {
    const x = (px - CX) / SCALE_X
    const y = f.exact(x)
    const py = CY - y * SCALE_Y
    if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.stroke()

  // Taylor approximation
  ctx.beginPath()
  ctx.strokeStyle = f.color
  ctx.lineWidth = 2.5
  for (let px = 0; px < W; px++) {
    const x = (px - CX) / SCALE_X
    let sum = 0
    for (let n = 0; n < terms; n++) sum += f.term(x, n)
    const py = CY - Math.max(-H, Math.min(H, sum)) * SCALE_Y
    if (px === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
  }
  ctx.stroke()

  // Labels
  ctx.font = '11px monospace'
  ctx.fillStyle = 'rgba(245,240,232,0.35)'
  ctx.fillText('0', CX + 4, CY - 4)
  ctx.fillText('π', CX + Math.PI * SCALE_X - 4, CY - 4)
  ctx.fillText('-π', CX - Math.PI * SCALE_X - 14, CY - 4)
}

export function TaylorAnimation() {
  const { ref, triggered, reset: triggerReset, visible } = useAnimationTrigger()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fn, setFn] = useState<Func>('sin')
  const [terms, setTerms] = useState(1)
  const [running, setRunning] = useState(false)
  const [maxTerms] = useState(12)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawChart(ctx, fn, terms)
  }, [fn, terms])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (triggered && !running) {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(true)
    }
  }, [triggered]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running || !visible) return
    const id = setInterval(() => {
      setTerms(t => {
        if (t >= maxTerms) { setRunning(false); return t }
        return t + 1
      })
    }, 700)
    return () => clearInterval(id)
  }, [running, maxTerms, visible])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setTerms(1)
  }

  const termLabel = (fn === 'exp')
    ? `${terms} term${terms > 1 ? 's' : ''}`
    : `${terms} term${terms > 1 ? 's' : ''} (degree ${fn === 'sin' ? 2 * terms - 1 : 2 * (terms - 1)})`

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Taylor Series</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 20 }}>
        <canvas role="img" aria-label="Animated diagram: Taylor Series. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Add terms</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(FUNCS) as Func[]).map(f => (
            <button key={f} onClick={() => { setFn(f); setTerms(1); setRunning(false) }}
              className={`px-3 py-1.5 transition-colors ${fn === f ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {FUNCS[f].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Terms:</span>
          <input type="range" min={1} max={maxTerms} value={terms}
            onChange={e => { setTerms(+e.target.value); setRunning(false) }}
            className="w-24 accent-accent-gold"
          />
          <span className="text-text-secondary w-36">{termLabel}</span>
        </label>
        <span className="ml-auto text-xs text-text-muted">
          Faint = exact · Bright = approximation
        </span>
      </div>
    </div>
  )
}
