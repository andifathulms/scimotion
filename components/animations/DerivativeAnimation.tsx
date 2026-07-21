'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 270
const CX = W / 2
const CY = 150
const SX = 70

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

type Func = 'cubic' | 'sin' | 'quad'

const FUNCS: Record<Func, {
  label: string
  f: (x: number) => number
  df: (x: number) => number
  sy: number
  initA: number
}> = {
  cubic: {
    label: 'x³/6 − x',
    sy: 18,
    initA: -1.4,
    f: x => (x * x * x) / 6 - x,
    df: x => (x * x) / 2 - 1,
  },
  sin: {
    label: 'sin(x)',
    sy: 46,
    initA: -1.0,
    f: x => Math.sin(x),
    df: x => Math.cos(x),
  },
  quad: {
    label: 'x²/2',
    sy: 22,
    initA: 1.2,
    f: x => (x * x) / 2,
    df: x => x,
  },
}

const A_MIN = -3.2
const A_MAX = 3.2

// The h slider is logarithmic: t = 0 gives h = 2, t = 100 gives h = 0.02.
const H_MAX = 2
const hFromT = (t: number) => H_MAX * Math.pow(10, -t / 50)

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function DerivativeAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const [fn, setFn] = useState<Func>('cubic')
  const [a, setA] = useState(FUNCS.cubic.initA)
  const [t, setT] = useState(0)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const h = hFromT(t)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const { f, df, sy } = FUNCS[fn]
    const px = (x: number) => CX + x * SX
    const py = (y: number) => CY - y * sy

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = -4; gx <= 4; gx++) {
      ctx.beginPath(); ctx.moveTo(px(gx), 0); ctx.lineTo(px(gx), H); ctx.stroke()
    }
    for (let gy = -3; gy <= 3; gy++) {
      const y = CY + gy * 40
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(W, CY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, H); ctx.stroke()

    // Curve
    ctx.beginPath()
    ctx.strokeStyle = BLUE
    ctx.lineWidth = 2
    let started = false
    for (let sxp = 0; sxp <= W; sxp++) {
      const x = (sxp - CX) / SX
      const y = py(f(x))
      if (y < -H || y > 2 * H) { started = false; continue }
      if (!started) { ctx.moveTo(sxp, y); started = true } else ctx.lineTo(sxp, y)
    }
    ctx.stroke()

    const b = clamp(a + h, -4.2, 4.2)
    const fa = f(a)
    const fb = f(b)
    const slope = (fb - fa) / (b - a)
    const exact = df(a)

    // Rise / run triangle
    ctx.strokeStyle = 'rgba(245,158,11,0.45)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(px(a), py(fa))
    ctx.lineTo(px(b), py(fa))
    ctx.lineTo(px(b), py(fb))
    ctx.stroke()
    ctx.setLineDash([])

    // Tangent (the limit we are heading toward)
    ctx.strokeStyle = VIOLET
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(0, py(fa + exact * ((0 - CX) / SX - a)))
    ctx.lineTo(W, py(fa + exact * ((W - CX) / SX - a)))
    ctx.stroke()
    ctx.setLineDash([])

    // Secant, drawn across the whole canvas so its rotation is visible
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, py(fa + slope * ((0 - CX) / SX - a)))
    ctx.lineTo(W, py(fa + slope * ((W - CX) / SX - a)))
    ctx.stroke()

    // Points
    ctx.beginPath(); ctx.arc(px(b), py(fb), 5, 0, Math.PI * 2)
    ctx.fillStyle = PINK; ctx.fill()
    ctx.beginPath(); ctx.arc(px(a), py(fa), 5.5, 0, Math.PI * 2)
    ctx.fillStyle = GOLD; ctx.fill()

    // Labels
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(245,240,232,0.55)'
    ctx.fillText('x', clamp(px(a) - 3, 2, W - 40), clamp(py(fa) + 20, 12, H - 4))
    ctx.fillText('x+h', clamp(px(b) - 8, 2, W - 40), clamp(py(fb) - 12, 12, H - 4))

    ctx.font = '11px monospace'
    ctx.fillStyle = GOLD
    ctx.fillText('secant slope', 8, 16)
    ctx.fillStyle = VIOLET
    ctx.fillText('tangent = f′(x)', 8, 32)
  }, [fn, a, h])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setT(prev => {
        const next = prev + dt * 0.035
        if (next >= 100) { setRunning(false); return 100 }
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [running])

  const resetAll = () => {
    triggerReset()
    setRunning(false)
    setT(0)
  }

  const quotient = (FUNCS[fn].f(a + h) - FUNCS[fn].f(a)) / h
  const exact = FUNCS[fn].df(a)
  const err = Math.abs(quotient - exact)

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · Secant to Tangent</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: '#0F0D0A' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => { if (t >= 100) setT(0); setRunning(r => !r) }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Shrink h</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(FUNCS) as Func[]).map(k => (
            <button key={k} onClick={() => { setFn(k); setA(FUNCS[k].initA); setT(0); setRunning(false) }}
              className={`px-3 py-1.5 transition-colors font-mono ${fn === k ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {FUNCS[k].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>h:</span>
          <input type="range" min={0} max={100} step={0.5} value={t}
            onChange={e => { setT(+e.target.value); setRunning(false) }}
            className="w-24 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary w-14">{h.toFixed(3)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>base x:</span>
          <input type="range" min={A_MIN} max={A_MAX} step={0.05} value={a}
            onChange={e => setA(+e.target.value)}
            className="w-20 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary w-10">{a.toFixed(2)}</span>
        </div>
        <span className="ml-auto text-xs text-text-secondary font-mono">
          quotient <strong style={{ color: GOLD }}>{quotient.toFixed(4)}</strong>
          {' → '}
          f′ <strong style={{ color: VIOLET }}>{exact.toFixed(4)}</strong>
          <span style={{ color: err < 0.01 ? GREEN : 'inherit' }}> (gap {err.toFixed(4)})</span>
        </span>
      </div>
    </div>
  )
}
