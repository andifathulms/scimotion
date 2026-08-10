'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useAnimationTrigger } from '@/hooks/useAnimationTrigger'

const W = 600
const H = 300
const CX = W / 2
const SX = 55
const TOP_AXIS = 82      // y = 0 line of the f panel
const BOT_AXIS = 232     // y = 0 line of the f′ panel
const DIVIDER = 158

const VIOLET = '#A78BFA'
const GOLD = '#F59E0B'
const BLUE = '#60A5FA'
const PINK = '#F472B6'
const GREEN = '#10B981'

const X_MIN = -5.2
const X_MAX = 5.2

type Func = 'sin' | 'cubic' | 'bump'

const FUNCS: Record<Func, {
  label: string
  dLabel: string
  f: (x: number) => number
  df: (x: number) => number
  syF: number
  syD: number
}> = {
  sin: {
    label: 'sin(x)',
    dLabel: 'cos(x)',
    f: x => Math.sin(x),
    df: x => Math.cos(x),
    syF: 52,
    syD: 52,
  },
  cubic: {
    label: 'x³/3 − x',
    dLabel: 'x² − 1',
    f: x => (x * x * x) / 3 - x,
    df: x => x * x - 1,
    syF: 16,
    syD: 12,
  },
  bump: {
    label: 'e^(−x²/2)',
    dLabel: '−x·e^(−x²/2)',
    f: x => Math.exp(-(x * x) / 2),
    df: x => -x * Math.exp(-(x * x) / 2),
    syF: 90,
    syD: 90,
  },
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function DerivativeFunctionAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const [fn, setFn] = useState<Func>('sin')
  const [x0, setX0] = useState(X_MIN)
  const [running, setRunning] = useState(false)

  const { ref, reset: triggerReset } = useAnimationTrigger({
    onTrigger: reduced => {
      if (!reduced) setRunning(true)
    },
  })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const { f, df, syF, syD, label, dLabel } = FUNCS[fn]
    const px = (x: number) => CX + x * SX
    const pyT = (y: number) => TOP_AXIS - y * syF
    const pyB = (y: number) => BOT_AXIS - y * syD

    // Grid
    ctx.strokeStyle = 'rgba(255,245,235,0.05)'
    ctx.lineWidth = 1
    for (let gx = -5; gx <= 5; gx++) {
      ctx.beginPath(); ctx.moveTo(px(gx), 0); ctx.lineTo(px(gx), H); ctx.stroke()
    }

    // Panel divider
    ctx.strokeStyle = 'rgba(255,245,235,0.12)'
    ctx.beginPath(); ctx.moveTo(0, DIVIDER); ctx.lineTo(W, DIVIDER); ctx.stroke()

    // Axes
    ctx.strokeStyle = 'rgba(255,245,235,0.18)'
    ctx.beginPath(); ctx.moveTo(0, TOP_AXIS); ctx.lineTo(W, TOP_AXIS); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, BOT_AXIS); ctx.lineTo(W, BOT_AXIS); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, DIVIDER); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(CX, DIVIDER); ctx.lineTo(CX, H); ctx.stroke()

    const plot = (
      g: (x: number) => number,
      mapY: (y: number) => number,
      color: string,
      width: number,
      upTo: number,
      lo: number,
      hi: number,
    ) => {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth = width
      let started = false
      for (let sxp = 0; sxp <= W; sxp++) {
        const x = (sxp - CX) / SX
        if (x > upTo) break
        const y = mapY(g(x))
        if (y < lo || y > hi) { started = false; continue }
        if (!started) { ctx.moveTo(sxp, y); started = true } else ctx.lineTo(sxp, y)
      }
      ctx.stroke()
    }

    // Full curves, faint
    plot(f, pyT, 'rgba(96,165,250,0.28)', 2, X_MAX, 2, DIVIDER - 2)
    plot(df, pyB, 'rgba(167,139,250,0.22)', 2, X_MAX, DIVIDER + 2, H - 2)

    // Traced portion, bright — f′ is being *drawn* as the point sweeps
    plot(f, pyT, BLUE, 2.5, x0, 2, DIVIDER - 2)
    plot(df, pyB, VIOLET, 2.5, x0, DIVIDER + 2, H - 2)

    const y0 = f(x0)
    const s = df(x0)

    // Tangent at the sweeping point
    const half = 1.1
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(px(x0 - half), pyT(y0 - s * half))
    ctx.lineTo(px(x0 + half), pyT(y0 + s * half))
    ctx.stroke()

    // Link line between the two panels
    ctx.strokeStyle = 'rgba(244,114,182,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(px(x0), clamp(pyT(y0), 2, DIVIDER))
    ctx.lineTo(px(x0), clamp(pyB(s), DIVIDER, H - 2))
    ctx.stroke()
    ctx.setLineDash([])

    // Markers
    const flat = Math.abs(s) < 0.06
    ctx.beginPath(); ctx.arc(px(x0), clamp(pyT(y0), 4, DIVIDER - 4), 5, 0, Math.PI * 2)
    ctx.fillStyle = flat ? GREEN : GOLD; ctx.fill()
    ctx.beginPath(); ctx.arc(px(x0), clamp(pyB(s), DIVIDER + 4, H - 4), 5, 0, Math.PI * 2)
    ctx.fillStyle = flat ? GREEN : PINK; ctx.fill()

    // Labels
    ctx.font = '11px monospace'
    ctx.fillStyle = BLUE
    ctx.fillText(`f(x) = ${label}`, 8, 16)
    ctx.fillStyle = VIOLET
    ctx.fillText(`f′(x) = ${dLabel}`, 8, DIVIDER + 18)
    ctx.fillStyle = flat ? GREEN : 'rgba(245,240,232,0.5)'
    ctx.fillText(flat ? 'flat tangent → f′ = 0' : `slope = ${s.toFixed(2)}`, W - 150, 16)
  }, [fn, x0])

  useEffect(() => { draw() }, [draw])

  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setX0(prev => {
        const next = prev + dt * 0.0018
        return next > X_MAX ? X_MIN : next
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
    setX0(X_MIN)
  }

  return (
    <div className="animation-block" ref={ref}>
      <div className="animation-header">
        <span className="animation-label"><Play size={13} /> Interactive · f and f′ Side by Side</span>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <RotateCcw size={12} /> Reset
        </button>
      </div>
      <div className="animation-canvas" style={{ minHeight: H + 10 }}>
        <canvas role="img" aria-label="Animated diagram: F and f′ Side by Side. Values are reported below the diagram." ref={canvasRef} width={W} height={H} className="w-full rounded-lg" style={{ background: 'var(--color-canvas)' }} />
      </div>
      <div className="animation-controls flex-wrap gap-3">
        <button
          onClick={() => setRunning(r => !r)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-gold text-bg-base text-xs font-medium hover:bg-accent-gold/90 transition-colors"
        >
          {running ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Sweep</>}
        </button>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(Object.keys(FUNCS) as Func[]).map(k => (
            <button key={k} onClick={() => { setFn(k); setX0(X_MIN); setRunning(false) }}
              className={`px-3 py-1.5 transition-colors font-mono ${fn === k ? 'bg-accent-gold text-bg-base' : 'text-text-secondary hover:bg-bg-hover'}`}>
              {FUNCS[k].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>x:</span>
          <input type="range" min={X_MIN} max={X_MAX} step={0.02} value={x0}
            onChange={e => { setX0(+e.target.value); setRunning(false) }}
            className="w-28 accent-accent-gold"
          />
          <span className="font-mono text-text-secondary w-10">{x0.toFixed(2)}</span>
        </label>
        <span className="ml-auto text-xs text-text-muted">
          Top = f · Bottom = f′ · green when the tangent goes flat
        </span>
      </div>
    </div>
  )
}
